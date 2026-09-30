import { redirect } from 'next/navigation';
import { AutoRefresco } from '@/components/AutoRefresco';
import { Cuenta } from '@/components/Cuenta';
import { GraficaSemanal } from '@/components/GraficaSemanal';
import { haySesion } from '@/lib/autenticacion';
import { cargarPanel, type SesionVista } from '@/lib/panel';
import { obtenerRepositorio } from '@/lib/repositorio';
import { ZONA_HORARIA, type EstadoSesion, type TipoSesion } from '@/lib/tipos';
import { cerrarSesion, editarBloque, eliminarBloque, registrarBloque } from './acciones';
import estilos from './panel.module.css';

export const metadata = { title: 'Hoy · Pomodoro' };

const NOMBRE: Record<TipoSesion, string> = { FOCO: 'Foco', DESCANSO_CORTO: 'Descanso corto', DESCANSO_LARGO: 'Descanso largo' };
const ESTADO: Record<EstadoSesion, string> = { ACTIVA: 'En curso', COMPLETADA: 'Completado', INTERRUMPIDA: 'Interrumpido' };

const hora = (iso: string) =>
  new Intl.DateTimeFormat('es-CO', { timeZone: ZONA_HORARIA, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso));

function formatoMinutos(m: number) {
  const h = Math.floor(m / 60);
  return h > 0 ? `${h} h ${m % 60} min` : `${m} min`;
}

function Fila({ s }: { s: SesionVista }) {
  return (
    <li className={estilos.fila}>
      <span className={estilos.horaFila}>{hora(s.inicio)}</span>
      <span className={estilos.detalle}>
        <strong>{NOMBRE[s.tipo]}</strong>
        {s.tarea && <span className={estilos.tarea}>{s.tarea}</span>}
      </span>
      <span className={`${estilos.etiqueta} ${estilos[s.estado]}`}>{ESTADO[s.estado]}</span>
      {s.estado !== 'ACTIVA' && (
        <details className={estilos.editar}>
          <summary>Editar</summary>
          <form action={editarBloque} className={estilos.formulario}>
            <input type="hidden" name="id" value={s.id} />
            {s.tipo === 'FOCO' && (
              <label>Tarea<input name="tarea" defaultValue={s.tarea ?? ''} maxLength={80} /></label>
            )}
            <label>Estado
              <select name="estado" defaultValue={s.estado}>
                <option value="COMPLETADA">Completado</option>
                <option value="INTERRUMPIDA">Interrumpido</option>
              </select>
            </label>
            <div className={estilos.botones}>
              <button type="submit">Guardar</button>
              <button type="submit" formAction={eliminarBloque} className={estilos.peligro}>Eliminar</button>
            </div>
          </form>
        </details>
      )}
    </li>
  );
}

const COMANDOS: [string, string][] = [
  ['Empezar a trabajar', 'dile a mi pomodoro que empiece a enfocarme en [tarea]'],
  ['Descansar', 'dile a mi pomodoro que inicie un descanso'],
  ['Ver cuánto falta', 'pregúntale a mi pomodoro cuánto falta'],
  ['Parar el bloque', 'dile a mi pomodoro que cancele el bloque'],
  ['Ver cómo voy hoy', 'pídele a mi pomodoro que me dé el resumen de hoy'],
  ['Cambiar una duración', 'dile a mi pomodoro que configure el foco en 30 minutos'],
  ['Programar el descanso con cada foco', 'dile a mi pomodoro que active el encadenado'],
];

export default async function Panel({ searchParams }: PageProps<'/'>) {
  if (!(await haySesion())) redirect('/login');

  const { error } = await searchParams;
  const ownerId = process.env.ALEXA_OWNER_ID;
  if (!ownerId) throw new Error('Falta ALEXA_OWNER_ID');
  const datos = await cargarPanel(await obtenerRepositorio(), ownerId, new Date());
  const { activa, hoy } = datos;

  return (
    <main className={estilos.pagina}>
      <AutoRefresco />
      <header className={estilos.cabecera}>
        <h1>🍅 Hoy</h1>
        <form action={cerrarSesion}><button className={estilos.salir}>Salir</button></form>
      </header>

      {typeof error === 'string' && <p role="alert" className={estilos.aviso}>{error}</p>}

      <section className={`${estilos.tarjeta} ${estilos.activa}`} aria-label="Bloque activo">
        {activa ? (
          <>
            <p className={estilos.tipo}>{NOMBRE[activa.tipo]}{activa.tarea ? ` · ${activa.tarea}` : ''}</p>
            <Cuenta inicio={activa.inicio} fin={activa.finEsperado} ahora={datos.ahora} />
            <p className={estilos.pie}>Termina a las {hora(activa.finEsperado)}</p>
          </>
        ) : (
          <>
            <p className={estilos.tipo}>Sin bloque activo</p>
            <p className={estilos.vacio}>Di «dile a mi pomodoro que empiece a enfocarme» para arrancar.</p>
          </>
        )}
        <p className={estilos.ciclo}>Ciclo: {datos.focosEnCiclo} de 4 focos</p>
        <p className={estilos.ciclo}>
          {datos.config.foco} / {datos.config.descansoCorto} / {datos.config.descansoLargo} min
          {datos.config.encadenar ? ' · descansos encadenados' : ''}
        </p>
      </section>

      <section className={estilos.metricas} aria-label="Resumen del día">
        <div className={estilos.tarjeta}><b>{hoy.completados}</b><span>Completados</span></div>
        <div className={estilos.tarjeta}><b>{hoy.interrumpidos}</b><span>Interrumpidos</span></div>
        <div className={estilos.tarjeta}><b>{formatoMinutos(hoy.minutosEnfocados)}</b><span>Enfocado</span></div>
      </section>

      <section className={estilos.tarjeta}>
        <h2>Esta semana</h2>
        <GraficaSemanal dias={datos.semana} />
      </section>

      <section className={estilos.tarjeta}>
        <h2>Historial de hoy</h2>
        {hoy.sesiones.length === 0 ? (
          <p className={estilos.vacio}>Todavía no hay bloques hoy.</p>
        ) : (
          <ul className={estilos.lista}>{hoy.sesiones.map((s) => <Fila key={s.id} s={s} />)}</ul>
        )}
      </section>

      <section className={estilos.tarjeta}>
        <details className={estilos.editar}>
          <summary>Registrar un bloque que ya hiciste</summary>
          <form action={registrarBloque} className={estilos.formulario}>
            <label>Tipo
              <select name="tipo" defaultValue="FOCO">
                <option value="FOCO">Foco</option>
                <option value="DESCANSO_CORTO">Descanso corto</option>
                <option value="DESCANSO_LARGO">Descanso largo</option>
              </select>
            </label>
            <label>Tarea (solo focos)<input name="tarea" maxLength={80} /></label>
            <label>Hora de inicio (hoy)<input name="hora" type="time" required /></label>
            <label>Duración (min)<input name="minutos" type="number" min={1} max={180} defaultValue={25} required /></label>
            <div className={estilos.botones}><button type="submit">Registrar</button></div>
          </form>
        </details>
      </section>

      <section className={estilos.tarjeta}>
        <h2>Comandos de voz</h2>
        <p className={estilos.vacio}>Empieza con «Alexa,» y dilo en una sola frase.</p>
        <dl className={estilos.comandos}>
          {COMANDOS.map(([para, frase]) => (<div key={para}><dt>{para}</dt><dd>{frase}</dd></div>))}
        </dl>
      </section>
    </main>
  );
}
