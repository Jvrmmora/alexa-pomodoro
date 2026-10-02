'use client';

import { useState, type ReactNode } from 'react';
import estilos from '@/app/panel.module.css';

interface Props {
  inicial?: 'semana' | 'mes';
  semana: ReactNode;
  mes: ReactNode;
  etiquetas: { semana: ReactNode; mes: ReactNode };
}

/** Alterna entre la gráfica semanal y el calendario mensual sin recargar. */
export function Pestanas({ inicial = 'semana', semana, mes, etiquetas }: Props) {
  const [activa, setActiva] = useState(inicial);
  return (
    <>
      <div role="tablist" className={estilos.pestanas}>
        {(['semana', 'mes'] as const).map((id) => (
          <button
            key={id}
            role="tab"
            id={`tab-${id}`}
            aria-selected={activa === id}
            aria-controls={`panel-${id}`}
            className={activa === id ? estilos.pestanaActiva : ''}
            onClick={() => setActiva(id)}
          >
            {etiquetas[id]}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`panel-${activa}`} aria-labelledby={`tab-${activa}`}>
        {activa === 'semana' ? semana : mes}
      </div>
    </>
  );
}
