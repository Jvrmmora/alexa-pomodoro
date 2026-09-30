import { describe, expect, it } from 'vitest';
import { borrarSesion, crearSesionManual, editarSesion } from '@/lib/edicion';
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

describe('edición desde el panel', () => {
  const ahora = new Date('2026-01-07T20:00:00Z');

  it('edita tarea y estado de un bloque terminado', async () => {
    const repo = new InMemorySessionRepository();
    await sesion(repo, new Date('2026-01-07T13:00:00Z'), 'FOCO', 'INTERRUMPIDA');
    await editarSesion(repo, OWNER, '1', { tarea: '  informe   final ', estado: 'COMPLETADA' });
    expect(await repo.obtenerSesion(OWNER, '1')).toMatchObject({ tarea: 'informe final', estado: 'COMPLETADA' });
    await editarSesion(repo, OWNER, '1', { tarea: '   ' });
    expect((await repo.obtenerSesion(OWNER, '1'))!.tarea).toBeUndefined();
  });

  it('rechaza editar un bloque activo, ajeno, inexistente o con datos inválidos', async () => {
    const repo = new InMemorySessionRepository();
    await repo.crearSesion({ ownerId: OWNER, tipo: 'FOCO', inicio: ahora, finEsperado: ahora, estado: 'ACTIVA', origen: 'VOZ' });
    await sesion(repo, new Date('2026-01-07T13:00:00Z'), 'DESCANSO_CORTO', 'COMPLETADA', 5);
    await expect(editarSesion(repo, OWNER, '1', { tarea: 'x' })).rejects.toThrow('por voz');
    await expect(borrarSesion(repo, OWNER, '1')).rejects.toThrow('por voz');
    await expect(editarSesion(repo, 'otro', '2', { tarea: 'x' })).rejects.toThrow('no existe');
    await expect(editarSesion(repo, OWNER, '99', { tarea: 'x' })).rejects.toThrow('no existe');
    await expect(editarSesion(repo, OWNER, '2', { tarea: 'x' })).rejects.toThrow('Solo los focos');
    await expect(editarSesion(repo, OWNER, '2', { estado: 'ACTIVA' })).rejects.toThrow('Estado');
    await sesion(repo, new Date('2026-01-07T14:00:00Z'), 'FOCO', 'COMPLETADA');
    await expect(editarSesion(repo, OWNER, '3', { tarea: 'x'.repeat(81) })).rejects.toThrow('80');
  });

  it('elimina solo bloques propios', async () => {
    const repo = new InMemorySessionRepository();
    await sesion(repo, new Date('2026-01-07T13:00:00Z'), 'FOCO', 'COMPLETADA');
    await expect(borrarSesion(repo, 'otro', '1')).rejects.toThrow('no existe');
    await borrarSesion(repo, OWNER, '1');
    expect(await repo.obtenerSesion(OWNER, '1')).toBeNull();
  });

  it('crea un bloque manual ya completado con origen PANEL', async () => {
    const repo = new InMemorySessionRepository();
    const s = await crearSesionManual(repo, OWNER, ahora, { tipo: 'FOCO', tarea: 'leer', inicio: new Date('2026-01-07T15:00:00Z'), minutos: '25' });
    expect(s).toMatchObject({ estado: 'COMPLETADA', origen: 'PANEL', tarea: 'leer' });
    expect(s.fin!.getTime() - s.inicio.getTime()).toBe(min(25));
    const p = await cargarPanel(repo, OWNER, ahora);
    expect(p.hoy.completados).toBe(1);
  });

  it('valida el bloque manual', async () => {
    const repo = new InMemorySessionRepository();
    const base = { tipo: 'FOCO', inicio: new Date('2026-01-07T15:00:00Z'), minutos: 25 };
    await expect(crearSesionManual(repo, OWNER, ahora, { ...base, tipo: 'X' })).rejects.toThrow('Tipo');
    await expect(crearSesionManual(repo, OWNER, ahora, { ...base, minutos: 999 })).rejects.toThrow('entre 1');
    await expect(crearSesionManual(repo, OWNER, ahora, { ...base, minutos: 2.5 })).rejects.toThrow('entre 1');
    await expect(crearSesionManual(repo, OWNER, ahora, { ...base, inicio: new Date('2026-01-07T19:50:00Z') })).rejects.toThrow('futuro');
    await expect(crearSesionManual(repo, OWNER, ahora, { ...base, inicio: new Date('nope') })).rejects.toThrow('Hora');
  });
});
