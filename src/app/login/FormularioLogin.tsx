'use client';

import { useActionState } from 'react';
import { iniciarSesion, type EstadoLogin } from '../acciones';
import estilos from './login.module.css';

export function FormularioLogin() {
  const [estado, accion, pendiente] = useActionState<EstadoLogin, FormData>(iniciarSesion, {});
  return (
    <form action={accion} className={estilos.form}>
      <label htmlFor="password">Contraseña</label>
      <input id="password" name="password" type="password" autoComplete="current-password" autoFocus required />
      {estado.error && <p role="alert" className={estilos.error}>{estado.error}</p>}
      <button type="submit" disabled={pendiente}>{pendiente ? 'Entrando…' : 'Entrar'}</button>
    </form>
  );
}
