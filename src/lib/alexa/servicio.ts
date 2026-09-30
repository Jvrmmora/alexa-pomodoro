import { DURACION_MIN, reconciliar, tipoDescanso } from '../ciclo';
import type { SessionRepository } from '../repositories/SessionRepository';
import { rangoDia } from '../tiempo';
import type { TipoSesion } from '../tipos';
import type { TimerGateway } from './timers';

export interface Deps {
  repo: SessionRepository;
  timers: TimerGateway;
  ownerId: string;
  ahora: Date;
}

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

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

/** Inicia un bloque. Si el timer falla no se guarda nada; si la BD falla se cancela el timer. */
export async function iniciarBloque(d: Deps, pedido: 'FOCO' | 'DESCANSO', tarea?: string): Promise<string> {
  const activa = await reconciliar(d.repo, d.ownerId, d.ahora);
  if (activa) {
    return `Ya tienes un ${NOMBRE[activa.tipo]} en curso. Faltan ${decirDuracion(activa.finEsperado.getTime() - d.ahora.getTime())}. Di cancela el bloque si quieres detenerlo.`;
  }

  const estado = await d.repo.obtenerEstado(d.ownerId);
  const tipo: TipoSesion = pedido === 'FOCO' ? 'FOCO' : tipoDescanso(estado.focosEnCiclo);
  const tareaLimpia = tarea?.trim() || undefined;

  const timerId = await d.timers.crear(tipo, tareaLimpia);
  try {
    const sesion = await d.repo.crearSesion({
      ownerId: d.ownerId, tipo, tarea: tareaLimpia, inicio: d.ahora,
      finEsperado: new Date(d.ahora.getTime() + DURACION_MIN[tipo] * 60_000),
      estado: 'ACTIVA', timerId, origen: 'VOZ',
    });
    estado.sesionActivaId = sesion._id;
    await d.repo.guardarEstado(estado);
  } catch (e) {
    await d.timers.cancelar(timerId).catch(() => undefined);
    throw e;
  }

  const min = DURACION_MIN[tipo];
  if (tipo === 'FOCO') {
    return tareaLimpia
      ? `Listo, ${min} minutos de foco en ${tareaLimpia}.`
      : `Listo, ${min} minutos de foco. Empieza.`;
  }
  return `Descansa ${min} minutos${tipo === 'DESCANSO_LARGO' ? ', te lo ganaste con cuatro focos' : ''}.`;
}

export async function cancelarBloque(d: Deps): Promise<string> {
  const activa = await reconciliar(d.repo, d.ownerId, d.ahora);
  if (!activa) return 'No tienes ningún bloque activo.';

  if (activa.timerId) await d.timers.cancelar(activa.timerId).catch(() => undefined);
  await d.repo.actualizarSesion(activa._id, { estado: 'INTERRUMPIDA', fin: d.ahora });
  const estado = await d.repo.obtenerEstado(d.ownerId);
  estado.sesionActivaId = undefined;
  await d.repo.guardarEstado(estado);
  return `Cancelé tu ${NOMBRE[activa.tipo]}.`;
}

export async function consultarTiempo(d: Deps): Promise<string> {
  const activa = await reconciliar(d.repo, d.ownerId, d.ahora);
  if (!activa) return 'No tienes ningún bloque activo. Di empieza a enfocarme para iniciar uno.';
  return `Faltan ${decirDuracion(activa.finEsperado.getTime() - d.ahora.getTime())} de tu ${NOMBRE[activa.tipo]}.`;
}

export async function resumenDelDia(d: Deps): Promise<string> {
  await reconciliar(d.repo, d.ownerId, d.ahora);
  const { desde, hasta } = rangoDia(d.ahora);
  const ok = await d.repo.contarFocos(d.ownerId, desde, hasta, 'COMPLETADA');
  const cortados = await d.repo.contarFocos(d.ownerId, desde, hasta, 'INTERRUMPIDA');
  if (ok === 0 && cortados === 0) return 'Hoy todavía no has hecho ningún pomodoro.';
  const partes = [`Hoy completaste ${plural(ok, 'pomodoro', 'pomodoros')}`];
  if (cortados > 0) partes.push(`y ${plural(cortados, 'quedó interrumpido', 'quedaron interrumpidos')}`);
  return partes.join(' ') + '.';
}
