'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { haySesion } from '@/lib/autenticacion';
import { borrarSesion, crearSesionManual, editarSesion, ErrorEdicion } from '@/lib/edicion';
import { obtenerRepositorio } from '@/lib/repositorio';
import { ZONA_HORARIA } from '@/lib/tipos';
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

// Cada acción de edición revalida la sesión: los Server Actions se pueden invocar por POST directo.
async function conPermiso(tarea: (ctx: { repo: Awaited<ReturnType<typeof obtenerRepositorio>>; ownerId: string }) => Promise<void>) {
  if (!(await haySesion())) redirect('/login');
  const ownerId = process.env.ALEXA_OWNER_ID;
  if (!ownerId) throw new Error('Falta ALEXA_OWNER_ID');
  let destino = '/';
  try {
    await tarea({ repo: await obtenerRepositorio(), ownerId });
  } catch (e) {
    if (!(e instanceof ErrorEdicion)) throw e;
    destino = `/?error=${encodeURIComponent(e.message)}`;
  }
  redirect(destino);
}

export async function editarBloque(datos: FormData) {
  await conPermiso(({ repo, ownerId }) =>
    editarSesion(repo, ownerId, String(datos.get('id')), {
      ...(datos.has('tarea') ? { tarea: datos.get('tarea') } : {}),
      estado: datos.get('estado'),
    }));
}

export async function eliminarBloque(datos: FormData) {
  await conPermiso(({ repo, ownerId }) => borrarSesion(repo, ownerId, String(datos.get('id'))));
}

export async function registrarBloque(datos: FormData) {
  await conPermiso(async ({ repo, ownerId }) => {
    const ahora = new Date();
    const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: ZONA_HORARIA }).format(ahora); // YYYY-MM-DD
    const hora = String(datos.get('hora') ?? '');
    if (!/^\d{2}:\d{2}$/.test(hora)) throw new ErrorEdicion('Indica la hora de inicio.');
    // Bogotá no tiene horario de verano: el desfase es fijo (-05:00).
    await crearSesionManual(repo, ownerId, ahora, {
      tipo: datos.get('tipo'), tarea: datos.get('tarea'), minutos: datos.get('minutos'),
      inicio: new Date(`${hoy}T${hora}:00-05:00`),
    });
  });
}
