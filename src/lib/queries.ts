import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

import type { Database } from "@/integrations/supabase/types";

export type Unit = Database["public"]["Tables"]["units"]["Row"];
export type Category = Database["public"]["Tables"]["categories"]["Row"];
export type Product = Database["public"]["Tables"]["products"]["Row"];
export type StockRow = Database["public"]["Tables"]["stock"]["Row"];
export type Movement = Database["public"]["Tables"]["stock_movements"]["Row"];
export type SettingsRow = Database["public"]["Tables"]["settings"]["Row"];
export type MovementType = Database["public"]["Enums"]["movement_type"];
export type AppRole = Database["public"]["Enums"]["app_role"];

export type ProductWithCategory = Product & { categories: { nome: string } | null };
export type StockEntry = {
  product: ProductWithCategory;
  quantity: number;
  updated_at: string | null;
  unit_id: string;
  unit: { nome: string; sigla: string | null } | null;
};
export type MovementRow = Movement & {
  products: ProductWithCategory | null;
  units: { nome: string } | null;
};
export type StockReceipt = {
  id: string;
  movement_id: string;
  confirmed_by: string;
  confirmed_by_name: string;
  confirmed_at: string;
};
export type ReceivedEntryRow = MovementRow & { receipt: StockReceipt | null };
export type ReceiptGroup = {
  id: string;
  data: string;
  unitId: string;
  unitName: string;
  entries: ReceivedEntryRow[];
};

export function receiptIdFromObservation(observacao: string | null | undefined) {
  const match = String(observacao ?? "").match(/RECIBO_PRODUTOS:([^|\s]+)/);
  return match?.[1] ?? null;
}

export function orderNumberFromObservation(observacao: string | null | undefined) {
  const match = String(observacao ?? "").match(/ORDEM_FORNECIMENTO:([^|]+)/);
  return match?.[1] ?? null;
}
export type UserRow = {
  id: string;
  user_id: string;
  nome: string;
  email: string;
  unit_id: string | null;
  ativo: boolean;
  role: AppRole | null;
};

function message(error: { message: string } | null) {
  return error ? new Error(error.message) : null;
}

async function currentUserId() {
  const { data } = await supabase.auth.getSession();
  const id = data.session?.user.id;
  if (!id) throw new Error("Sessão expirada. Entre novamente.");
  return id;
}

export const ALL_UNITS = "__all__";
const ALL_UNITS_SCOPE = ALL_UNITS;

/* ------------------------------------------------------------------ *
 * Leituras
 * ------------------------------------------------------------------ */

export function unitsOptions(includeInactive = false) {
  return queryOptions({
    queryKey: ["units", includeInactive],
    queryFn: async () => {
      let query = supabase.from("units").select("*").order("nome");
      if (!includeInactive) query = query.eq("ativo", true);
      const { data, error } = await query;
      if (error) throw message(error);
      return (data ?? []) as Unit[];
    },
  });
}

export function categoriesOptions(includeInactive = false) {
  return queryOptions({
    queryKey: ["categories", includeInactive],
    queryFn: async () => {
      let query = supabase.from("categories").select("*").order("nome");
      if (!includeInactive) query = query.eq("ativo", true);
      const { data, error } = await query;
      if (error) throw message(error);
      return (data ?? []) as Category[];
    },
  });
}

export function productsOptions(includeInactive = false) {
  return queryOptions({
    queryKey: ["products", includeInactive],
    queryFn: async () => {
      let query = supabase
        .from("products")
        .select("*, categories(nome)")
        .order("nome");
      if (!includeInactive) query = query.eq("ativo", true);
      const { data, error } = await query;
      if (error) throw message(error);
      return (data ?? []) as unknown as ProductWithCategory[];
    },
  });
}

export function stockOptions(unitId: string | null) {
  return queryOptions({
    enabled: Boolean(unitId),
    queryKey: ["stock", unitId],
    queryFn: async () => {
      let query = supabase
        .from("stock")
        .select("product_id, unit_id, quantidade, updated_at, products(*, categories(nome)), units(nome, sigla)");
      if (unitId !== ALL_UNITS_SCOPE) query = query.eq("unit_id", unitId as string);
      const { data, error } = await query;
      if (error) throw message(error);
      const rows = (data ?? []) as unknown as Array<{
        product_id: string;
        unit_id: string;
        quantidade: number;
        updated_at: string | null;
        units: { nome: string; sigla: string | null } | null;
        products: ProductWithCategory | null;
      }>;

      // A tabela public.stock já é o saldo efetivo mantido pelos gatilhos do banco.
      // Recibos pendentes não são somados ao saldo; a confirmação é que aplica a entrada.
      return rows
        .filter((r) => Boolean(r.products))
        .map<StockEntry>((r) => ({
          product: r.products as ProductWithCategory,
          quantity: Number(r.quantidade),
          updated_at: r.updated_at,
          unit_id: r.unit_id,
          unit: r.units,
        }))
        .filter((r) => r.quantity > 0);
    },
  });
}

