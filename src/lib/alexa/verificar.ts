import { SkillRequestSignatureVerifier, TimestampVerifier } from 'ask-sdk-express-adapter';

const firma = new SkillRequestSignatureVerifier();
const marcaTiempo = new TimestampVerifier(); // tolerancia por defecto: 150 s

/**
 * Valida firma y timestamp sobre el cuerpo CRUDO (no el JSON re-serializado).
 * Lanza si la request no viene de Alexa.
 */
export async function verificarRequestAlexa(cuerpoCrudo: string, headers: Headers): Promise<void> {
  const planos: Record<string, string> = {};
  headers.forEach((valor, clave) => { planos[clave.toLowerCase()] = valor; });
  await firma.verify(cuerpoCrudo, planos);
  await marcaTiempo.verify(cuerpoCrudo);
}
