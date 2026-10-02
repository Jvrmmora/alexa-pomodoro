import { duracionDe, reconciliar } from './ciclo';
import type { SessionRepository } from './repositories/SessionRepository';
import { claveDia, rangoDeClave, rangoDia, rangoSemana } from './tiempo';
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
  clave: string;
  etiqueta: string;
  esHoy: boolean;
  seleccionado: boolean;
  completados: number;
  interrumpidos: number;
}

export interface DiaMes {
  clave: string;
  numero: number;
  esHoy: boolean;
  seleccionado: boolean;
  completados: number;
  interrumpidos: number;
}

export interface MesAnio {
  clave: string;
  etiqueta: string;
  seleccionado: boolean;
  completados: number;
  interrumpidos: number;
}

export interface ResumenDia {
  completados: number;
  interrumpidos: number;
  minutosEnfocados: number;
  sesiones: SesionVista[];
}

export interface DatosPanel {
  ahora: string;
  activa: SesionVista | null;
  focosEnCiclo: number;
  config: { foco: number; descansoCorto: number; descansoLargo: number; encadenar: boolean };
  hoy: ResumenDia;
  /** Día elegido en la gráfica (hoy por defecto) con su historial. */
  dia: ResumenDia & { clave: string; esHoy: boolean; titulo: string };
  semana: DiaSemana[];
  mes: { clave: string; anio: number; titulo: string; huecosInicio: number; dias: DiaMes[] };
  meses: MesAnio[];
}

export interface FiltrosPanel {
  /** `YYYY-MM-DD` */
  dia?: string;
  /** `YYYY-MM` */
  mes?: string;
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

const formato = (opciones: Intl.DateTimeFormatOptions, d: Date, zona: string = ZONA_HORARIA) =>
  new Intl.DateTimeFormat('es-CO', { timeZone: zona, ...opciones }).format(d);

const etiquetaDia = (d: Date) => formato({ weekday: 'short' }, d).replace('.', '');

function contar(sesiones: Sesion[] | undefined) {
  const focos = (sesiones ?? []).filter((s) => s.tipo === 'FOCO');
  return {
    completados: focos.filter((s) => s.estado === 'COMPLETADA').length,
    interrumpidos: focos.filter((s) => s.estado === 'INTERRUMPIDA').length,
  };
}

function resumir(sesiones: Sesion[] | undefined): ResumenDia {
  const lista = [...(sesiones ?? [])].sort((a, b) => a.inicio.getTime() - b.inicio.getTime());
  const vistas = lista.map(aVista);
  return {
    ...contar(lista),
    minutosEnfocados: vistas.filter((v) => v.tipo === 'FOCO' && v.estado === 'COMPLETADA').reduce((t, v) => t + v.minutos, 0),
    sesiones: vistas,
  };
}

/** Todo lo que necesita el panel en una sola lectura. Reconcilia antes de leer. */
export async function cargarPanel(
  repo: SessionRepository, ownerId: string, ahora: Date, filtros: FiltrosPanel = {},
): Promise<DatosPanel> {
  const activa = await reconciliar(repo, ownerId, ahora);
  const estado = await repo.obtenerEstado(ownerId);

  const hoyRango = rangoDia(ahora);
  const diaRango = (filtros.dia && rangoDeClave(filtros.dia)) || hoyRango;
  const claveHoy = claveDia(hoyRango.desde);
  const claveSel = claveDia(diaRango.desde);
  const semana = rangoSemana(diaRango.desde);

  const mesValido = filtros.mes && /^\d{4}-(0[1-9]|1[0-2])$/.test(filtros.mes) ? filtros.mes : undefined;
  const claveMes = mesValido ?? claveSel.slice(0, 7);
  const [anio, numMes] = [+claveMes.slice(0, 4), +claveMes.slice(5, 7)];
  const inicioAnio = rangoDeClave(`${anio}-01-01`)!.desde;
  const finAnio = rangoDeClave(`${anio + 1}-01-01`)!.desde;

  const desde = new Date(Math.min(semana.desde.getTime(), inicioAnio.getTime(), hoyRango.desde.getTime()));
  const hasta = new Date(Math.max(semana.hasta.getTime(), finAnio.getTime(), hoyRango.hasta.getTime()));
  const porDia = new Map<string, Sesion[]>();
  for (const s of await repo.listarSesiones(ownerId, desde, hasta)) {
    const k = claveDia(s.inicio);
    porDia.set(k, [...(porDia.get(k) ?? []), s]);
  }

  const dias: DiaSemana[] = Array.from({ length: 7 }, (_, i) => {
    const inicio = new Date(semana.desde.getTime() + i * DIA_MS);
    const clave = claveDia(new Date(inicio.getTime() + DIA_MS / 2));
    return {
      clave, etiqueta: etiquetaDia(new Date(inicio.getTime() + DIA_MS / 2)),
      esHoy: clave === claveHoy, seleccionado: clave === claveSel, ...contar(porDia.get(clave)),
    };
  });

  const diasDelMes = new Date(Date.UTC(anio, numMes, 0)).getUTCDate();
  const diasMes: DiaMes[] = Array.from({ length: diasDelMes }, (_, i) => {
    const clave = `${claveMes}-${String(i + 1).padStart(2, '0')}`;
    return { clave, numero: i + 1, esHoy: clave === claveHoy, seleccionado: clave === claveSel, ...contar(porDia.get(clave)) };
  });

  const meses: MesAnio[] = Array.from({ length: 12 }, (_, i) => {
    const clave = `${anio}-${String(i + 1).padStart(2, '0')}`;
    const delMes = [...porDia].filter(([k]) => k.startsWith(clave)).flatMap(([, v]) => v);
    return {
      clave, etiqueta: formato({ month: 'short' }, new Date(Date.UTC(anio, i, 15)), 'UTC').replace('.', '').replace('sept', 'sep'),
      seleccionado: clave === claveMes, ...contar(delMes),
    };
  });

  const mediodia = new Date(diaRango.desde.getTime() + DIA_MS / 2);
  return {
    ahora: ahora.toISOString(),
    activa: activa ? aVista(activa) : null,
    focosEnCiclo: estado.focosEnCiclo,
    config: {
      foco: duracionDe(estado, 'FOCO'), descansoCorto: duracionDe(estado, 'DESCANSO_CORTO'),
      descansoLargo: duracionDe(estado, 'DESCANSO_LARGO'), encadenar: estado.encadenar ?? false,
    },
    hoy: resumir(porDia.get(claveHoy)),
    dia: {
      ...resumir(porDia.get(claveSel)), clave: claveSel, esHoy: claveSel === claveHoy,
      titulo: formato({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }, mediodia),
    },
    semana: dias,
    mes: {
      clave: claveMes, anio,
      titulo: formato({ month: 'long', year: 'numeric' }, new Date(Date.UTC(anio, numMes - 1, 15)), 'UTC'),
      huecosInicio: new Date(Date.UTC(anio, numMes - 1, 1)).getUTCDay(),
      dias: diasMes,
    },
    meses,
  };
}
