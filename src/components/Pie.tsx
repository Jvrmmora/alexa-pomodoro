import { LogoAlexa } from './LogoAlexa';
import { Icono } from './Icono';
import estilos from './pie.module.css';

export function Pie() {
  return (
    <footer className={estilos.pie}>
      <div className={estilos.marca}>
        <LogoAlexa tamano={22} id="pie" />
        <strong>Alexa Pomodoro</strong>
      </div>
      <p>Técnica Pomodoro por voz con un Echo, visualizada en este panel.</p>
      <ul className={estilos.tecnologias} aria-label="Tecnologías">
        {['Next.js', 'TypeScript', 'Alexa Skills Kit', 'MongoDB Atlas', 'Vercel'].map((t) => <li key={t}>{t}</li>)}
      </ul>
      <p className={estilos.legal}>
        <a href="https://github.com/Jvrmmora/alexa-pomodoro" target="_blank" rel="noopener noreferrer">
          <Icono nombre="github" tamano={16} /> Código en GitHub
        </a>
        <span>© 2026 Javier Montaño</span>
      </p>
      <p className={estilos.aviso}>Proyecto personal independiente. Alexa y Echo son marcas de Amazon.com, Inc.; este proyecto no está afiliado ni avalado por Amazon.</p>
    </footer>
  );
}
