import type { RequestEnvelope } from 'ask-sdk-model';
import { describe, expect, it } from 'vitest';
import { crearSkill } from '@/lib/alexa/skill';
import { cancelarBloque, consultarTiempo, decirDuracion, iniciarBloque, resumenDelDia, type Deps } from '@/lib/alexa/servicio';
import { AlexaTimerGateway, SinPermisoError, type TimerGateway } from '@/lib/alexa/timers';
import { reconciliar } from '@/lib/ciclo';
import { InMemorySessionRepository } from '@/lib/repositories/InMemorySessionRepository';
import { verificarRequestAlexa } from '@/lib/alexa/verificar';

const OWNER = 'u1';
const T0 = new Date('2026-01-05T15:00:00Z');
const min = (n: number) => n * 60_000;

class TimersFalso implements TimerGateway {
  creados: string[] = [];
  cancelados: string[] = [];
  falla = false;
  async crear(tipo: string) {
    if (this.falla) throw new Error('timer caído');
    this.creados.push(tipo);
    return `t${this.creados.length}`;
  }
  async cancelar(id: string) { this.cancelados.push(id); }
}

function montar(ahora = T0) {
  const repo = new InMemorySessionRepository();
  const timers = new TimersFalso();
  const deps = (a = ahora): Deps => ({ repo, timers, ownerId: OWNER, ahora: a });
  return { repo, timers, deps };
}

describe('servicio', () => {
  it('inicia un foco: crea timer, sesión y marca la activa', async () => {
    const { repo, timers, deps } = montar();
    const voz = await iniciarBloque(deps(), 'FOCO', 'API de pagos');
    expect(voz).toContain('API de pagos');
    expect(timers.creados).toEqual(['FOCO']);
    const activa = await repo.obtenerSesionActiva(OWNER);
    expect(activa).toMatchObject({ tipo: 'FOCO', tarea: 'API de pagos', timerId: 't1', origen: 'VOZ' });
    expect(activa!.finEsperado.getTime()).toBe(T0.getTime() + min(25));
  });

  it('no inicia otro bloque si hay uno activo', async () => {
    const { timers, deps } = montar();
    await iniciarBloque(deps(), 'FOCO');
    const voz = await iniciarBloque(deps(new Date(T0.getTime() + min(10))), 'FOCO');
    expect(voz).toContain('15 minutos');
    expect(timers.creados).toHaveLength(1);
  });

  it('si falla el timer no guarda sesión', async () => {
    const { repo, timers, deps } = montar();
    timers.falla = true;
    await expect(iniciarBloque(deps(), 'FOCO')).rejects.toThrow('timer caído');
    expect(await repo.obtenerSesionActiva(OWNER)).toBeNull();
  });

  it('si falla la BD cancela el timer', async () => {
    const { repo, timers, deps } = montar();
    repo.crearSesion = async () => { throw new Error('bd caída'); };
    await expect(iniciarBloque(deps(), 'FOCO')).rejects.toThrow('bd caída');
    expect(timers.cancelados).toEqual(['t1']);
  });

  it('cancelar marca INTERRUMPIDA, cancela el timer y no suma al ciclo', async () => {
    const { repo, timers, deps } = montar();
    await iniciarBloque(deps(), 'FOCO');
    await cancelarBloque(deps(new Date(T0.getTime() + min(5))));
    expect(timers.cancelados).toEqual(['t1']);
    expect(await repo.obtenerSesionActiva(OWNER)).toBeNull();
    expect((await repo.obtenerEstado(OWNER)).focosEnCiclo).toBe(0);
    expect(await cancelarBloque(deps())).toContain('No tienes');
  });

  it('consulta el tiempo restante', async () => {
    const { deps } = montar();
    expect(await consultarTiempo(deps())).toContain('No tienes');
    await iniciarBloque(deps(), 'FOCO');
    expect(await consultarTiempo(deps(new Date(T0.getTime() + min(20))))).toContain('5 minutos');
  });

  it('tras 4 focos completados el descanso es largo y luego el ciclo se reinicia', async () => {
    const { repo, deps } = montar();
    let t = T0;
    for (let i = 0; i < 4; i++) {
      await iniciarBloque(deps(t), 'FOCO');
      t = new Date(t.getTime() + min(26));
      await reconciliar(repo, OWNER, t);
    }
    expect((await repo.obtenerEstado(OWNER)).focosEnCiclo).toBe(4);
    expect(await iniciarBloque(deps(t), 'DESCANSO')).toContain('15 minutos');
    await reconciliar(repo, OWNER, new Date(t.getTime() + min(16)));
    expect((await repo.obtenerEstado(OWNER)).focosEnCiclo).toBe(0);
  });

  it('resumen cuenta completados e interrumpidos de hoy', async () => {
    const { deps } = montar();
    expect(await resumenDelDia(deps())).toContain('todavía no');
    await iniciarBloque(deps(), 'FOCO');
    const t1 = new Date(T0.getTime() + min(30));
    await iniciarBloque(deps(t1), 'FOCO'); // reconcilia el primero como completado
    await cancelarBloque(deps(new Date(t1.getTime() + min(1))));
    expect(await resumenDelDia(deps(new Date(t1.getTime() + min(2))))).toBe(
      'Hoy completaste 1 pomodoro y 1 quedó interrumpido.',
    );
  });

  it('decirDuracion', () => {
    expect(decirDuracion(min(1))).toBe('1 minuto');
    expect(decirDuracion(min(3) + 20_000)).toBe('3 minutos y 20 segundos');
    expect(decirDuracion(30_000)).toBe('30 segundos');
  });
});

