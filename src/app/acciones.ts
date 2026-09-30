'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { COOKIE_SESION, DURACION_SESION_S, crearToken, passwordCorrecta } from '@/lib/sesionPanel';

export interface EstadoLogin { error?: string }

export async function iniciarSesion(_previo: EstadoLogin, datos: FormData): Promise<EstadoLogin> {
  const secreto = process.env.PANEL_SECRET;
  if (!secreto || !process.env.PANEL_PASSWORD) return { error: 'El panel no está configurado en el servidor.' };

  if (!passwordCorrecta(String(datos.get('password') ?? ''), process.env.PANEL_PASSWORD)) {
    await new Promise((r) => setTimeout(r, 800)); // frena la fuerza bruta
    return { error: 'Contraseña incorrecta.' };
  }

  (await cookies()).set(COOKIE_SESION, crearToken(secreto), {
    httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: DURACION_SESION_S,
  });
  redirect('/');
}

export async function cerrarSesion() {
  (await cookies()).delete(COOKIE_SESION);
  redirect('/login');
}
