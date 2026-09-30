import { FOCOS_POR_CICLO, LIMITES_MIN, duracionDe, reconciliar, tipoDescanso } from '../ciclo';
import type { SessionRepository } from '../repositories/SessionRepository';
import { rangoDia } from '../tiempo';
import type { Sesion, TipoSesion } from '../tipos';
import { ANUNCIO_FIN, type EspecTimer, type TimerGateway } from './timers';

export interface Deps {
  repo: SessionRepository;
  timers: TimerGateway;
  ownerId: string;
  ahora: Date;
}

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;
const reconciliarDeps = (d: Deps) => reconciliar(d.repo, d.ownerId, d.ahora);

export function decirDuracion(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const min = Math.floor(total / 60);
  const seg = total % 60;
  if (min === 0) return plural(seg, 'segundo', 'segundos');
  if (min >= 5) return plural(seg > 0 ? min + 1 : min, 'minuto', 'minutos');
  if (seg === 0) return plural(min, 'minuto', 'minutos');
  return `${plural(min, 'minuto', 'minutos')} y ${plural(seg, 'segundo', 'segundos')}`;
}

const NOMBRE: Record<TipoSesion, string> = {
  FOCO: 'foco', DESCANSO_CORTO: 'descanso corto', DESCANSO_LARGO: 'descanso largo',
};

const cancelarTimers = async (d: Deps, s: Sesion) => {
  for (const id of [s.timerId, s.siguiente?.timerId]) {
    if (id) await d.timers.cancelar(id).catch(() => undefined);
  }
};

/**
 * Inicia un bloque. Con el encadenado activo, un foco programa también el descanso que le sigue
 * (Alexa no deja lanzar el siguiente bloque sola: se pre-programan los dos timers).
 * Si falla un timer no se guarda nada; si falla la BD se cancelan los timers creados.
 */
export async function iniciarBloque(d: Deps, pedido: 'FOCO' | 'DESCANSO', tarea?: string): Promise<string> {
  const activa = await reconciliarDeps(d);
  if (activa) {
    return `Ya tienes un ${NOMBRE[activa.tipo]} en curso. Faltan ${decirDuracion(activa.finEsperado.getTime() - d.ahora.getTime())}. Di cancela el bloque si quieres detenerlo.`;
  }

  const estado = await d.repo.obtenerEstado(d.ownerId);
  const tipo: TipoSesion = pedido === 'FOCO' ? 'FOCO' : tipoDescanso(estado.focosEnCiclo);
  const tareaLimpia = tarea?.trim() || undefined;
  const minutos = duracionDe(estado, tipo);

  const encadenado = pedido === 'FOCO' && estado.encadenar
    ? { tipo: tipoDescanso(Math.min(estado.focosEnCiclo + 1, FOCOS_POR_CICLO)) }
    : null;
  const minutosDescanso = encadenado ? duracionDe(estado, encadenado.tipo) : 0;

  const creados: string[] = [];
  const crear = async (spec: EspecTimer) => { const id = await d.timers.crear(spec); creados.push(id); return id; };
  const deshacer = () => Promise.all(creados.map((id) => d.timers.cancelar(id).catch(() => undefined)));

  try {
    const timerId = await crear({
      tipo, tarea: tareaLimpia, minutos,
      anuncio: encadenado ? `Terminó tu foco. Descansa ${minutosDescanso} minutos.` : ANUNCIO_FIN[tipo],
    });
    const siguiente = encadenado
      ? {
          tipo: encadenado.tipo, minutos: minutosDescanso,
          timerId: await crear({ tipo: encadenado.tipo, minutos: minutos + minutosDescanso, anuncio: ANUNCIO_FIN[encadenado.tipo] }),
        }
      : undefined;

    const sesion = await d.repo.crearSesion({
      ownerId: d.ownerId, tipo, tarea: tareaLimpia, inicio: d.ahora,
      finEsperado: new Date(d.ahora.getTime() + minutos * 60_000),
      estado: 'ACTIVA', timerId, origen: 'VOZ', ...(siguiente ? { siguiente } : {}),
    });
    estado.sesionActivaId = sesion._id;
    await d.repo.guardarEstado(estado);
  } catch (e) {
    await deshacer();
    throw e;
  }

  if (tipo === 'FOCO') {
    const base = tareaLimpia ? `Listo, ${minutos} minutos de foco en ${tareaLimpia}.` : `Listo, ${minutos} minutos de foco. Empieza.`;
    return encadenado ? `${base} Después descansas ${minutosDescanso} minutos, yo te aviso.` : base;
  }
  return `Descansa ${minutos} minutos${tipo === 'DESCANSO_LARGO' ? ', te lo ganaste con cuatro focos' : ''}.`;
}

