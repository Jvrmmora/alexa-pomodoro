import { redirect } from 'next/navigation';
import { haySesion } from '@/lib/autenticacion';
import { FormularioLogin } from './FormularioLogin';
import estilos from './login.module.css';

export const metadata = { title: 'Entrar · Pomodoro' };

export default async function Login() {
  if (await haySesion()) redirect('/');
  return (
    <main className={estilos.pagina}>
      <div className={estilos.tarjeta}>
        <h1>🍅 Pomodoro</h1>
        <p>Panel personal. Ingresa tu contraseña.</p>
        <FormularioLogin />
      </div>
    </main>
  );
}
