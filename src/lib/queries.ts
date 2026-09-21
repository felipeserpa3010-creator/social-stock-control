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
};
export type MovementRow = Movement & {
  products: Product | null;
  units: { nome: string } | null;
};
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
      const { data, error } = await supabase
        .from("stock")
        .select("product_id, quantidade, updated_at, products(*, categories(nome))")
        .eq("unit_id", unitId as string);
      if (error) throw message(error);
      const rows = (data ?? []) as unknown as Array<{
        product_id: string;
        quantidade: number;
        updated_at: string | null;
        products: ProductWithCategory | null;
      }>;
      return rows
        .filter((r) => r.products)
        .map<StockEntry>((r) => ({
          product: r.products as ProductWithCategory,
          quantity: Number(r.quantidade),
          updated_at: r.updated_at,
        }));
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
        .order("created_at", { ascending: false })
        .eq("unit_id", filter.unitId as string)
        .limit(filter.limit ?? 300);
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

export function checksOptions(unitId: string | null) {
  return queryOptions({
    enabled: Boolean(unitId),
    queryKey: ["checks", unitId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stock_checks")
        .select("*, units(nome), profiles(nome)")
        .eq("unit_id", unitId as string)
        .order("data_conferencia", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(120);
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
