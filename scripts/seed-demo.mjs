// Carga datos de ejemplo para ver el panel sin haber usado Alexa.
//   npm run seed           → inserta la demo
//   npm run seed:limpiar   → borra solo lo que insertó la demo
// Por seguridad exige que MONGODB_DB contenga "demo" (usa una base aparte, nunca la real).
import { MongoClient } from 'mongodb';

const { MONGODB_URI, MONGODB_DB = 'pomodoro', ALEXA_OWNER_ID = 'demo-owner' } = process.env;
const limpiar = process.argv.includes('--limpiar');

if (!MONGODB_URI) { console.error('Falta MONGODB_URI (¿creaste .env.local?).'); process.exit(1); }
if (!MONGODB_DB.includes('demo') && !process.argv.includes('--forzar')) {
  console.error(`MONGODB_DB="${MONGODB_DB}" no parece una base de demo.\n` +
    'Usa otra base (p. ej. MONGODB_DB=pomodoro-demo en .env.local) o agrega --forzar si sabes lo que haces.');
  process.exit(1);
}

const MIN = 60_000;
const OFFSET_BOGOTA = 5 * 3600_000; // America/Bogota es UTC-5 todo el año
const ahora = new Date();

const cliente = await new MongoClient(MONGODB_URI).connect();
const db = cliente.db(MONGODB_DB);
const sesiones = db.collection('sesiones');
const estados = db.collection('estados');

await sesiones.deleteMany({ demo: true });
if (limpiar) {
  await estados.deleteOne({ _id: ALEXA_OWNER_ID, demo: true });
  console.log(`Demo borrada de "${MONGODB_DB}".`);
  await cliente.close();
  process.exit(0);
}

const TAREAS = ['Diseñar la API de pagos', 'Revisar pull requests', 'Escribir pruebas', 'Leer la documentación de Alexa', 'Refactor del repositorio', 'Planear el sprint', 'Responder correos'];
let t = 0;
const tarea = () => TAREAS[t++ % TAREAS.length];

const sesion = (tipo, inicio, minutos, estado, extra = {}) => ({
  ownerId: ALEXA_OWNER_ID, tipo, inicio, finEsperado: new Date(inicio.getTime() + minutos * MIN),
  ...(estado === 'ACTIVA' ? {} : { fin: new Date(inicio.getTime() + (extra.realMin ?? minutos) * MIN) }),
  estado, origen: 'VOZ', demo: true, ...(tipo === 'FOCO' ? { tarea: extra.tarea ?? tarea() } : {}),
});

const docs = [];

// Lunes de esta semana (hora de Bogotá) hasta ayer: días completos de trabajo.
const localAhora = new Date(ahora.getTime() - OFFSET_BOGOTA);
const inicioHoyLocal = Date.UTC(localAhora.getUTCFullYear(), localAhora.getUTCMonth(), localAhora.getUTCDate());
const diaSemana = new Date(inicioHoyLocal).getUTCDay(); // 0 = domingo
const diasAtras = (diaSemana + 6) % 7;
const focosPorDia = [7, 8, 6, 9, 5, 3, 2];
for (let d = diasAtras; d >= 1; d--) {
  let cursor = new Date(inicioHoyLocal - d * 24 * 3600_000 + OFFSET_BOGOTA + 9 * 3600_000); // 09:00 locales
  const n = focosPorDia[(diasAtras - d) % focosPorDia.length];
  for (let i = 0; i < n; i++) {
    const cortado = i === 3 && n > 5;
    docs.push(sesion('FOCO', cursor, 25, cortado ? 'INTERRUMPIDA' : 'COMPLETADA', cortado ? { realMin: 11 } : {}));
    cursor = new Date(cursor.getTime() + 25 * MIN);
    const largo = (i + 1) % 4 === 0;
    docs.push(sesion(largo ? 'DESCANSO_LARGO' : 'DESCANSO_CORTO', cursor, largo ? 15 : 5, 'COMPLETADA'));
    cursor = new Date(cursor.getTime() + (largo ? 15 : 5) * MIN);
  }
}

// Hoy, hacia atrás desde ahora: un foco en curso (faltan ~14 min) y lo anterior ya terminado.
const activaInicio = new Date(ahora.getTime() - 11 * MIN);
let fin = activaInicio;
const hoy = [];
for (let i = 0; i < 3; i++) {
  const descansoIni = new Date(fin.getTime() - 5 * MIN);
  hoy.unshift(sesion('DESCANSO_CORTO', descansoIni, 5, 'COMPLETADA'));
  const focoIni = new Date(descansoIni.getTime() - (i === 1 ? 25 : 25) * MIN);
  hoy.unshift(sesion('FOCO', focoIni, 25, i === 1 ? 'INTERRUMPIDA' : 'COMPLETADA', i === 1 ? { realMin: 14 } : {}));
  fin = focoIni;
}
docs.push(...hoy);

const activa = {
  ...sesion('FOCO', activaInicio, 25, 'ACTIVA', { tarea: 'Diseñar la API de pagos' }),
  timerId: 'demo-timer-1', siguiente: { tipo: 'DESCANSO_LARGO', timerId: 'demo-timer-2', minutos: 15 },
};
const { insertedId } = await sesiones.insertOne(activa);
await sesiones.insertMany(docs);

await estados.replaceOne(
  { _id: ALEXA_OWNER_ID },
  { _id: ALEXA_OWNER_ID, zonaHoraria: 'America/Bogota', focosEnCiclo: 3, encadenar: true, sesionActivaId: insertedId.toString(), demo: true },
  { upsert: true },
);

console.log(`Demo cargada en "${MONGODB_DB}" para ${ALEXA_OWNER_ID.slice(0, 18)}… (${docs.length + 1} bloques).`);
await cliente.close();
