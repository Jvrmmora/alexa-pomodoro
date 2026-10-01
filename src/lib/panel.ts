import { duracionDe, reconciliar } from './ciclo';
import type { SessionRepository } from './repositories/SessionRepository';
import { rangoDia, rangoSemana } from './tiempo';
import { ZONA_HORARIA, type EstadoSesion, type Sesion, type TipoSesion } from './tipos';

export interface SesionVista {
  id: string;
  tipo: TipoSesion;
  tarea?: string;
  estado: EstadoSesion;
  inicio: string;
  finEsperado: string;
  minutos: number;
  siguiente?: { tipo: TipoSesion; minutos: number };
}

export interface DiaSemana {
  etiqueta: string;
  esHoy: boolean;
  completados: number;
  interrumpidos: number;
}

export interface DatosPanel {
  ahora: string;
  activa: SesionVista | null;
  focosEnCiclo: number;
  config: { foco: number; descansoCorto: number; descansoLargo: number; encadenar: boolean };
  hoy: { completados: number; interrumpidos: number; minutosEnfocados: number; sesiones: SesionVista[] };
  semana: DiaSemana[];
}

const DIA_MS = 24 * 3600_000;

const aVista = (s: Sesion): SesionVista => ({
  id: s._id,
  tipo: s.tipo,
  tarea: s.tarea,
  estado: s.estado,
  inicio: s.inicio.toISOString(),
  finEsperado: s.finEsperado.toISOString(),
  // Duración real si ya terminó; la planeada mientras está activa.
  siguiente: s.siguiente ? { tipo: s.siguiente.tipo, minutos: s.siguiente.minutos } : undefined,
  minutos: Math.max(0, Math.round(((s.fin ?? s.finEsperado).getTime() - s.inicio.getTime()) / 60_000)),
});

const etiquetaDia = (d: Date) =>
  new Intl.DateTimeFormat('es-CO', { timeZone: ZONA_HORARIA, weekday: 'short' }).format(d).replace('.', '');

/** Todo lo que necesita el panel en una sola lectura. Reconcilia antes de leer. */
export async function cargarPanel(repo: SessionRepository, ownerId: string, ahora: Date): Promise<DatosPanel> {
  const activa = await reconciliar(repo, ownerId, ahora);
  const estado = await repo.obtenerEstado(ownerId);

  const semana = rangoSemana(ahora);
  const dia = rangoDia(ahora);
  const sesionesSemana = await repo.listarSesiones(ownerId, semana.desde, semana.hasta);
  const focos = sesionesSemana.filter((s) => s.tipo === 'FOCO');

  const dias: DiaSemana[] = Array.from({ length: 7 }, (_, i) => {
    const desde = new Date(semana.desde.getTime() + i * DIA_MS);
    const hasta = new Date(desde.getTime() + DIA_MS);
    const delDia = focos.filter((s) => s.inicio >= desde && s.inicio < hasta);
    return {
      etiqueta: etiquetaDia(new Date(desde.getTime() + DIA_MS / 2)),
      esHoy: desde.getTime() === dia.desde.getTime(),
      completados: delDia.filter((s) => s.estado === 'COMPLETADA').length,
      interrumpidos: delDia.filter((s) => s.estado === 'INTERRUMPIDA').length,
    };
  });

  const deHoy = sesionesSemana.filter((s) => s.inicio >= dia.desde && s.inicio < dia.hasta);
  const focosHoy = deHoy.filter((s) => s.tipo === 'FOCO');
  const vistas = deHoy.map(aVista);

  return {
    ahora: ahora.toISOString(),
    activa: activa ? aVista(activa) : null,
    focosEnCiclo: estado.focosEnCiclo,
    config: {
      foco: duracionDe(estado, 'FOCO'), descansoCorto: duracionDe(estado, 'DESCANSO_CORTO'),
      descansoLargo: duracionDe(estado, 'DESCANSO_LARGO'), encadenar: estado.encadenar ?? false,
    },
    hoy: {
      completados: focosHoy.filter((s) => s.estado === 'COMPLETADA').length,
      interrumpidos: focosHoy.filter((s) => s.estado === 'INTERRUMPIDA').length,
      minutosEnfocados: vistas.filter((v) => v.tipo === 'FOCO' && v.estado === 'COMPLETADA').reduce((t, v) => t + v.minutos, 0),
      sesiones: vistas,
    },
    semana: dias,
  };
}
