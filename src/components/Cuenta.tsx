'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import estilos from '@/app/panel.module.css';

const dos = (n: number) => String(n).padStart(2, '0');
const RADIO = 88;
const CIRCUNFERENCIA = 2 * Math.PI * RADIO;

/** Anillo con cuenta regresiva en vivo. Al llegar a 0 pide al servidor que reconcilie la sesión. */
export function Cuenta({ inicio, fin, ahora }: { inicio: string; fin: string; ahora: string }) {
  const router = useRouter();
  const [t, setT] = useState(() => Date.parse(ahora));

  useEffect(() => {
    const desfase = Date.parse(ahora) - Date.now(); // corrige diferencias de reloj con el servidor
    const id = setInterval(() => setT(Date.now() + desfase), 1000);
    return () => clearInterval(id);
  }, [ahora]);

  const total = Date.parse(fin) - Date.parse(inicio);
  const restante = Math.max(0, Date.parse(fin) - t);
  const progreso = total > 0 ? Math.min(1, Math.max(0, (total - restante) / total)) : 0;

  useEffect(() => {
    if (restante > 0) return;
    const id = setTimeout(() => router.refresh(), 1500);
    return () => clearTimeout(id);
  }, [restante, router]);

  const seg = Math.ceil(restante / 1000);
  return (
    <div className={estilos.anillo}>
      <svg viewBox="0 0 200 200" aria-hidden="true">
        <defs>
          <linearGradient id="anillo-grad" x1="0" y1="0" x2="200" y2="200" gradientUnits="userSpaceOnUse">
            <stop stopColor="#00e5ff" />
            <stop offset="1" stopColor="#1f6fef" />
          </linearGradient>
        </defs>
        <circle className={estilos.pista} cx="100" cy="100" r={RADIO} />
        <circle
          className={estilos.avance} cx="100" cy="100" r={RADIO}
          strokeDasharray={CIRCUNFERENCIA} strokeDashoffset={CIRCUNFERENCIA * (1 - progreso)}
        />
      </svg>
      <div className={estilos.centro}>
        <p className={estilos.reloj} role="timer" aria-live="off">{dos(Math.floor(seg / 60))}:{dos(seg % 60)}</p>
        <span>restante</span>
      </div>
    </div>
  );
}
