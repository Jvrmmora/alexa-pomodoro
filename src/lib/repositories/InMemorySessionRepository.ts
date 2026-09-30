import { ZONA_HORARIA, type EstadoSesion, type EstadoUsuario, type Sesion } from '../tipos';
import type { SessionRepository } from './SessionRepository';

export class InMemorySessionRepository implements SessionRepository {
  private sesiones: Sesion[] = [];
  private estados = new Map<string, EstadoUsuario>();
  private seq = 0;

  async obtenerEstado(ownerId: string): Promise<EstadoUsuario> {
    return { ...(this.estados.get(ownerId) ?? { _id: ownerId, focosEnCiclo: 0, zonaHoraria: ZONA_HORARIA }) };
  }

  async guardarEstado(estado: EstadoUsuario): Promise<void> {
    this.estados.set(estado._id, { ...estado });
  }

  async crearSesion(sesion: Omit<Sesion, '_id'>): Promise<Sesion> {
    const creada = { ...sesion, _id: String(++this.seq) };
    this.sesiones.push(creada);
    return { ...creada };
  }

  async actualizarSesion(id: string, cambios: Partial<Sesion>): Promise<void> {
    const s = this.sesiones.find((x) => x._id === id);
    if (s) Object.assign(s, cambios);
  }

  async obtenerSesionActiva(ownerId: string): Promise<Sesion | null> {
    const estado = await this.obtenerEstado(ownerId);
    const s = this.sesiones.find((x) => x._id === estado.sesionActivaId && x.estado === 'ACTIVA');
    return s ? { ...s } : null;
  }

  async listarSesiones(ownerId: string, desde: Date, hasta: Date): Promise<Sesion[]> {
    return this.sesiones
      .filter((s) => s.ownerId === ownerId && s.inicio >= desde && s.inicio < hasta)
      .sort((a, b) => b.inicio.getTime() - a.inicio.getTime())
      .map((s) => ({ ...s }));
  }

  async contarFocos(ownerId: string, desde: Date, hasta: Date, estado: EstadoSesion): Promise<number> {
    return this.sesiones.filter(
      (s) => s.ownerId === ownerId && s.tipo === 'FOCO' && s.estado === estado && s.inicio >= desde && s.inicio < hasta,
    ).length;
  }
}
