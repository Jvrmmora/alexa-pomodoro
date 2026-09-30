export type TipoSesion = 'FOCO' | 'DESCANSO_CORTO' | 'DESCANSO_LARGO';
export type EstadoSesion = 'ACTIVA' | 'COMPLETADA' | 'INTERRUMPIDA';

export interface Sesion {
  _id: string;
  ownerId: string;
  tipo: TipoSesion;
  tarea?: string;
  inicio: Date;
  finEsperado: Date;
  fin?: Date;
  estado: EstadoSesion;
  timerId?: string;
  origen: 'VOZ' | 'PANEL';
  /** Descanso ya programado (timer creado) que arranca al terminar este foco. */
  siguiente?: { tipo: TipoSesion; timerId: string; minutos: number };
}

export interface EstadoUsuario {
  _id: string;
  sesionActivaId?: string;
  focosEnCiclo: number;
  zonaHoraria: string;
  /** Duraciones personalizadas en minutos; lo que falte usa el valor por defecto. */
  duraciones?: Partial<Record<TipoSesion, number>>;
  /** Si está activo, cada foco programa también el descanso que le sigue. */
  encadenar?: boolean;
}

export const ZONA_HORARIA = 'America/Bogota';
