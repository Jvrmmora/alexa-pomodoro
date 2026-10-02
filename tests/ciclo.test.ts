import { describe, expect, it } from 'vitest';
import { reconciliar, tipoDescanso } from '@/lib/ciclo';
import { InMemorySessionRepository } from '@/lib/repositories/InMemorySessionRepository';
import { rangoDia, rangoSemana } from '@/lib/tiempo';

const OWNER = 'u1';
const min = (n: number) => n * 60_000;

async function iniciar(repo: InMemorySessionRepository, tipo: 'FOCO' | 'DESCANSO_CORTO', inicio: Date, dur: number) {
  const s = await repo.crearSesion({
    ownerId: OWNER, tipo, inicio, finEsperado: new Date(inicio.getTime() + min(dur)), estado: 'ACTIVA', origen: 'VOZ',
  });
  const e = await repo.obtenerEstado(OWNER);
  e.sesionActivaId = s._id;
  await repo.guardarEstado(e);
  return s;
}

describe('reconciliar', () => {
  it('no toca una sesión vigente', async () => {
    const repo = new InMemorySessionRepository();
    const t0 = new Date('2026-01-05T15:00:00Z');
    await iniciar(repo, 'FOCO', t0, 25);
    const activa = await reconciliar(repo, OWNER, new Date(t0.getTime() + min(10)));
    expect(activa?.estado).toBe('ACTIVA');
  });

  it('completa un foco vencido y suma al ciclo', async () => {
    const repo = new InMemorySessionRepository();
    const t0 = new Date('2026-01-05T15:00:00Z');
    const s = await iniciar(repo, 'FOCO', t0, 25);
    expect(await reconciliar(repo, OWNER, new Date(t0.getTime() + min(40)))).toBeNull();
    expect((await repo.obtenerEstado(OWNER)).focosEnCiclo).toBe(1);
    const [guardada] = await repo.listarSesiones(OWNER, t0, new Date(t0.getTime() + min(60)));
    expect(guardada._id).toBe(s._id);
    expect(guardada.estado).toBe('COMPLETADA');
  });

  it('un descanso vencido no suma al ciclo', async () => {
    const repo = new InMemorySessionRepository();
    const t0 = new Date('2026-01-05T15:00:00Z');
    await iniciar(repo, 'DESCANSO_CORTO', t0, 5);
    await reconciliar(repo, OWNER, new Date(t0.getTime() + min(6)));
    expect((await repo.obtenerEstado(OWNER)).focosEnCiclo).toBe(0);
  });
});

describe('tipoDescanso', () => {
  it('largo tras 4 focos, corto antes', () => {
    expect(tipoDescanso(3)).toBe('DESCANSO_CORTO');
    expect(tipoDescanso(4)).toBe('DESCANSO_LARGO');
  });
});

describe('tiempo en Bogotá (UTC-5)', () => {
  it('00:30 UTC del día 6 sigue siendo el día 5 en Bogotá', () => {
    const { desde, hasta } = rangoDia(new Date('2026-01-06T00:30:00Z'));
    expect(desde.toISOString()).toBe('2026-01-05T05:00:00.000Z');
    expect(hasta.toISOString()).toBe('2026-01-06T05:00:00.000Z');
  });

  it('la semana empieza el domingo', () => {
    const { desde, hasta } = rangoSemana(new Date('2026-01-07T18:00:00Z')); // miércoles
    expect(desde.toISOString()).toBe('2026-01-04T05:00:00.000Z'); // domingo
    expect(hasta.toISOString()).toBe('2026-01-11T05:00:00.000Z');
  });
});
