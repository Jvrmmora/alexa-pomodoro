import { DURACION_MIN } from './ciclo';
import type { SessionRepository } from './repositories/SessionRepository';
import type { Sesion, TipoSesion } from './tipos';

export const MAX_TAREA = 80;
export const MAX_MINUTOS = 180;

export class ErrorEdicion extends Error {}

const TIPOS: TipoSesion[] = ['FOCO', 'DESCANSO_CORTO', 'DESCANSO_LARGO'];

export function limpiarTarea(valor: unknown): string | undefined {
  const t = String(valor ?? '').trim().replace(/\s+/g, ' ');
  if (t.length > MAX_TAREA) throw new ErrorEdicion(`La tarea admite hasta ${MAX_TAREA} caracteres.`);
  return t || undefined;
}

// Un bloque activo tiene un timer vivo en Alexa que el panel no puede cancelar: solo se toca por voz.
async function obtenerEditable(repo: SessionRepository, ownerId: string, id: string): Promise<Sesion> {
  const s = await repo.obtenerSesion(ownerId, id);
  if (!s) throw new ErrorEdicion('El bloque no existe.');
  if (s.estado === 'ACTIVA') throw new ErrorEdicion('Un bloque en curso se cancela por voz.');
  return s;
}

export async function editarSesion(
  repo: SessionRepository, ownerId: string, id: string,
  cambios: { tarea?: unknown; estado?: unknown },
): Promise<void> {
  const s = await obtenerEditable(repo, ownerId, id);
  const nuevos: Partial<Sesion> = {};
  if ('tarea' in cambios) {
    if (s.tipo !== 'FOCO') throw new ErrorEdicion('Solo los focos llevan tarea.');
    nuevos.tarea = limpiarTarea(cambios.tarea);
  }
  if (cambios.estado !== undefined) {
    if (cambios.estado !== 'COMPLETADA' && cambios.estado !== 'INTERRUMPIDA') throw new ErrorEdicion('Estado no válido.');
    nuevos.estado = cambios.estado;
  }
  await repo.actualizarSesion(id, nuevos);
}

export async function borrarSesion(repo: SessionRepository, ownerId: string, id: string): Promise<void> {
  await obtenerEditable(repo, ownerId, id);
  await repo.eliminarSesion(ownerId, id);
}

/** Registra un bloque que ya ocurrió (p. ej. un foco que no se dictó por voz). */
export async function crearSesionManual(
  repo: SessionRepository, ownerId: string, ahora: Date,
  datos: { tipo: unknown; tarea?: unknown; inicio: Date; minutos: unknown },
): Promise<Sesion> {
  const tipo = datos.tipo as TipoSesion;
  if (!TIPOS.includes(tipo)) throw new ErrorEdicion('Tipo no válido.');
  const minutos = Number(datos.minutos) || DURACION_MIN[tipo];
  if (!Number.isInteger(minutos) || minutos < 1 || minutos > MAX_MINUTOS) {
    throw new ErrorEdicion(`La duración debe estar entre 1 y ${MAX_MINUTOS} minutos.`);
  }
  if (Number.isNaN(datos.inicio.getTime())) throw new ErrorEdicion('Hora de inicio no válida.');
  const fin = new Date(datos.inicio.getTime() + minutos * 60_000);
  if (fin > ahora) throw new ErrorEdicion('El bloque no puede terminar en el futuro.');

  return repo.crearSesion({
    ownerId, tipo, tarea: tipo === 'FOCO' ? limpiarTarea(datos.tarea) : undefined,
    inicio: datos.inicio, finEsperado: fin, fin, estado: 'COMPLETADA', origen: 'PANEL',
  });
}
