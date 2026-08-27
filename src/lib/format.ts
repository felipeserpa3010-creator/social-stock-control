export function formatDate(value?: string | null) {
  if (!value) return "—";
  const d = value.length <= 10 ? new Date(`${value}T12:00:00`) : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR");
}

export function todayISO() {
  const d = new Date();
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
}

export function formatQty(value?: number | null) {
  if (value === null || value === undefined) return "0";
  const n = Number(value);
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(".", ",");
}

export function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export type StockStatus = "zerado" | "baixo" | "normal";

export function stockStatus(qty: number, min?: number | null): StockStatus {
  if (!qty || qty <= 0) return "zerado";
  if (min != null && qty <= Number(min)) return "baixo";
  return "normal";
}

export const UNIDADES_MEDIDA = [
  "Kg",
  "Unidade",
  "Pacote",
  "Caixa",
  "Litro",
  "Fardo",
  "Pote",
  "Saco",
  "Outro",
];