export type MovementFilter = {
  unitId: string | null;
  tipo?: MovementType | "todos";
  from?: string;
  to?: string;
  productId?: string;
  limit?: number;
};

export function movementsOptions(filter: MovementFilter) {
  return queryOptions({
    enabled: Boolean(filter.unitId),
    queryKey: ["movements", filter],
    queryFn: async () => {
      let query = supabase
        .from("stock_movements")
        .select("*, products(*), units(nome)")
        .order("data", { ascending: false })
        .order("created_at", { ascending: false });
      if (filter.unitId !== ALL_UNITS_SCOPE) query = query.eq("unit_id", filter.unitId as string);
      query = query.limit(filter.limit ?? 300);
      if (filter.tipo && filter.tipo !== "todos") query = query.eq("tipo", filter.tipo);
      if (filter.from) query = query.gte("data", filter.from);
      if (filter.to) query = query.lte("data", filter.to);
      if (filter.productId) query = query.eq("product_id", filter.productId);
      const { data, error } = await query;
      if (error) throw message(error);
      return (data ?? []) as unknown as MovementRow[];
    },
  });
}

export function receivedEntriesOptions(unitId: string | null, enabled = true) {
  return queryOptions({
    enabled: Boolean(unitId) && enabled,
    queryKey: ["received-entries", unitId],
    queryFn: async () => {
      let query = supabase
        .from("stock_movements")
        .select("*, products(*), units(nome)")
        .eq("tipo", "entrada")
        .ilike("observacao", "%PENDENTE_RECEBIMENTO%")
        .order("data", { ascending: false })
        .order("created_at", { ascending: false });
      if (unitId !== ALL_UNITS_SCOPE) query = query.eq("unit_id", unitId as string);
      const { data, error } = await query.limit(300);
      if (error) throw message(error);
      const movements = (data ?? []) as unknown as MovementRow[];
      if (!movements.length) return [] as ReceivedEntryRow[];
      // The table exists in migrations but is not yet present in the generated client types.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: receipts, error: receiptError } = await (supabase as any)
        .from("stock_receipts")
        .select("*")
        .in("movement_id", movements.map((m) => m.id));
      // Se a tabela de confirmações ainda não estiver disponível no projeto,
      // os lançamentos continuam aparecendo como pendentes para a unidade.
      // A confirmação só é efetivada quando a tabela estiver disponível.
      if (receiptError) {
        return movements.map((m) => ({ ...m, receipt: null }));
      }
      const receiptMap = new Map<string, StockReceipt>();
      ((receipts ?? []) as unknown as StockReceipt[]).forEach((r) => receiptMap.set(r.movement_id, r));
      return movements.map((m) => ({ ...m, receipt: receiptMap.get(m.id) ?? null }));
    },
  });
}

export async function confirmStockReceipt(movementId: string, confirmedByName: string) {
  const user_id = await currentUserId();
  // The table exists in migrations but is not yet present in the generated client types.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).from("stock_receipts").insert({
    movement_id: movementId,
    confirmed_by: user_id,
    confirmed_by_name: confirmedByName,
  });
  if (error) throw message(error);
}

export async function confirmStockReceiptGroup(receiptId: string, confirmedByName: string) {
  const user_id = await currentUserId();
  const { data: movements, error: readError } = await supabase
    .from("stock_movements")
    .select("id, observacao")
    .eq("tipo", "entrada")
    .ilike("observacao", `%RECIBO_PRODUTOS:${receiptId}%`);
  if (readError) throw message(readError);
  const ids = (movements ?? [])
    .filter((m) => String(m.observacao ?? "").includes("PENDENTE_RECEBIMENTO"))
    .map((m) => m.id);
  if (!ids.length) throw new Error("Este recibo não possui produtos pendentes.");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existing, error: existingError } = await (supabase as any)
    .from("stock_receipts")
    .select("movement_id")
    .in("movement_id", ids);
  if (existingError) throw message(existingError);
  const done = new Set<string>((existing ?? []).map((r: { movement_id: string }) => r.movement_id));
  const toInsert = ids.filter((id) => !done.has(id));
  if (!toInsert.length) return;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).from("stock_receipts").insert(
    toInsert.map((movement_id) => ({ movement_id, confirmed_by: user_id, confirmed_by_name: confirmedByName })),
  );
  if (error) throw message(error);
}