function envelope(intentName: string, slots: Record<string, { name: string; value: string }> = {}): RequestEnvelope {
  return {
    version: '1.0',
    session: { new: true, sessionId: 's', application: { applicationId: 'a' }, user: { userId: OWNER } },
    context: { System: { application: { applicationId: 'a' }, user: { userId: OWNER }, device: { deviceId: 'd' }, apiEndpoint: 'https://api', apiAccessToken: 'tok' } },
    request: { type: 'IntentRequest', requestId: 'r', timestamp: T0.toISOString(), locale: 'es-MX', intent: { name: intentName, confirmationStatus: 'NONE', slots: Object.fromEntries(Object.entries(slots).map(([k, v]) => [k, { ...v, confirmationStatus: 'NONE' }])) } },
  } as RequestEnvelope;
}

describe('skill', () => {
  it('IniciarFoco usa el slot tarea', async () => {
    const { repo, timers } = montar();
    const skill = crearSkill({ repo, ownerId: OWNER, ahora: () => T0, timers: () => timers });
    const res = await skill.invoke(envelope('IniciarFoco', { tarea: { name: 'tarea', value: 'el informe' } }));
    expect((res.response.outputSpeech as { ssml: string }).ssml).toContain('el informe');
  });

  it('pide permiso si no hay token de timers', async () => {
    const { repo } = montar();
    const skill = crearSkill({ repo, ownerId: OWNER, ahora: () => T0 });
    const env = envelope('IniciarFoco');
    delete env.context.System.apiAccessToken;
    const res = await skill.invoke(env);
    expect(res.response.card?.type).toBe('AskForPermissionsConsent');
  });
});

describe('AlexaTimerGateway', () => {
  it('crea un timer con la duración correcta y devuelve el id', async () => {
    let enviado: { url: string; init: RequestInit } | undefined;
    const fetchFalso = (async (url: string, init: RequestInit) => {
      enviado = { url, init };
      return new Response(JSON.stringify({ id: 'abc' }), { status: 200 });
    }) as unknown as typeof fetch;
    const id = await new AlexaTimerGateway('https://api', 'tok', fetchFalso).crear('FOCO', 'x');
    expect(id).toBe('abc');
    expect(enviado!.url).toBe('https://api/v1/alexa/me/timers');
    expect(JSON.parse(enviado!.init.body as string).duration).toBe('PT25M');
  });

  it('403 → SinPermisoError; 404 al cancelar se tolera', async () => {
    const r = (status: number) => (async () => new Response('{}', { status })) as unknown as typeof fetch;
    await expect(new AlexaTimerGateway('https://api', 't', r(403)).crear('FOCO')).rejects.toBeInstanceOf(SinPermisoError);
    await expect(new AlexaTimerGateway('https://api', 't', r(404)).cancelar('x')).resolves.toBeUndefined();
    await expect(new AlexaTimerGateway('https://api', 't', r(500)).cancelar('x')).rejects.toThrow();
  });
});

describe('verificarRequestAlexa', () => {
  it('rechaza una request sin firma ni timestamp válidos', async () => {
    const cuerpo = JSON.stringify({ request: { timestamp: '2020-01-01T00:00:00Z' } });
    await expect(verificarRequestAlexa(cuerpo, new Headers())).rejects.toThrow();
  });
});
