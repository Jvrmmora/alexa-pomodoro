import { ObjectId, type Db, type UpdateFilter, type WithId } from 'mongodb';
import { ZONA_HORARIA, type EstadoSesion, type EstadoUsuario, type Sesion } from '../tipos';
import type { SessionRepository } from './SessionRepository';

type SesionDoc = Omit<Sesion, '_id'>;
type EstadoDoc = Omit<EstadoUsuario, '_id'> & { _id: string };

const aSesion = (d: WithId<SesionDoc>): Sesion => ({ ...d, _id: d._id.toString() });

export class MongoSessionRepository implements SessionRepository {
  constructor(private readonly db: Db) {}

  private get sesiones() { return this.db.collection<SesionDoc>('sesiones'); }
  private get estados() { return this.db.collection<EstadoDoc>('estados'); }

  async asegurarIndices(): Promise<void> {
    await this.sesiones.createIndex({ ownerId: 1, inicio: -1 });
  }

  async obtenerEstado(ownerId: string): Promise<EstadoUsuario> {
    const e = await this.estados.findOne({ _id: ownerId });
    return e ?? { _id: ownerId, focosEnCiclo: 0, zonaHoraria: ZONA_HORARIA };
  }

  async guardarEstado(estado: EstadoUsuario): Promise<void> {
    await this.estados.replaceOne({ _id: estado._id }, estado, { upsert: true });
  }

  async crearSesion(sesion: Omit<Sesion, '_id'>): Promise<Sesion> {
    const { insertedId } = await this.sesiones.insertOne({ ...sesion });
    return { ...sesion, _id: insertedId.toString() };
  }

  async actualizarSesion(id: string, cambios: Partial<Sesion>): Promise<void> {
    const { _id, ...resto } = cambios;
    void _id;
    // Un campo `undefined` significa "borrar el campo" (p. ej. quitar la tarea).
    const set = Object.fromEntries(Object.entries(resto).filter(([, v]) => v !== undefined));
    const unset = Object.fromEntries(Object.entries(resto).filter(([, v]) => v === undefined).map(([k]) => [k, '' as const]));
    const update: UpdateFilter<SesionDoc> = {};
    if (Object.keys(set).length) update.$set = set;
    if (Object.keys(unset).length) update.$unset = unset;
    await this.sesiones.updateOne({ _id: new ObjectId(id) }, update);
  }

  async obtenerSesion(ownerId: string, id: string): Promise<Sesion | null> {
    if (!ObjectId.isValid(id)) return null;
    const d = await this.sesiones.findOne({ _id: new ObjectId(id), ownerId });
    return d ? aSesion(d) : null;
  }

  async eliminarSesion(ownerId: string, id: string): Promise<void> {
    if (!ObjectId.isValid(id)) return;
    await this.sesiones.deleteOne({ _id: new ObjectId(id), ownerId });
  }

  async obtenerSesionActiva(ownerId: string): Promise<Sesion | null> {
    const estado = await this.obtenerEstado(ownerId);
    if (!estado.sesionActivaId) return null;
    const d = await this.sesiones.findOne({ _id: new ObjectId(estado.sesionActivaId), estado: 'ACTIVA' });
    return d ? aSesion(d) : null;
  }

  async listarSesiones(ownerId: string, desde: Date, hasta: Date): Promise<Sesion[]> {
    const docs = await this.sesiones.find({ ownerId, inicio: { $gte: desde, $lt: hasta } }).sort({ inicio: -1 }).toArray();
    return docs.map(aSesion);
  }

  async contarFocos(ownerId: string, desde: Date, hasta: Date, estado: EstadoSesion): Promise<number> {
    return this.sesiones.countDocuments({ ownerId, tipo: 'FOCO', estado, inicio: { $gte: desde, $lt: hasta } });
  }
}