export async function markReceiptNotReceived(receiptId: string) {
  const isGroup = !/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(receiptId);
  let query = supabase
    .from("stock_movements")
    .select("id, observacao")
    .eq("tipo", "entrada")
    .ilike("observacao", "%PENDENTE_RECEBIMENTO%");
  query = isGroup
    ? query.ilike("observacao", `%RECIBO_PRODUTOS:${receiptId}%`)
    : query.eq("id", receiptId);
  const { data: movements, error: readError } = await query;
  if (readError) throw message(readError);
  if (!(movements ?? []).length) throw new Error("Este recibo não possui produtos pendentes.");

  for (const movement of movements ?? []) {
    const observacao = String(movement.observacao ?? "");
    if (observacao.includes("NAO_RECEBIDO")) continue;
    const { error } = await supabase
      .from("stock_movements")
      .update({ observacao: observacao + " | NAO_RECEBIDO" })
      .eq("id", movement.id);
    if (error) throw message(error);
  }
}

export function pendingReceiptOptions(unitId: string | null, enabled = true) {
  return queryOptions({
    enabled: Boolean(unitId) && enabled,
    queryKey: ["pending-receipts", unitId],
    queryFn: async () => {
      let query = supabase
        .from("stock_movements")
        .select("*, products(*), units(nome)")
        .eq("tipo", "entrada")
        .ilike("observacao", "%PENDENTE_RECEBIMENTO%")
        .order("data", { ascending: false })
        .order("created_at", { ascending: false });
      if (unitId !== ALL_UNITS_SCOPE) query = query.eq("unit_id", unitId as string);
      const { data, error } = await query.limit(500);
      if (error) throw message(error);
      const movements = (data ?? []) as unknown as MovementRow[];
      if (!movements.length) return [] as ReceivedEntryRow[];

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: receipts, error: receiptError } = await (supabase as any)
        .from("stock_receipts")
        .select("*")
        .in("movement_id", movements.map((m) => m.id));
      if (receiptError) throw message(receiptError);
      const confirmedIds = new Set<string>((receipts ?? []).map((r: { movement_id: string }) => r.movement_id));
      return movements.filter((m) => !confirmedIds.has(m.id)).map((m) => ({ ...m, receipt: null }));
    },
  });
}

async function deleteReceiptsForMovements(ids: string[]) {
  if (!ids.length) return;
  // A confirmação de recebimento referencia o lançamento; remova-a antes
  // para não violar a chave estrangeira ao excluir o recibo.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).from("stock_receipts").delete().in("movement_id", ids);
  if (error) throw message(error);
}

export async function removePendingReceiptGroup(receiptId: string) {
  const { data: movements, error: readError } = await supabase
    .from("stock_movements")
    .select("id, observacao")
    .eq("tipo", "entrada")
    .ilike("observacao", `%RECIBO_PRODUTOS:${receiptId}%`);
  if (readError) throw message(readError);
  const movementIds = (movements ?? []).map((m) => m.id);
  if (!movementIds.length) throw new Error("Este recibo não possui produtos.");
  // O trigger BEFORE DELETE reverte o estoque quando o recibo já foi confirmado
  // e não altera o saldo quando a entrada ainda está pendente.
  const { error } = await supabase.from("stock_movements").delete().in("id", movementIds);
  if (error) throw message(error);
}

export async function removePendingReceipt(movementId: string) {
  const { data, error: readError } = await supabase
    .from("stock_movements")
    .select("id, observacao")
    .eq("id", movementId)
    .single();
  if (readError) throw message(readError);
  if (!String(data?.observacao ?? "").includes("PENDENTE_RECEBIMENTO")) {
    throw new Error("Este lançamento não está pendente de recebimento.");
  }

  // Só o admin deve ter permissão para excluir. A política do banco continua
  // sendo a autoridade final sobre a operação. O trigger do banco cuida da reversão.
  const { error } = await supabase.from("stock_movements").delete().eq("id", movementId);
  if (error) throw message(error);
}

