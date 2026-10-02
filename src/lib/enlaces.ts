/** URL del panel con el día y el mes elegidos; sin parámetros vuelve a «hoy». */
export function enlacePanel({ dia, mes }: { dia?: string; mes?: string }): string {
  const q = new URLSearchParams();
  if (dia) q.set('dia', dia);
  if (mes) q.set('mes', mes);
  const texto = q.toString();
  return texto ? `/?${texto}` : '/';
}

/** Suma (o resta) días a una clave `YYYY-MM-DD`. */
export function sumarDias(clave: string, dias: number): string {
  const [a, m, d] = clave.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d + dias)).toISOString().slice(0, 10);
}
