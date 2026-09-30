import { DURACION_MIN } from '../ciclo';
import type { TipoSesion } from '../tipos';

export const PERMISO_TIMERS = 'alexa::alerts:timers:skill:readwrite';

export class SinPermisoError extends Error {
  constructor() { super('El usuario no ha concedido el permiso de timers'); }
}

/** Abstracción de la Timers API de Alexa (se sustituye por un falso en pruebas). */
export interface TimerGateway {
  crear(tipo: TipoSesion, tarea?: string): Promise<string>;
  cancelar(timerId: string): Promise<void>;
}

const ETIQUETA: Record<TipoSesion, string> = {
  FOCO: 'Foco', DESCANSO_CORTO: 'Descanso corto', DESCANSO_LARGO: 'Descanso largo',
};
const ANUNCIO: Record<TipoSesion, string> = {
  FOCO: 'Terminó tu bloque de foco. Toma un descanso.',
  DESCANSO_CORTO: 'Terminó el descanso. Es hora de volver al foco.',
  DESCANSO_LARGO: 'Terminó el descanso largo. Es hora de volver al foco.',
};

export class AlexaTimerGateway implements TimerGateway {
  constructor(
    private readonly apiEndpoint: string,
    private readonly token: string,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  private get url() { return `${this.apiEndpoint}/v1/alexa/me/timers`; }
  private get headers() {
    return { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' };
  }

  async crear(tipo: TipoSesion, tarea?: string): Promise<string> {
    const res = await this.fetchFn(this.url, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({
        duration: `PT${DURACION_MIN[tipo]}M`,
        timerLabel: tarea ? `${ETIQUETA[tipo]}: ${tarea}` : ETIQUETA[tipo],
        creationBehavior: { displayExperience: { visibility: 'VISIBLE' } },
        triggeringBehavior: {
          operation: { type: 'ANNOUNCE', textToAnnounce: [{ locale: 'es-MX', text: ANUNCIO[tipo] }] },
          notificationConfig: { playAudible: true },
        },
      }),
    });
    if (res.status === 401 || res.status === 403) throw new SinPermisoError();
    if (!res.ok) throw new Error(`Timers API respondió ${res.status}`);
    const { id } = (await res.json()) as { id: string };
    return id;
  }

  async cancelar(timerId: string): Promise<void> {
    const res = await this.fetchFn(`${this.url}/${encodeURIComponent(timerId)}`, {
      method: 'DELETE',
      headers: this.headers,
    });
    // 404: el timer ya no existe (venció o se canceló a mano); es el resultado buscado.
    if (!res.ok && res.status !== 404) throw new Error(`Timers API respondió ${res.status}`);
  }
}