export function settingsOptions() {
  return queryOptions({
    queryKey: ["settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("settings").select("*").limit(1).maybeSingle();
      if (error) throw message(error);
      return (data ?? null) as SettingsRow | null;
    },
  });
}

export function usersOptions(enabled: boolean) {
  return queryOptions({
    enabled,
    queryKey: ["users"],
    queryFn: async () => {
      const [{ data: profiles, error: e1 }, { data: roles, error: e2 }] = await Promise.all([
        supabase.from("profiles").select("*").order("nome"),
        supabase.from("user_roles").select("user_id, role"),
      ]);
      if (e1) throw message(e1);
      if (e2) throw message(e2);
      const roleMap = new Map<string, AppRole>();
      (roles ?? []).forEach((r) => roleMap.set(r.user_id, r.role));
      return ((profiles ?? []) as unknown as Array<Omit<UserRow, "role">>).map((p) => ({
        ...p,
        role: roleMap.get(p.user_id) ?? null,
      }));
    },
  });
}

/* ------------------------------------------------------------------ *
 * Escritas
 * ------------------------------------------------------------------ */

export type MovementInput = {
  unit_id: string;
  product_id: string;
  tipo: MovementType;
  quantidade: number;
  data: string;
  observacao?: string | null;
  responsavel?: string | null;
};

export async function removeMovement(id: string) {
  const { error } = await supabase.from("stock_movements").delete().eq("id", id);
  if (error) throw message(error);
}

export async function sendFromCentralDeposit(input: {
  product_id: string;
  destination_unit_id: string;
  quantidade: number;
  data: string;
  observacao?: string | null;
  receipt_number?: string | null;
}) {
  const { data, error } = await (supabase as any).rpc("send_from_central_deposit", {
    _product_id: input.product_id,
    _destination_unit_id: input.destination_unit_id,
    _quantity: input.quantidade,
    _data: input.data,
    _observacao: input.observacao ?? null,
    _receipt_number: input.receipt_number ?? null,
  });
  if (error) throw message(error);
  return String(data);
}

export async function addMovement(input: MovementInput) {
  const user_id = await currentUserId();
  const { error } = await supabase.from("stock_movements").insert({ ...input, user_id });
  if (error) throw message(error);
}

export type UnitInput = {
  nome: string;
  sigla?: string | null;
  responsavel?: string | null;
  telefone?: string | null;
  endereco?: string | null;
  observacao?: string | null;
  ativo: boolean;
};

export async function saveUnit(id: string | null, input: UnitInput) {
  if (id) {
    const { error } = await supabase.from("units").update(input).eq("id", id);
    if (error) throw message(error);
    return;
  }
  const { error } = await supabase.from("units").insert({ ...input, demo: false });
  if (error) throw message(error);
}

export async function removeUnit(id: string) {
  const { error } = await supabase.from("units").delete().eq("id", id);
  if (error) throw message(error);
}

export type ProductInput = {
  nome: string;
  category_id: string;
  unidade_medida: string;
  estoque_minimo?: number | null;
  estoque_maximo?: number | null;
  observacao?: string | null;
  ativo: boolean;
};

