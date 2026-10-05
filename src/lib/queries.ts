import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

import type { Database } from "@/integrations/supabase/types";

export type Unit = Database["public"]["Tables"]["units"]["Row"];
export type Category = Database["public"]["Tables"]["categories"]["Row"];
export type Product = Database["public"]["Tables"]["products"]["Row"];
export type StockRow = Database["public"]["Tables"]["stock"]["Row"];
export type Movement = Database["public"]["Tables"]["stock_movements"]["Row"];
export type StockCheck = Database["public"]["Tables"]["stock_checks"]["Row"];
export type CheckItem = Database["public"]["Tables"]["stock_check_items"]["Row"];
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
  products: Product | null;
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
export type CheckRow = StockCheck & {
  units: { nome: string } | null;
  profiles: { nome: string } | null;
};
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

const ALL_UNITS_SCOPE = "__all__";

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

      // Entradas enviadas pelo CEO para uma unidade ficam pendentes até que
      // o responsável confirme o recebimento. O gatilho do estoque já pode
      // ter registrado a entrada; por isso descontamos visualmente as pendentes
      // de todos os saldos até existir a confirmação.
      let pendingQuery = supabase
        .from("stock_movements")
        .select("id, product_id, unit_id, quantidade")
        .eq("tipo", "entrada")
        .ilike("observacao", "%PENDENTE_RECEBIMENTO%");
      if (unitId !== ALL_UNITS_SCOPE) pendingQuery = pendingQuery.eq("unit_id", unitId as string);
      const { data: pendingMovements, error: pendingError } = await pendingQuery.limit(5000);
      if (pendingError) throw message(pendingError);

      const pending = (pendingMovements ?? []) as Array<{
        id: string;
        product_id: string;
        unit_id: string;
        quantidade: number;
      }>;
      let pendingIds = pending.map((m) => m.id);
      if (pendingIds.length) {
        // The receipt table is created by the confirmation migration and may
        // not yet be present in generated TypeScript types.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: receipts, error: receiptError } = await (supabase as any)
          .from("stock_receipts")
          .select("movement_id")
          .in("movement_id", pendingIds);
        if (receiptError) throw message(receiptError);
        const confirmedIds = new Set<string>((receipts ?? []).map((r: { movement_id: string }) => r.movement_id));
        pendingIds = pending.filter((m) => !confirmedIds.has(m.id)).map((m) => m.id);
      }

      const pendingByStock = new Map<string, number>();
      pending.forEach((m) => {
        if (!pendingIds.includes(m.id)) return;
        const key = m.product_id + ":" + m.unit_id;
        pendingByStock.set(key, (pendingByStock.get(key) ?? 0) + Number(m.quantidade));
      });

      return rows
        .filter((r) => r.products)
        .map<StockEntry>((r) => {
          const key = r.product_id + ":" + r.unit_id;
          const pendingQty = pendingByStock.get(key) ?? 0;
          return {
            product: r.products as ProductWithCategory,
            quantity: Math.max(0, Number(r.quantidade) - pendingQty),
            updated_at: r.updated_at,
            unit_id: r.unit_id,
            unit: r.units,
          };
        });
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
      if (receiptError) throw message(receiptError);
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

  // Só o CEO deve ter permissão para excluir. A política do banco continua
  // sendo a autoridade final sobre a operação.
  const { error } = await supabase.from("stock_movements").delete().eq("id", movementId);
  if (error) throw message(error);
}

export function checksOptions(unitId: string | null) {
  return queryOptions({
    enabled: Boolean(unitId),
    queryKey: ["checks", unitId],
    queryFn: async () => {
      let query = supabase
        .from("stock_checks")
        .select("*, units(nome), profiles(nome)")
        .order("data_conferencia", { ascending: false })
        .order("created_at", { ascending: false });
      if (unitId !== ALL_UNITS_SCOPE) query = query.eq("unit_id", unitId as string);
      const { data, error } = await query.limit(120);
      if (error) throw message(error);
      return (data ?? []) as unknown as CheckRow[];
    },
  });
}

export function checkItemsOptions(checkId: string | null) {
  return queryOptions({
    enabled: Boolean(checkId),
    queryKey: ["check-items", checkId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stock_check_items")
        .select("*, products(*)")
        .eq("stock_check_id", checkId as string)
        .order("created_at");
      if (error) throw message(error);
      return (data ?? []) as unknown as Array<CheckItem & { products: Product | null }>;
    },
  });
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

export async function addMovement(input: MovementInput) {
  const user_id = await currentUserId();
  const { error } = await supabase.from("stock_movements").insert({ ...input, user_id });
  if (error) throw message(error);
}

export type CheckInput = {
  unit_id: string;
  data_conferencia: string;
  observacao?: string | null;
  responsavel?: string | null;
  items: Array<{ product_id: string; quantidade_conferida: number }>;
};

export async function createStockCheck(input: CheckInput) {
  const user_id = await currentUserId();
  const { data, error } = await supabase
    .from("stock_checks")
    .insert({
      unit_id: input.unit_id,
      data_conferencia: input.data_conferencia,
      observacao: input.observacao ?? null,
      responsavel: input.responsavel ?? null,
      user_id,
    })
    .select("id")
    .single();
  if (error || !data) throw message(error) ?? new Error("Não foi possível abrir a conferência.");

  const { error: itemsError } = await supabase.from("stock_check_items").insert(
    input.items.map((i) => ({
      stock_check_id: data.id,
      product_id: i.product_id,
      quantidade_conferida: i.quantidade_conferida,
    })),
  );
  if (itemsError) throw message(itemsError);
  return data.id as string;
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

  let { data: category, error: categoryError } = await supabase
    .from("categories")
    .select("id")
    .eq("nome", "Não categorizado")
    .limit(1)
    .maybeSingle();
  if (categoryError) throw message(categoryError);

  if (!category) {
    const created = await supabase
      .from("categories")
      .insert({ nome: "Não categorizado", ativo: true, demo: false })
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
