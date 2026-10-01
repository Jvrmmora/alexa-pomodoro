import { redirect } from 'next/navigation';
import { LogoAlexa } from '@/components/LogoAlexa';
import { haySesion } from '@/lib/autenticacion';
import { FormularioLogin } from './FormularioLogin';
import estilos from './login.module.css';

export const metadata = { title: 'Entrar · Alexa Pomodoro' };

export default async function Login() {
  if (await haySesion()) redirect('/');
  return (
    <main className={estilos.pagina}>
      <div className={estilos.tarjeta}>
        <LogoAlexa tamano={56} id="login" />
        <h1>Alexa Pomodoro</h1>
        <p>Panel personal. Ingresa tu contraseña.</p>
        <FormularioLogin />
      </div>
    </main>
  );
}
