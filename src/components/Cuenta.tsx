'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import estilos from '@/app/panel.module.css';

const dos = (n: number) => String(n).padStart(2, '0');

/** Cuenta regresiva en vivo. Al llegar a 0 pide al servidor que reconcilie la sesión. */
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
  const progreso = total > 0 ? Math.min(100, Math.max(0, ((total - restante) / total) * 100)) : 0;

  useEffect(() => {
    if (restante > 0) return;
    const id = setTimeout(() => router.refresh(), 1500);
    return () => clearTimeout(id);
  }, [restante, router]);

  const seg = Math.ceil(restante / 1000);
  return (
    <div>
      <p className={estilos.reloj} role="timer" aria-live="off">{dos(Math.floor(seg / 60))}:{dos(seg % 60)}</p>
      <div className={estilos.barra} aria-hidden="true"><span style={{ width: `${progreso}%` }} /></div>
    </div>
  );
}
