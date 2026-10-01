/** Anillo de voz inspirado en Alexa (no es el logotipo oficial de Amazon). */
export function LogoAlexa({ tamano = 40, id = 'logo' }: { tamano?: number; id?: string }) {
  return (
    <svg width={tamano} height={tamano} viewBox="0 0 48 48" role="img" aria-label="Alexa Pomodoro" fill="none">
      <defs>
        <linearGradient id={`${id}-g`} x1="8" y1="6" x2="40" y2="42" gradientUnits="userSpaceOnUse">
          <stop stopColor="#00E5FF" />
          <stop offset="1" stopColor="#1F6FEB" />
        </linearGradient>
      </defs>
      <circle cx="24" cy="24" r="15" stroke={`url(#${id}-g)`} strokeWidth="6.5" />
      <path d="M33.6 35.4A15 15 0 0 0 39 24" stroke="#BFF6FF" strokeWidth="3" strokeLinecap="round" opacity=".9" />
    </svg>
  );
}
