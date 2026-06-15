import { buildTimeRange } from "./meta-ads";

// Investimento manual (canais sem plataforma de API, ex.: Google enquanto a
// integração não está aprovada). O valor digitado é tratado como o TOTAL
// acumulado do mês corrente ATÉ HOJE. Para qualquer filtro de período, ele é
// rateado: diária = total / (dia de hoje no mês); exibido = diária × (dias do
// filtro que caem entre o 1º do mês e hoje).
//
// Ex.: total = 2000, hoje = dia 14 → diária ≈ 142,86. Filtro 01–07 (7 dias) →
// 142,86 × 7 = 1000. Filtro do mês inteiro → 14 dias → 2000 (o total).

const DIA_MS = 86_400_000;

/** Meia-noite local da data informada. */
function meiaNoite(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Converte "YYYY-MM-DD" em Date à meia-noite local. */
function parseYMD(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

/** Intervalo [start, end] (à meia-noite local) do filtro — custom ou preset. */
function resolveRange(dateRange: string, startDate?: Date, endDate?: Date): { start: Date; end: Date } {
  if (startDate && endDate) return { start: meiaNoite(startDate), end: meiaNoite(endDate) };
  const { since, until } = buildTimeRange(dateRange);
  return { start: parseYMD(since), end: parseYMD(until) };
}

/**
 * Rateia o investimento manual (total do mês até hoje) pelo período do filtro.
 * Retorna 0 quando o filtro não toca o mês corrente (ex.: meses anteriores).
 */
export function rateioInvestimentoManual(
  total: number | null | undefined,
  dateRange: string,
  startDate?: Date,
  endDate?: Date,
): number {
  if (!total) return 0;

  const hoje = new Date();
  const diaAtual = hoje.getDate(); // dias decorridos no mês = divisor
  const diaria = total / diaAtual;

  const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  const hojeMid = meiaNoite(hoje);
  const { start, end } = resolveRange(dateRange, startDate, endDate);

  // Sobreposição entre o filtro e [início do mês, hoje].
  const lo = start > inicioMes ? start : inicioMes;
  const hi = end < hojeMid ? end : hojeMid;
  if (hi < lo) return 0;

  const dias = Math.round((hi.getTime() - lo.getTime()) / DIA_MS) + 1; // inclusivo
  return diaria * dias;
}

/** Soma o investimento manual rateado de vários canais sem plataforma. */
export function somaManualRateada(
  produtos: Array<{ plataforma: string; investimento_manual: number | null }>,
  dateRange: string,
  startDate?: Date,
  endDate?: Date,
): number {
  return produtos
    .filter((p) => p.plataforma === "none" && p.investimento_manual != null)
    .reduce((s, p) => s + rateioInvestimentoManual(p.investimento_manual, dateRange, startDate, endDate), 0);
}
