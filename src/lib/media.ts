export type MediaMovement = {
  product_id: string;
  data: string;
  tipo: string;
  quantidade: number;
};

export type MediaResult = {
  totalSaidas: number;
  meses: number;
  media: number | null;
};

export function monthKey(value: string) {
  return value.slice(0, 7);
}

/** Últimos `n` meses (incluindo o mês corrente), do mais antigo para o mais recente. */
export function lastMonths(n: number, ref = new Date()): string[] {
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(ref.getFullYear(), ref.getMonth() - i, 1);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

export function monthLabel(key: string) {
  const [y, m] = key.split("-");
  const d = new Date(Number(y), Number(m) - 1, 1);
  const label = d.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" });
  return label.replace(".", "");
}

/**
 * Média de consumo mensal de cada produto.
 *
 * média = total de saídas no período ÷ meses acompanhados, onde "meses
 * acompanhados" começa no mês da primeira movimentação do produto dentro do
 * período (evita penalizar produtos recém-cadastrados).
 * Retorna `media: null` quando não há saídas — a interface mostra
 * "Dados insuficientes".
 */
export function computeMediaMap(movements: MediaMovement[], months: string[]) {
  const window = new Set(months);
  const firstIndex = new Map<string, number>();
  const totals = new Map<string, number>();

  const sorted = [...movements].sort((a, b) => (a.data < b.data ? -1 : 1));
  for (const mv of sorted) {
    const key = monthKey(mv.data);
    if (!window.has(key)) continue;
    const idx = months.indexOf(key);
    if (!firstIndex.has(mv.product_id)) firstIndex.set(mv.product_id, idx);
    if (mv.tipo === "saida") {
      totals.set(mv.product_id, (totals.get(mv.product_id) ?? 0) + Number(mv.quantidade));
    }
  }

  const result = new Map<string, MediaResult>();
  const currentIdx = months.length - 1;
  const products = new Set([...firstIndex.keys(), ...totals.keys()]);
  for (const productId of products) {
    const start = firstIndex.get(productId) ?? currentIdx;
    const meses = Math.max(1, currentIdx - start + 1);
    const totalSaidas = totals.get(productId) ?? 0;
    result.set(productId, {
      totalSaidas,
      meses,
      media: totalSaidas > 0 ? totalSaidas / meses : null,
    });
  }
  return result;
}

/** Quantas saídas por produto dentro do período (para totais e ranking). */
export function sumSaidas(movements: MediaMovement[], months: string[]) {
  const window = new Set(months);
  const totals = new Map<string, number>();
  for (const mv of movements) {
    if (mv.tipo !== "saida" || !window.has(monthKey(mv.data))) continue;
    totals.set(mv.product_id, (totals.get(mv.product_id) ?? 0) + Number(mv.quantidade));
  }
  return totals;
}

/** Total de saídas (ou entradas) por mês, para o gráfico do painel. */
export function byMonth(movements: MediaMovement[], months: string[], tipo: string) {
  return months.map((key) => ({
    key,
    label: monthLabel(key),
    total: movements
      .filter((m) => m.tipo === tipo && monthKey(m.data) === key)
      .reduce((acc, m) => acc + Number(m.quantidade), 0),
  }));
}
