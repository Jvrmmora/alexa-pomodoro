import estilos from '@/app/panel.module.css';

interface Paso { titulo: string; frase?: string; nota?: string }
interface Fase { titulo: string; cuando: string; pasos: Paso[] }

function fases(encadenar: boolean): Fase[] {
  return [
    {
      titulo: 'Preparar',
      cuando: 'Una sola vez · queda guardado',
      pasos: [
        { titulo: 'Programar el descanso con cada foco (opcional)', frase: 'dile a mi pomodoro que active el encadenado', nota: 'Así no tienes que pedir el descanso: Alexa te avisa sola.' },
        { titulo: 'Ajustar las duraciones (opcional)', frase: 'dile a mi pomodoro que configure el foco en 30 minutos', nota: 'Para volver a 25 / 5 / 15: «que restablezca las duraciones».' },
      ],
    },
    {
      titulo: 'Trabajar',
      cuando: 'Cada bloque, varias veces al día',
      pasos: [
        { titulo: 'Empezar un foco con su tarea', frase: 'dile a mi pomodoro que empiece a enfocarme en [tarea]' },
        { titulo: 'Trabajar hasta que suene el timer', nota: 'Para callar la alarma: «Alexa, para».' },
        encadenar
          ? { titulo: 'Descansar', nota: 'El descanso ya está programado: empieza solo y Alexa te avisa cuando termina.' }
          : { titulo: 'Descansar', frase: 'dile a mi pomodoro que inicie un descanso', nota: 'Cada 4 focos completados el descanso es largo (15 min).' },
      ],
    },
    {
      titulo: 'Si algo cambia',
      cuando: 'Cuando lo necesites',
      pasos: [
        { titulo: 'Ver cuánto falta', frase: 'pregúntale a mi pomodoro cuánto falta' },
        { titulo: 'Parar el bloque (te interrumpieron)', frase: 'dile a mi pomodoro que cancele el bloque', nota: 'Queda como interrumpido y no suma al ciclo.' },
      ],
    },
    {
      titulo: 'Cerrar el día',
      cuando: 'Al terminar la jornada',
      pasos: [
        { titulo: 'Escuchar el resumen', frase: 'pídele a mi pomodoro que me dé el resumen de hoy' },
        { titulo: 'Revisar y corregir aquí en el panel', nota: 'Edita una tarea, cambia el estado o registra un bloque que hiciste sin Alexa (botón «Editar» en el historial).' },
      ],
    },
  ];
}

/** Rutina diaria agrupada por momento, con la frase exacta de cada paso. */
export function GuiaRutina({ encadenar }: { encadenar: boolean }) {
  let n = 0;
  return (
    <section className={estilos.tarjeta} aria-labelledby="guia-titulo">
      <h2 id="guia-titulo">Tu rutina diaria</h2>
      <p className={estilos.vacio}>Empieza cada frase con «Alexa,» y dila completa, en una sola vez.</p>
      <ol className={estilos.guia}>
        {fases(encadenar).map((fase) => (
          <li key={fase.titulo} className={estilos.fase}>
            <header>
              <h3>{fase.titulo}</h3>
              <span>{fase.cuando}</span>
            </header>
            <ul>
              {fase.pasos.map((p) => (
                <li key={p.titulo} className={estilos.paso}>
                  <span className={estilos.numero} aria-hidden="true">{++n}</span>
                  <div>
                    <strong>{p.titulo}</strong>
                    {p.frase && <q className={estilos.frase}>{p.frase}</q>}
                    {p.nota && <small>{p.nota}</small>}
                  </div>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </section>
  );
}
