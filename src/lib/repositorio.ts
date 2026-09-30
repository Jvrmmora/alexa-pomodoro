import { obtenerDb } from './mongo';
import { MongoSessionRepository } from './repositories/MongoSessionRepository';

const cache = globalThis as unknown as { _repoListo?: Promise<MongoSessionRepository> };

/** Repositorio Mongo compartido; crea los índices una sola vez por instancia. */
export function obtenerRepositorio(): Promise<MongoSessionRepository> {
  cache._repoListo ??= (async () => {
    const repo = new MongoSessionRepository(await obtenerDb());
    await repo.asegurarIndices();
    return repo;
  })().catch((e) => { cache._repoListo = undefined; throw e; });
  return cache._repoListo;
}
