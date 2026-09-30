import { cookies } from 'next/headers';
import { COOKIE_SESION, tokenValido } from './sesionPanel';

export async function haySesion(): Promise<boolean> {
  const token = (await cookies()).get(COOKIE_SESION)?.value;
  return tokenValido(token, process.env.PANEL_SECRET ?? '');
}
