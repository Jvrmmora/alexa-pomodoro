import { MongoClient, type Db } from 'mongodb';

// En serverless se reutiliza el cliente entre ejecuciones: conectarse en cada
// request haría que Alexa se quede esperando (margen de ~8 s).
const globalCache = globalThis as unknown as { _mongoClient?: Promise<MongoClient> };

export async function obtenerDb(): Promise<Db> {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('Falta la variable de entorno MONGODB_URI');
  globalCache._mongoClient ??= new MongoClient(uri).connect();
  const client = await globalCache._mongoClient;
  return client.db(process.env.MONGODB_DB ?? 'pomodoro');
}
