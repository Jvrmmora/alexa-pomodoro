import * as Alexa from 'ask-sdk-core';
import type { RequestEnvelope, ResponseEnvelope } from 'ask-sdk-model';
import type { SessionRepository } from '../repositories/SessionRepository';
import type { TipoSesion } from '../tipos';
import {
  cancelarBloque, configurarDuracion, configurarEncadenado, consultarTiempo, iniciarBloque,
  restablecerDuraciones, resumenDelDia, type Deps,
} from './servicio';
import { AlexaTimerGateway, PERMISO_TIMERS, SinPermisoError, type TimerGateway } from './timers';

export interface ContextoSkill {
  repo: SessionRepository;
  ownerId: string;
  ahora?: () => Date;
  /** Sustituible en pruebas; por defecto usa la Timers API con el token de la request. */
  timers?: (env: RequestEnvelope) => TimerGateway;
}

const AYUDA = 'Puedes decir: empieza a enfocarme en una tarea, inicia un descanso, cuánto falta, cancela el bloque o dame el resumen de hoy. También puedes configurar las duraciones o activar el encadenado.';

/** Id canónico del slot (resuelto por sinónimos), o el valor tal cual si no hay resolución. */
function valorSlot(env: Parameters<typeof Alexa.getSlot>[0], nombre: string): string | undefined {
  const slot = Alexa.getSlot(env, nombre);
  const resuelto = slot?.resolutions?.resolutionsPerAuthority?.find((r) => r.status.code === 'ER_SUCCESS_MATCH')?.values[0]?.value.id;
  return resuelto ?? slot?.value;
}

const timersDesdeRequest = (env: RequestEnvelope): TimerGateway => {
  const { apiEndpoint, apiAccessToken } = env.context.System;
  if (!apiEndpoint || !apiAccessToken) throw new SinPermisoError();
  return new AlexaTimerGateway(apiEndpoint, apiAccessToken);
};

function intent(nombre: string, ejecutar: (h: Alexa.HandlerInput, d: Deps) => Promise<string>, ctx: ContextoSkill): Alexa.RequestHandler {
  return {
    canHandle: (h) => Alexa.getRequestType(h.requestEnvelope) === 'IntentRequest' && Alexa.getIntentName(h.requestEnvelope) === nombre,
    async handle(h) {
      try {
        const d: Deps = {
          repo: ctx.repo, ownerId: ctx.ownerId, ahora: ctx.ahora?.() ?? new Date(),
          timers: (ctx.timers ?? timersDesdeRequest)(h.requestEnvelope),
        };
        const voz = await ejecutar(h, d);
        return h.responseBuilder.speak(voz).getResponse();
      } catch (e) {
        if (e instanceof SinPermisoError) {
          return h.responseBuilder
            .speak('Para usar timers necesito tu permiso. Te envié una tarjeta a la app de Alexa.')
            .withAskForPermissionsConsentCard([PERMISO_TIMERS])
            .getResponse();
        }
        throw e;
      }
    },
  };
}

const simple = (tipoRequest: string, voz: string, cerrar = false): Alexa.RequestHandler => ({
  canHandle: (h) => Alexa.getRequestType(h.requestEnvelope) === tipoRequest,
  handle: (h) => (cerrar ? h.responseBuilder.speak(voz) : h.responseBuilder.speak(voz).reprompt(voz)).getResponse(),
});

const porNombre = (nombres: string[], voz: string, cerrar: boolean): Alexa.RequestHandler => ({
  canHandle: (h) => Alexa.getRequestType(h.requestEnvelope) === 'IntentRequest' && nombres.includes(Alexa.getIntentName(h.requestEnvelope)),
  handle: (h) => (cerrar ? h.responseBuilder.speak(voz) : h.responseBuilder.speak(voz).reprompt(voz)).getResponse(),
});

export function crearSkill(ctx: ContextoSkill) {
  return Alexa.SkillBuilders.custom()
    .addRequestHandlers(
      simple('LaunchRequest', `Pomodoro listo. ${AYUDA}`),
      intent('IniciarFoco', (h, d) => iniciarBloque(d, 'FOCO', Alexa.getSlotValue(h.requestEnvelope, 'tarea')), ctx),
      intent('IniciarDescanso', (_, d) => iniciarBloque(d, 'DESCANSO'), ctx),
      intent('CancelarBloque', (_, d) => cancelarBloque(d), ctx),
      intent('ConsultarTiempo', (_, d) => consultarTiempo(d), ctx),
      intent('Resumen', (_, d) => resumenDelDia(d), ctx),
      intent('ConfigurarDuracion', async (h, d) => {
        const tipo = valorSlot(h.requestEnvelope, 'tipo') as TipoSesion | undefined;
        const minutos = Number(valorSlot(h.requestEnvelope, 'minutos'));
        if (!tipo || !Number.isFinite(minutos)) return 'No te entendí. Di por ejemplo: configura el foco en 30 minutos.';
        return configurarDuracion(d, tipo, minutos);
      }, ctx),
      intent('RestablecerDuraciones', (_, d) => restablecerDuraciones(d), ctx),
      intent('ActivarEncadenado', (_, d) => configurarEncadenado(d, true), ctx),
      intent('DesactivarEncadenado', (_, d) => configurarEncadenado(d, false), ctx),
      porNombre(['AMAZON.HelpIntent'], AYUDA, false),
      porNombre(['AMAZON.CancelIntent', 'AMAZON.StopIntent'], 'Hasta luego.', true),
      porNombre(['AMAZON.NavigateHomeIntent'], AYUDA, false),
      porNombre(['AMAZON.FallbackIntent'], `No te entendí. ${AYUDA}`, false),
      { canHandle: (h) => Alexa.getRequestType(h.requestEnvelope) === 'SessionEndedRequest', handle: (h) => h.responseBuilder.getResponse() },
    )
    .addErrorHandlers({
      canHandle: () => true,
      handle(h, error) {
        console.error('Error en el skill:', error);
        return h.responseBuilder.speak('Algo salió mal. Inténtalo de nuevo en un momento.').getResponse();
      },
    })
    .create();
}

export async function procesar(ctx: ContextoSkill, env: RequestEnvelope): Promise<ResponseEnvelope> {
  return crearSkill(ctx).invoke(env);
}
