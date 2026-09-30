import type { AlFinalizar } from './ciclo';
import type { SessionRepository } from './repositories/SessionRepository';
import type { Sesion } from './tipos';

const API = 'https://api.notion.com/v1/pages';
const ESPERA_MAX_MS = 3000; // Alexa da ~8 s por request: Notion no puede consumirlos todos.

/**
 * Crea una fila en una base de Notion con columnas:
 * Name (título) · Estado (select) · Inicio (fecha) · Minutos (número).
 */
export class NotionGateway {
  constructor(
    private readonly token: string,
    private readonly baseId: string,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  async crearPagina(s: Sesion): Promise<string> {
    const fin = s.fin ?? s.finEsperado;
    const res = await this.fetchFn(API, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.token}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(ESPERA_MAX_MS),
      body: JSON.stringify({
        parent: { database_id: this.baseId },
        properties: {
          Name: { title: [{ text: { content: s.tarea ?? 'Foco' } }] },
          Estado: { select: { name: s.estado === 'COMPLETADA' ? 'Completado' : 'Interrumpido' } },
          Inicio: { date: { start: s.inicio.toISOString(), end: fin.toISOString() } },
          Minutos: { number: Math.max(1, Math.round((fin.getTime() - s.inicio.getTime()) / 60_000)) },
        },
      }),
    });
    if (!res.ok) throw new Error(`Notion respondió ${res.status}`);
    return ((await res.json()) as { id: string }).id;
  }
}

/** Sincroniza un foco terminado. Nunca lanza: un fallo de Notion no debe romper la voz. */
export async function sincronizarConNotion(repo: SessionRepository, notion: NotionGateway, s: Sesion): Promise<void> {
  if (s.tipo !== 'FOCO' || s.notionPageId) return;
  try {
    const pageId = await notion.crearPagina(s);
    await repo.actualizarSesion(s._id, { notionPageId: pageId });
  } catch (e) {
    console.error('No se pudo sincronizar con Notion:', e instanceof Error ? e.message : e);
  }
}

/** `undefined` si Notion no está configurado (la sincronización es opcional). */
export function observadorNotion(repo: SessionRepository): AlFinalizar | undefined {
  const { NOTION_TOKEN, NOTION_DATABASE_ID } = process.env;
  if (!NOTION_TOKEN || !NOTION_DATABASE_ID) return undefined;
  const notion = new NotionGateway(NOTION_TOKEN, NOTION_DATABASE_ID);
  return (s) => sincronizarConNotion(repo, notion, s);
}
