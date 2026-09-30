import type { RequestEnvelope } from 'ask-sdk-model';
import { procesar } from '@/lib/alexa/skill';
import { verificarRequestAlexa } from '@/lib/alexa/verificar';
import { obtenerDb } from '@/lib/mongo';
import { MongoSessionRepository } from '@/lib/repositories/MongoSessionRepository';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const respuestaVoz = (texto: string) => Response.json({
  version: '1.0',
  response: { outputSpeech: { type: 'PlainText', text: texto }, shouldEndSession: true },
});

export async function POST(request: Request) {
  // La firma se calcula sobre el cuerpo crudo: leerlo como texto antes de parsear.
  const cuerpo = await request.text();
  try {
    await verificarRequestAlexa(cuerpo, request.headers);
  } catch (e) {
    console.warn('Request de Alexa rechazada:', e instanceof Error ? e.message : e);
    return new Response('Request no válida', { status: 400 });
  }

  const env = JSON.parse(cuerpo) as RequestEnvelope;
  const userId = env.context.System.user.userId;
  const owner = process.env.ALEXA_OWNER_ID;

  if (!owner) {
    console.log(`ALEXA_OWNER_ID no configurado. userId de esta request: ${userId}`);
    return respuestaVoz('El skill aún no está configurado. Revisa los registros para obtener tu identificador.');
  }
  if (userId !== owner) return respuestaVoz('Este skill es personal y no está disponible para tu cuenta.');

  const repo = new MongoSessionRepository(await obtenerDb());
  return Response.json(await procesar({ repo, ownerId: owner }, env));
}