export async function ensureUncategorizedProduct(nome: string, unidade_medida = "unidade") {
  const normalized = nome.trim();
  if (!normalized) throw new Error("Nome do produto vazio.");

  const { data: existing, error: existingError } = await supabase
    .from("products")
    .select("id, nome, unidade_medida")
    .ilike("nome", normalized)
    .limit(1)
    .maybeSingle();
  if (existingError) throw message(existingError);
  if (existing) return existing as Pick<Product, "id" | "nome" | "unidade_medida">;

  const searchableName = normalized.normalize("NFD").replace(/[\\u0300-\\u036f]/g, "").toLocaleLowerCase("pt-BR");
  const expedienteKeywords = [
    "papel a4", "resma", "caneta", "lapis", "borracha", "apontador", "grampeador",
    "grampos", "pasta", "envelope", "clipe", "clips", "corretivo", "marcador",
    "marca texto", "toner", "cartucho", "impressora", "caderno", "bloco de notas",
    "papel oficio", "papel sulfite", "fita adesiva", "cola branca", "tesoura",
  ];
  if (expedienteKeywords.some((keyword) => searchableName.includes(keyword))) {
    throw new Error(`"${normalized}" parece ser material de expediente. Use o módulo Materiais de Expediente para registrar o envio sem movimentar o estoque.`);
  }

  const foodKeywords = [
    "arroz", "feijao", "acucar", "trigo", "flocao", "farinha", "macarrao", "massa",
    "oleo", "manteiga", "margarina", "leite", "carne", "frango", "peixe", "figado",
    "salsicha", "cebola", "tomate", "limao", "verdura", "legume", "batata", "cenoura",
    "repolho", "alface", "cheiro verde", "coentro", "pimentao", "alho", "ovo", "sal",
    "cafe", "biscoito", "bolacha", "pao", "polpa", "suco", "fruta", "banana", "maca",
    "laranja", "farofa", "fuba", "milho", "aveia", "massa de tomate",
  ];
  const cleaningKeywords = [
    "detergente", "agua sanitaria", "desinfetante", "sabao", "papel higienico",
    "papel toalha", "vassoura", "rodo", "pano", "esponja", "saco de lixo", "alcool",
    "sabonete", "shampoo", "creme dental", "pasta de dente", "higiene", "limpeza",
    "fralda", "absorvente", "desodorante", "escova de dente", "luva", "mascara",
    "touca", "amaciantes", "amaciante", "inseticida",
  ];
  const categoryName = foodKeywords.some((keyword) => searchableName.includes(keyword))
    ? "Alimentos"
    : cleaningKeywords.some((keyword) => searchableName.includes(keyword))
      ? "Materiais de Higiene e Limpeza"
      : "Não categorizado";

  let { data: category, error: categoryError } = await supabase
    .from("categories")
    .select("id")
    .eq("nome", categoryName)
    .limit(1)
    .maybeSingle();
  if (categoryError) throw message(categoryError);

  if (!category) {
    const created = await supabase
      .from("categories")
      .insert({ nome: categoryName, ativo: true, demo: false })
      .select("id")
      .single();
    if (created.error) throw message(created.error);
    category = created.data;
  }

  const { data: product, error } = await supabase
    .from("products")
    .insert({
      nome: normalized,
      category_id: category.id,
      unidade_medida,
      ativo: true,
      demo: false,
      observacao: "Cadastrado automaticamente a partir de documento lido por OCR.",
    })
    .select("id, nome, unidade_medida")
    .single();
  if (error) throw message(error);
  return product as Pick<Product, "id" | "nome" | "unidade_medida">;
}

export async function saveProduct(id: string | null, input: ProductInput) {
  if (id) {
    const { error } = await supabase.from("products").update(input).eq("id", id);
    if (error) throw message(error);
    return;
  }
  const { error } = await supabase.from("products").insert({ ...input, demo: false });
  if (error) throw message(error);
}

export async function removeProduct(id: string) {
  const { error } = await supabase.from("products").delete().eq("id", id);
  if (error) throw message(error);
}

export async function saveCategory(id: string | null, nome: string, ativo: boolean) {
  if (id) {
    const { error } = await supabase.from("categories").update({ nome, ativo }).eq("id", id);
    if (error) throw message(error);
    return;
  }
  const { error } = await supabase.from("categories").insert({ nome, ativo, demo: false });
  if (error) throw message(error);
}

export async function removeCategory(id: string) {
  const { error } = await supabase.from("categories").delete().eq("id", id);
  if (error) throw message(error);
}

export async function saveSettings(input: {
  nome_instituicao: string;
  nome_secretaria: string;
  logo_url: string | null;
}) {
  const { data } = await supabase.from("settings").select("id").limit(1).maybeSingle();
  if (data) {
    const { error } = await supabase.from("settings").update(input).eq("id", (data as { id: string }).id);
    if (error) throw message(error);
    return;
  }
  const { error } = await supabase.from("settings").insert(input);
  if (error) throw message(error);
}

export async function setUserActive(userId: string, ativo: boolean) {
  const { error } = await supabase.from("profiles").update({ ativo }).eq("user_id", userId);
  if (error) throw message(error);
}

export async function updateMyName(nome: string) {
  const user_id = await currentUserId();
  const { error } = await supabase
    .from("profiles")
    .update({ nome })
    .eq("user_id", user_id);
  if (error) throw message(error);
}

export async function changeMyPassword(senha: string) {
  const { error } = await supabase.auth.updateUser({ password: senha });
  if (error) throw message(error);
}
