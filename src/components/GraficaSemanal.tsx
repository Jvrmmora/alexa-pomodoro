import Link from 'next/link';
import { Icono } from '@/components/Icono';
import { enlacePanel, sumarDias } from '@/lib/enlaces';
import type { DiaSemana } from '@/lib/panel';
import estilos from '@/app/panel.module.css';

const diaMes = (clave: string) => clave.slice(5).split('-').reverse().join('/'); // 2026-10-03 → 03/10

export function GraficaSemanal({ dias, mes }: { dias: DiaSemana[]; mes?: string }) {
  const max = Math.max(1, ...dias.map((d) => d.completados + d.interrumpidos));
  const resumen = dias.map((d) => `${d.etiqueta}: ${d.completados} completados, ${d.interrumpidos} interrumpidos`).join('. ');
  const enlace = (d: DiaSemana) => enlacePanel({ dia: d.esHoy ? undefined : d.clave, mes });
  const semanaAnterior = sumarDias(dias[0].clave, -7);
  const semanaSiguiente = sumarDias(dias[0].clave, 7);
  return (
    <div>
      <div className={estilos.navegarSemana}>
        <Link replace scroll={false} href={enlacePanel({ dia: semanaAnterior, mes })} aria-label="Semana anterior"><Icono nombre="atras" tamano={16} /></Link>
        <span>{diaMes(dias[0].clave)} – {diaMes(dias[6].clave)}</span>
        <Link replace scroll={false} href={enlacePanel({ dia: semanaSiguiente, mes })} aria-label="Semana siguiente"><Icono nombre="adelante" tamano={16} /></Link>
      </div>
      <div className={estilos.grafica} role="group" aria-label={`Pomodoros de la semana. ${resumen}`}>
        {dias.map((d, i) => (
          <Link
            replace
            scroll={false}
            key={d.clave}
            href={enlace(d)}
            aria-current={d.seleccionado ? 'date' : undefined}
            aria-label={`${d.etiqueta} ${d.clave}: ${d.completados} completados, ${d.interrumpidos} interrumpidos. Ver historial`}
            className={`${estilos.columna} ${d.esHoy ? estilos.hoy : ''} ${d.seleccionado ? estilos.elegido : ''}`}
            style={{ '--i': i } as React.CSSProperties}
          >
            <span className={estilos.total}>{d.completados + d.interrumpidos || ''}</span>
            <div className={estilos.pila}>
              <span className={estilos.interrumpido} style={{ height: `${(d.interrumpidos / max) * 100}%` }} />
              <span className={estilos.completado} style={{ height: `${(d.completados / max) * 100}%` }} />
            </div>
            <span className={estilos.dia}>{d.etiqueta}</span>
          </Link>
        ))}
      </div>
      <p className={estilos.leyenda}>
        <span><i className={estilos.completado} /> Completados</span>
        <span><i className={estilos.interrumpido} /> Interrumpidos</span>
        <span><i className={estilos.marcaHoy} /> Hoy</span>
      </p>
    </div>
  );
}
