import { createHmac, timingSafeEqual } from 'node:crypto';

export const COOKIE_SESION = 'panel_sesion';
export const DURACION_SESION_S = 30 * 24 * 3600;

const firmar = (valor: string, secreto: string) => createHmac('sha256', secreto).update(valor).digest('hex');

function iguales(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Token `expiraEnSegundos.firma`; sin estado en servidor. */
export function crearToken(secreto: string, ahora = new Date()): string {
  const expira = String(Math.floor(ahora.getTime() / 1000) + DURACION_SESION_S);
  return `${expira}.${firmar(expira, secreto)}`;
}

export function tokenValido(token: string | undefined, secreto: string, ahora = new Date()): boolean {
  if (!token || !secreto) return false;
  const [expira, firma] = token.split('.');
  if (!expira || !firma || !iguales(firma, firmar(expira, secreto))) return false;
  return Number(expira) > ahora.getTime() / 1000;
}

/** Compara sin filtrar la longitud ni el contenido por tiempo de respuesta. */
export function passwordCorrecta(intento: string, esperada: string | undefined): boolean {
  if (!esperada) return false;
  return iguales(firmar(intento, 'cmp'), firmar(esperada, 'cmp'));
}
