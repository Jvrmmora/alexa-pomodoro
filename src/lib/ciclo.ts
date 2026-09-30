import type { SessionRepository } from './repositories/SessionRepository';
import type { Sesion, TipoSesion } from './tipos';

export const DURACION_MIN: Record<TipoSesion, number> = { FOCO: 25, DESCANSO_CORTO: 5, DESCANSO_LARGO: 15 };
export const FOCOS_POR_CICLO = 4;

/**
 * Si la sesión activa ya venció, la marca COMPLETADA y actualiza el ciclo.
 * Devuelve la sesión activa vigente (o null).
 */
export async function reconciliar(repo: SessionRepository, ownerId: string, ahora: Date): Promise<Sesion | null> {
  const activa = await repo.obtenerSesionActiva(ownerId);
  if (!activa) return null;
  if (activa.finEsperado > ahora) return activa;

  await repo.actualizarSesion(activa._id, { estado: 'COMPLETADA', fin: activa.finEsperado });
  const estado = await repo.obtenerEstado(ownerId);
  estado.sesionActivaId = undefined;
  if (activa.tipo === 'FOCO') estado.focosEnCiclo = Math.min(estado.focosEnCiclo + 1, FOCOS_POR_CICLO);
  await repo.guardarEstado(estado);
  return null;
}

/** Tipo de descanso que toca según el ciclo actual. */
export function tipoDescanso(focosEnCiclo: number): 'DESCANSO_CORTO' | 'DESCANSO_LARGO' {
  return focosEnCiclo >= FOCOS_POR_CICLO ? 'DESCANSO_LARGO' : 'DESCANSO_CORTO';
}
