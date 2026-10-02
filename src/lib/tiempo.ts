import { ZONA_HORARIA } from './tipos';

// Offset de la zona (en ms) en un instante dado: hora local interpretada como UTC - instante real.
function offsetMs(fecha: Date, zona: string): number {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: zona, hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).formatToParts(fecha).map((x) => [x.type, x.value]),
  );
  const local = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return local - Math.floor(fecha.getTime() / 1000) * 1000;
}

/** Inicio (00:00 local) y fin (exclusivo) del día que contiene `ahora` en la zona dada. */
export function rangoDia(ahora: Date, zona = ZONA_HORARIA): { desde: Date; hasta: Date } {
  const off = offsetMs(ahora, zona);
  const local = new Date(ahora.getTime() + off);
  const inicioLocal = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  const desde = new Date(inicioLocal - off);
  const hasta = new Date(inicioLocal + 24 * 3600_000 - off);
  return { desde, hasta };
}

/** Semana domingo-sábado que contiene `ahora`. */
export function rangoSemana(ahora: Date, zona = ZONA_HORARIA): { desde: Date; hasta: Date } {
  const { desde: hoy } = rangoDia(ahora, zona);
  const atras = new Date(hoy.getTime() + offsetMs(hoy, zona)).getUTCDay(); // 0=domingo
  const desde = new Date(hoy.getTime() - atras * 24 * 3600_000);
  return { desde, hasta: new Date(desde.getTime() + 7 * 24 * 3600_000) };
}

/** Fecha local como `YYYY-MM-DD`. */
export function claveDia(fecha: Date, zona = ZONA_HORARIA): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: zona }).format(fecha);
}

/** Convierte `YYYY-MM-DD` en el rango de ese día local; null si no es una fecha real. */
export function rangoDeClave(clave: string, zona = ZONA_HORARIA): { desde: Date; hasta: Date } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(clave);
  if (!m) return null;
  const [a, mes, d] = [+m[1], +m[2], +m[3]];
  const medio = new Date(Date.UTC(a, mes - 1, d, 12));
  if (medio.getUTCFullYear() !== a || medio.getUTCMonth() !== mes - 1 || medio.getUTCDate() !== d) return null;
  // 12:00 UTC cae el mismo día local en cualquier zona razonable cercana a América.
  return rangoDia(medio, zona);
}