export async function cancelarBloque(d: Deps): Promise<string> {
  const activa = await reconciliarDeps(d);
  if (!activa) return 'No tienes ningún bloque activo.';

  await cancelarTimers(d, activa);
  await d.repo.actualizarSesion(activa._id, { estado: 'INTERRUMPIDA', fin: d.ahora, siguiente: undefined });
  const estado = await d.repo.obtenerEstado(d.ownerId);
  estado.sesionActivaId = undefined;
  await d.repo.guardarEstado(estado);
  return `Cancelé tu ${NOMBRE[activa.tipo]}.`;
}

export async function consultarTiempo(d: Deps): Promise<string> {
  const activa = await reconciliarDeps(d);
  if (!activa) return 'No tienes ningún bloque activo. Di empieza a enfocarme para iniciar uno.';
  return `Faltan ${decirDuracion(activa.finEsperado.getTime() - d.ahora.getTime())} de tu ${NOMBRE[activa.tipo]}.`;
}

export async function resumenDelDia(d: Deps): Promise<string> {
  await reconciliarDeps(d);
  const { desde, hasta } = rangoDia(d.ahora);
  const ok = await d.repo.contarFocos(d.ownerId, desde, hasta, 'COMPLETADA');
  const cortados = await d.repo.contarFocos(d.ownerId, desde, hasta, 'INTERRUMPIDA');
  if (ok === 0 && cortados === 0) return 'Hoy todavía no has hecho ningún pomodoro.';
  const partes = [`Hoy completaste ${plural(ok, 'pomodoro', 'pomodoros')}`];
  if (cortados > 0) partes.push(`y ${plural(cortados, 'quedó interrumpido', 'quedaron interrumpidos')}`);
  return partes.join(' ') + '.';
}

export async function configurarDuracion(d: Deps, tipo: TipoSesion, minutos: number): Promise<string> {
  const [min, max] = LIMITES_MIN[tipo];
  if (!Number.isInteger(minutos) || minutos < min || minutos > max) {
    return `El ${NOMBRE[tipo]} puede durar entre ${min} y ${max} minutos.`;
  }
  const estado = await d.repo.obtenerEstado(d.ownerId);
  estado.duraciones = { ...estado.duraciones, [tipo]: minutos };
  await d.repo.guardarEstado(estado);
  return `Listo, el ${NOMBRE[tipo]} ahora dura ${plural(minutos, 'minuto', 'minutos')}. Aplica desde el próximo bloque.`;
}

export async function restablecerDuraciones(d: Deps): Promise<string> {
  const estado = await d.repo.obtenerEstado(d.ownerId);
  estado.duraciones = undefined;
  await d.repo.guardarEstado(estado);
  return `Listo, volví a 25 minutos de foco, 5 de descanso corto y 15 de descanso largo.`;
}

export async function configurarEncadenado(d: Deps, activar: boolean): Promise<string> {
  const estado = await d.repo.obtenerEstado(d.ownerId);
  estado.encadenar = activar;
  await d.repo.guardarEstado(estado);
  return activar
    ? 'Listo, cada foco que empieces programará también su descanso y te avisaré cuando toque.'
    : 'Listo, ya no programaré el descanso con cada foco.';
}
