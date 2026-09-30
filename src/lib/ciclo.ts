import type { SessionRepository } from './repositories/SessionRepository';
import type { EstadoUsuario, Sesion, TipoSesion } from './tipos';

export const DURACION_MIN: Record<TipoSesion, number> = { FOCO: 25, DESCANSO_CORTO: 5, DESCANSO_LARGO: 15 };
export const FOCOS_POR_CICLO = 4;

/** Límites de las duraciones configurables (la Timers API admite hasta 2 h). */
export const LIMITES_MIN: Record<TipoSesion, [number, number]> = {
  FOCO: [5, 120], DESCANSO_CORTO: [1, 60], DESCANSO_LARGO: [1, 60],
};

/** Duración en minutos de un tipo de bloque según la configuración del usuario. */
export function duracionDe(estado: Pick<EstadoUsuario, 'duraciones'>, tipo: TipoSesion): number {
  return estado.duraciones?.[tipo] ?? DURACION_MIN[tipo];
}

/** Tipo de descanso que toca según el ciclo actual. */
export function tipoDescanso(focosEnCiclo: number): 'DESCANSO_CORTO' | 'DESCANSO_LARGO' {
  return focosEnCiclo >= FOCOS_POR_CICLO ? 'DESCANSO_LARGO' : 'DESCANSO_CORTO';
}

/**
 * Cierra las sesiones vencidas y actualiza el ciclo. Si el foco vencido tenía un descanso
 * programado, lo registra como sesión activa (con su inicio real) y sigue evaluando.
 * Devuelve la sesión activa vigente (o null).
 */
export async function reconciliar(repo: SessionRepository, ownerId: string, ahora: Date): Promise<Sesion | null> {
  let activa = await repo.obtenerSesionActiva(ownerId);
  while (activa && activa.finEsperado <= ahora) {
    await repo.actualizarSesion(activa._id, { estado: 'COMPLETADA', fin: activa.finEsperado });

    const estado = await repo.obtenerEstado(ownerId);
    estado.sesionActivaId = undefined;
    if (activa.tipo === 'FOCO') estado.focosEnCiclo = Math.min(estado.focosEnCiclo + 1, FOCOS_POR_CICLO);
    if (activa.tipo === 'DESCANSO_LARGO') estado.focosEnCiclo = 0;

    let siguiente: Sesion | null = null;
    if (activa.siguiente) {
      siguiente = await repo.crearSesion({
        ownerId, tipo: activa.siguiente.tipo, inicio: activa.finEsperado,
        finEsperado: new Date(activa.finEsperado.getTime() + activa.siguiente.minutos * 60_000),
        estado: 'ACTIVA', timerId: activa.siguiente.timerId, origen: activa.origen,
      });
      estado.sesionActivaId = siguiente._id;
    }
    await repo.guardarEstado(estado);
    activa = siguiente;
  }
  return activa ?? null;
}
