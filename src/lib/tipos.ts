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
}

export interface EstadoUsuario {
  _id: string;
  sesionActivaId?: string;
  focosEnCiclo: number;
  zonaHoraria: string;
}

export const ZONA_HORARIA = 'America/Bogota';
