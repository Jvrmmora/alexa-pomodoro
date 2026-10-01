import { redirect } from 'next/navigation';
import { AutoRefresco } from '@/components/AutoRefresco';
import { Cuenta } from '@/components/Cuenta';
import { GraficaSemanal } from '@/components/GraficaSemanal';
import { GuiaRutina } from '@/components/GuiaRutina';
import { Icono, type NombreIcono } from '@/components/Icono';
import { LogoAlexa } from '@/components/LogoAlexa';
import { haySesion } from '@/lib/autenticacion';
import { cargarPanel, type SesionVista } from '@/lib/panel';
import { obtenerRepositorio } from '@/lib/repositorio';
import { ZONA_HORARIA, type EstadoSesion, type TipoSesion } from '@/lib/tipos';
import { cerrarSesion, editarBloque, eliminarBloque, registrarBloque } from './acciones';
import estilos from './panel.module.css';

export const metadata = { title: 'Hoy · Alexa Pomodoro' };

const NOMBRE: Record<TipoSesion, string> = { FOCO: 'Foco', DESCANSO_CORTO: 'Descanso corto', DESCANSO_LARGO: 'Descanso largo' };
const ESTADO: Record<EstadoSesion, string> = { ACTIVA: 'En curso', COMPLETADA: 'Completado', INTERRUMPIDA: 'Interrumpido' };
const ICONO_TIPO: Record<TipoSesion, NombreIcono> = { FOCO: 'objetivo', DESCANSO_CORTO: 'taza', DESCANSO_LARGO: 'taza' };

const hora = (iso: string) =>
  new Intl.DateTimeFormat('es-CO', { timeZone: ZONA_HORARIA, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso));

const fechaLarga = (d: Date) =>
  new Intl.DateTimeFormat('es-CO', { timeZone: ZONA_HORARIA, weekday: 'long', day: 'numeric', month: 'long' }).format(d);

function formatoMinutos(m: number) {
  const h = Math.floor(m / 60);
  return h > 0 ? `${h} h ${m % 60} min` : `${m} min`;
}

const retraso = (i: number) => ({ '--i': i }) as React.CSSProperties;

