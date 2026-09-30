'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

/** Mantiene el panel al día con lo que se dicta por voz, sin recargar a mano. */
export function AutoRefresco({ cadaSegundos = 30 }: { cadaSegundos?: number }) {
  const router = useRouter();
  useEffect(() => {
    const refrescar = () => { if (document.visibilityState === 'visible') router.refresh(); };
    const id = setInterval(refrescar, cadaSegundos * 1000);
    document.addEventListener('visibilitychange', refrescar);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', refrescar); };
  }, [router, cadaSegundos]);
  return null;
}
