import type { EstadoSesion, EstadoUsuario, Sesion } from '../tipos';

export interface SessionRepository {
  obtenerEstado(ownerId: string): Promise<EstadoUsuario>;
  guardarEstado(estado: EstadoUsuario): Promise<void>;
  crearSesion(sesion: Omit<Sesion, '_id'>): Promise<Sesion>;
  actualizarSesion(id: string, cambios: Partial<Sesion>): Promise<void>;
  obtenerSesion(ownerId: string, id: string): Promise<Sesion | null>;
  eliminarSesion(ownerId: string, id: string): Promise<void>;
  obtenerSesionActiva(ownerId: string): Promise<Sesion | null>;
  listarSesiones(ownerId: string, desde: Date, hasta: Date): Promise<Sesion[]>;
  contarFocos(ownerId: string, desde: Date, hasta: Date, estado: EstadoSesion): Promise<number>;
}
