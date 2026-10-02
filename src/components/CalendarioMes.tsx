import Link from 'next/link';
import { Icono } from '@/components/Icono';
import { enlacePanel } from '@/lib/enlaces';
import type { DatosPanel } from '@/lib/panel';
import estilos from '@/app/panel.module.css';

const CABECERA = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];

/** Filtro por mes del año y calendario del mes elegido; cada día lleva a su historial. */
export function CalendarioMes({ mes, meses, dia }: Pick<DatosPanel, 'mes' | 'meses'> & { dia: DatosPanel['dia'] }) {
  const diaActual = dia.esHoy ? undefined : dia.clave;
  const irMes = (clave: string) => enlacePanel({ dia: diaActual, mes: clave });
  const mismoMes = (anio: number) => `${anio}-${mes.clave.slice(5)}`;
  const max = Math.max(1, ...mes.dias.map((d) => d.completados + d.interrumpidos));

  return (
    <div>
      <div className={estilos.navegarSemana}>
        <Link replace scroll={false} href={irMes(mismoMes(mes.anio - 1))} aria-label="Año anterior"><Icono nombre="atras" tamano={16} /></Link>
        <span>{mes.anio}</span>
        <Link replace scroll={false} href={irMes(mismoMes(mes.anio + 1))} aria-label="Año siguiente"><Icono nombre="adelante" tamano={16} /></Link>
      </div>

      <nav className={estilos.meses} aria-label={`Meses de ${mes.anio}`}>
        {meses.map((m) => (
          <Link
            replace
            scroll={false}
            key={m.clave}
            href={irMes(m.clave)}
            aria-current={m.seleccionado ? 'true' : undefined}
            title={`${m.completados} completados, ${m.interrumpidos} interrumpidos`}
            className={`${estilos.chipMes} ${m.seleccionado ? estilos.elegido : ''} ${m.completados + m.interrumpidos > 0 ? estilos.conDatos : ''}`}
          >
            {m.etiqueta}
          </Link>
        ))}
      </nav>

      <h3 className={estilos.tituloMes}>{mes.titulo}</h3>
      <div className={estilos.calendario}>
        {CABECERA.map((l, i) => <span key={i} className={estilos.cabeceraDia} aria-hidden="true">{l}</span>)}
        {Array.from({ length: mes.huecosInicio }, (_, i) => <span key={`h${i}`} />)}
        {mes.dias.map((d) => {
          const total = d.completados + d.interrumpidos;
          return (
            <Link
            replace
            scroll={false}
              key={d.clave}
              href={enlacePanel({ dia: d.esHoy ? undefined : d.clave, mes: mes.clave })}
              aria-current={d.seleccionado ? 'date' : undefined}
              aria-label={`${d.numero}: ${d.completados} completados, ${d.interrumpidos} interrumpidos`}
              className={`${estilos.celda} ${d.esHoy ? estilos.hoy : ''} ${d.seleccionado ? estilos.elegido : ''}`}
              style={total ? ({ '--nivel': Math.max(0.18, total / max) } as React.CSSProperties) : undefined}
              data-con-datos={total > 0 ? '' : undefined}
            >
              {d.numero}
              {total > 0 && <small>{total}</small>}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
