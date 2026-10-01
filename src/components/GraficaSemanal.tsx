import type { DiaSemana } from '@/lib/panel';
import estilos from '@/app/panel.module.css';

export function GraficaSemanal({ dias }: { dias: DiaSemana[] }) {
  const max = Math.max(1, ...dias.map((d) => d.completados + d.interrumpidos));
  const resumen = dias.map((d) => `${d.etiqueta}: ${d.completados} completados, ${d.interrumpidos} interrumpidos`).join('. ');
  return (
    <div>
      <div className={estilos.grafica} role="img" aria-label={`Pomodoros de la semana. ${resumen}`}>
        {dias.map((d, i) => (
          <div key={d.etiqueta} className={`${estilos.columna} ${d.esHoy ? estilos.hoy : ''}`} style={{ '--i': i } as React.CSSProperties}>
            <span className={estilos.total}>{d.completados + d.interrumpidos || ''}</span>
            <div className={estilos.pila}>
              <span className={estilos.interrumpido} style={{ height: `${(d.interrumpidos / max) * 100}%` }} />
              <span className={estilos.completado} style={{ height: `${(d.completados / max) * 100}%` }} />
            </div>
            <span className={estilos.dia}>{d.etiqueta}</span>
          </div>
        ))}
      </div>
      <p className={estilos.leyenda}>
        <span><i className={estilos.completado} /> Completados</span>
        <span><i className={estilos.interrumpido} /> Interrumpidos</span>
      </p>
    </div>
  );
}