function Fila({ s }: { s: SesionVista }) {
  return (
    <li className={estilos.fila}>
      <span className={`${estilos.icoTipo} ${estilos[s.tipo]}`}><Icono nombre={ICONO_TIPO[s.tipo]} tamano={18} /></span>
      <span className={estilos.detalle}>
        <strong>{NOMBRE[s.tipo]}</strong>
        <span className={estilos.tarea}>{s.tarea ?? `${hora(s.inicio)} · ${s.minutos} min`}</span>
      </span>
      <span className={estilos.horaFila}>{hora(s.inicio)}</span>
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

export default async function Panel({ searchParams }: PageProps<'/'>) {
  if (!(await haySesion())) redirect('/login');

  const { error } = await searchParams;
  const ownerId = process.env.ALEXA_OWNER_ID;
  if (!ownerId) throw new Error('Falta ALEXA_OWNER_ID');
  const datos = await cargarPanel(await obtenerRepositorio(), ownerId, new Date());
  const { activa, hoy, config } = datos;

  return (
    <main className={estilos.pagina}>
      <AutoRefresco />
      <header className={`${estilos.cabecera} ${estilos.aparece}`}>
        <div className={estilos.marca}>
          <LogoAlexa tamano={44} id="cabecera" />
          <div>
            <h1>Alexa Pomodoro</h1>
            <p className={estilos.fecha}>{fechaLarga(new Date(datos.ahora))}</p>
          </div>
        </div>
        <form action={cerrarSesion}>
          <button className={estilos.salir}><Icono nombre="salir" tamano={16} /> Salir</button>
        </form>
      </header>

      {typeof error === 'string' && <p role="alert" className={estilos.aviso}>{error}</p>}

      <section className={`${estilos.tarjeta} ${estilos.activa} ${estilos.aparece}`} style={retraso(1)} aria-label="Bloque activo">
        <div className={estilos.heroAnillo}>
          {activa ? (
            <Cuenta inicio={activa.inicio} fin={activa.finEsperado} ahora={datos.ahora} />
          ) : (
            <div className={`${estilos.anillo} ${estilos.reposo}`}>
              <svg viewBox="0 0 200 200" aria-hidden="true"><circle className={estilos.pista} cx="100" cy="100" r="88" /></svg>
              <div className={estilos.centro}><Icono nombre="microfono" tamano={44} /></div>
            </div>
          )}
        </div>
        <div className={estilos.heroTexto}>
          {activa ? (
            <>
              <span className={`${estilos.pildora} ${estilos[activa.tipo]}`}><Icono nombre={ICONO_TIPO[activa.tipo]} tamano={14} /> {NOMBRE[activa.tipo]} en curso</span>
              <h2>{activa.tarea ?? NOMBRE[activa.tipo]}</h2>
              <p className={estilos.pie}>Termina a las {hora(activa.finEsperado)}</p>
              {activa.siguiente && (
                <p className={estilos.siguiente}><Icono nombre="taza" tamano={15} /> Después: {NOMBRE[activa.siguiente.tipo].toLowerCase()} de {activa.siguiente.minutos} min, programado</p>
              )}
            </>
          ) : (
            <>
              <span className={estilos.pildora}>Listo para empezar</span>
              <h2>Sin bloque activo</h2>
              <p className={estilos.pie}>Di «Alexa, dile a mi pomodoro que empiece a enfocarme» para arrancar.</p>
            </>
          )}
          <div className={estilos.ciclo} aria-label={`Ciclo: ${datos.focosEnCiclo} de 4 focos`}>
            {[0, 1, 2, 3].map((n) => <i key={n} className={n < datos.focosEnCiclo ? estilos.lleno : ''} />)}
            <span>{datos.focosEnCiclo} de 4 focos</span>
          </div>
          <p className={estilos.config}>
            {config.foco} / {config.descansoCorto} / {config.descansoLargo} min{config.encadenar ? ' · descansos encadenados' : ''}
          </p>
        </div>
      </section>

      <section className={estilos.metricas} aria-label="Resumen del día">
        <div className={`${estilos.tarjeta} ${estilos.aparece}`} style={retraso(2)}>
          <Icono nombre="completado" /><b>{hoy.completados}</b><span>Completados</span>
        </div>
        <div className={`${estilos.tarjeta} ${estilos.aparece}`} style={retraso(3)}>
          <Icono nombre="interrumpido" /><b>{hoy.interrumpidos}</b><span>Interrumpidos</span>
        </div>
        <div className={`${estilos.tarjeta} ${estilos.aparece}`} style={retraso(4)}>
          <Icono nombre="reloj" /><b>{formatoMinutos(hoy.minutosEnfocados)}</b><span>Enfocado</span>
        </div>
      </section>

      <section className={`${estilos.tarjeta} ${estilos.aparece}`} style={retraso(4)}>
        <h2><Icono nombre="grafica" tamano={18} /> Esta semana</h2>
        <GraficaSemanal dias={datos.semana} />
      </section>

      <section className={`${estilos.tarjeta} ${estilos.aparece}`} style={retraso(5)}>
        <h2><Icono nombre="historial" tamano={18} /> Historial de hoy</h2>
        {hoy.sesiones.length === 0 ? (
          <p className={estilos.vacio}>Todavía no hay bloques hoy.</p>
        ) : (
          <ul className={estilos.lista}>{hoy.sesiones.map((s) => <Fila key={s.id} s={s} />)}</ul>
        )}
        <details className={`${estilos.editar} ${estilos.registrar}`}>
          <summary><Icono nombre="mas" tamano={15} /> Registrar un bloque que ya hiciste</summary>
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

      <GuiaRutina encadenar={config.encadenar} />
    </main>
  );
}
