import { describe, expect, it } from 'vitest';
import { cargarPanel } from '@/lib/panel';
import { InMemorySessionRepository } from '@/lib/repositories/InMemorySessionRepository';
import { COOKIE_SESION, crearToken, passwordCorrecta, tokenValido } from '@/lib/sesionPanel';

const OWNER = 'u1';
const min = (n: number) => n * 60_000;
// Miércoles 7 ene 2026, 10:00 en Bogotá (UTC-5)
const AHORA = new Date('2026-01-07T15:00:00Z');

async function sesion(repo: InMemorySessionRepository, inicio: Date, tipo: 'FOCO' | 'DESCANSO_CORTO', estado: 'COMPLETADA' | 'INTERRUMPIDA', dur = 25) {
  await repo.crearSesion({
    ownerId: OWNER, tipo, inicio, finEsperado: new Date(inicio.getTime() + min(dur)),
    fin: new Date(inicio.getTime() + min(dur)), estado, origen: 'VOZ',
  });
}

describe('cargarPanel', () => {
  it('cuenta hoy y reparte la semana por día (lunes a domingo, hora de Bogotá)', async () => {
    const repo = new InMemorySessionRepository();
    await sesion(repo, new Date('2026-01-05T14:00:00Z'), 'FOCO', 'COMPLETADA'); // lunes
    await sesion(repo, new Date('2026-01-07T13:00:00Z'), 'FOCO', 'COMPLETADA'); // hoy
    await sesion(repo, new Date('2026-01-07T13:30:00Z'), 'DESCANSO_CORTO', 'COMPLETADA', 5);
    await sesion(repo, new Date('2026-01-07T14:00:00Z'), 'FOCO', 'INTERRUMPIDA', 10); // hoy
    await sesion(repo, new Date('2026-01-04T14:00:00Z'), 'FOCO', 'COMPLETADA'); // semana anterior

    const p = await cargarPanel(repo, OWNER, AHORA);

    expect(p.hoy).toMatchObject({ completados: 1, interrumpidos: 1, minutosEnfocados: 25 });
    expect(p.hoy.sesiones).toHaveLength(3);
    expect(p.semana).toHaveLength(7);
    expect(p.semana[0]).toMatchObject({ etiqueta: 'lun', completados: 1, esHoy: false });
    expect(p.semana[2]).toMatchObject({ etiqueta: 'mié', completados: 1, interrumpidos: 1, esHoy: true });
    expect(p.semana.reduce((t, d) => t + d.completados, 0)).toBe(2);
  });

  it('un foco que cruza la medianoche cuenta por su fecha de inicio', async () => {
    const repo = new InMemorySessionRepository();
    await sesion(repo, new Date('2026-01-07T04:50:00Z'), 'FOCO', 'COMPLETADA'); // 23:50 del martes en Bogotá
    const p = await cargarPanel(repo, OWNER, AHORA);
    expect(p.semana[1].completados).toBe(1);
    expect(p.hoy.completados).toBe(0);
  });

  it('reconcilia una sesión vencida y no la muestra como activa', async () => {
    const repo = new InMemorySessionRepository();
    const s = await repo.crearSesion({
      ownerId: OWNER, tipo: 'FOCO', inicio: new Date(AHORA.getTime() - min(40)),
      finEsperado: new Date(AHORA.getTime() - min(15)), estado: 'ACTIVA', origen: 'VOZ',
    });
    const e = await repo.obtenerEstado(OWNER);
    e.sesionActivaId = s._id;
    await repo.guardarEstado(e);

    const p = await cargarPanel(repo, OWNER, AHORA);
    expect(p.activa).toBeNull();
    expect(p.hoy.completados).toBe(1);
    expect(p.focosEnCiclo).toBe(1);
  });

  it('expone la sesión activa con su fin', async () => {
    const repo = new InMemorySessionRepository();
    const s = await repo.crearSesion({
      ownerId: OWNER, tipo: 'FOCO', tarea: 'API', inicio: new Date(AHORA.getTime() - min(5)),
      finEsperado: new Date(AHORA.getTime() + min(20)), estado: 'ACTIVA', origen: 'VOZ',
    });
    const e = await repo.obtenerEstado(OWNER);
    e.sesionActivaId = s._id;
    await repo.guardarEstado(e);
    const p = await cargarPanel(repo, OWNER, AHORA);
    expect(p.activa).toMatchObject({ tipo: 'FOCO', tarea: 'API', finEsperado: new Date(AHORA.getTime() + min(20)).toISOString() });
  });
});

describe('sesión del panel', () => {
  it('acepta un token propio vigente', () => {
    expect(tokenValido(crearToken('secreto', AHORA), 'secreto', AHORA)).toBe(true);
  });
  it('rechaza token vencido, manipulado, con otro secreto o vacío', () => {
    const t = crearToken('secreto', AHORA);
    expect(tokenValido(t, 'secreto', new Date(AHORA.getTime() + 31 * 24 * 3600_000))).toBe(false);
    expect(tokenValido(t.replace(/^\d/, '9'), 'secreto', AHORA)).toBe(false);
    expect(tokenValido(t, 'otro', AHORA)).toBe(false);
    expect(tokenValido(undefined, 'secreto', AHORA)).toBe(false);
    expect(tokenValido(t, '', AHORA)).toBe(false);
  });
  it('compara la contraseña', () => {
    expect(passwordCorrecta('abc', 'abc')).toBe(true);
    expect(passwordCorrecta('abd', 'abc')).toBe(false);
    expect(passwordCorrecta('abc', undefined)).toBe(false);
    expect(COOKIE_SESION).toBeTruthy();
  });
});
