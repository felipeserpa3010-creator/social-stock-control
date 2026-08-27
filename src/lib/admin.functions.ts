import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type BootstrapInput = { nome: string; email: string; senha: string };
type CreateUserInput = {
  nome: string;
  email: string;
  senha: string;
  unit_id: string | null;
  role: "admin" | "responsavel";
};

/** Público: informa se o sistema já possui um administrador cadastrado. */
export const getSystemStatus = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { count, error } = await supabaseAdmin
    .from("profiles")
    .select("id", { count: "exact", head: true });
  if (error) throw new Error(error.message);
  return { hasAdmin: (count ?? 0) > 0 };
});

/** Público apenas enquanto não existir NENHUM usuário. Cria o Administrador Principal. */
export const bootstrapFirstAdmin = createServerFn({ method: "POST" })
  .inputValidator((d: BootstrapInput) => {
    if (!d?.nome?.trim()) throw new Error("Informe o nome completo.");
    if (!d?.email?.trim()) throw new Error("Informe o e-mail.");
    if (!d?.senha || d.senha.length < 8) throw new Error("A senha deve ter ao menos 8 caracteres.");
    return { nome: d.nome.trim(), email: d.email.trim().toLowerCase(), senha: d.senha };
  })
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { count, error: countError } = await supabaseAdmin
      .from("profiles")
      .select("id", { count: "exact", head: true });
    if (countError) throw new Error(countError.message);
    if ((count ?? 0) > 0) {
      throw new Error("O sistema já possui um administrador. O cadastro público está bloqueado.");
    }

    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.senha,
      email_confirm: true,
      user_metadata: { nome: data.nome },
    });
    if (error || !created.user) throw new Error(error?.message ?? "Não foi possível criar o usuário.");

    const userId = created.user.id;
    const { error: pError } = await supabaseAdmin
      .from("profiles")
      .insert({ user_id: userId, nome: data.nome, email: data.email, ativo: true });
    if (pError) {
      await supabaseAdmin.auth.admin.deleteUser(userId);
      throw new Error(pError.message);
    }
    const { error: rError } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: userId, role: "admin" });
    if (rError) throw new Error(rError.message);

    return { ok: true };
  });

async function assertAdmin(supabase: {
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
}, userId: string) {
  const { data } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (data !== true) throw new Error("Acesso negado: somente o Administrador Principal.");
}

/** Somente administrador: cria novos usuários do sistema. */
export const adminCreateUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: CreateUserInput) => {
    if (!d?.nome?.trim()) throw new Error("Informe o nome.");
    if (!d?.email?.trim()) throw new Error("Informe o e-mail.");
    if (!d?.senha || d.senha.length < 8) throw new Error("A senha deve ter ao menos 8 caracteres.");
    if (d.role !== "admin" && d.role !== "responsavel") throw new Error("Perfil inválido.");
    if (d.role === "responsavel" && !d.unit_id) throw new Error("Selecione a unidade do responsável.");
    return {
      nome: d.nome.trim(),
      email: d.email.trim().toLowerCase(),
      senha: d.senha,
      unit_id: d.unit_id || null,
      role: d.role,
    };
  })
  .handler(async ({ data, context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await assertAdmin(context.supabase as any, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.senha,
      email_confirm: true,
      user_metadata: { nome: data.nome },
    });
    if (error || !created.user) throw new Error(error?.message ?? "Não foi possível criar o usuário.");
    const userId = created.user.id;

    const { error: pError } = await supabaseAdmin.from("profiles").insert({
      user_id: userId,
      nome: data.nome,
      email: data.email,
      unit_id: data.unit_id,
      ativo: true,
    });
    if (pError) {
      await supabaseAdmin.auth.admin.deleteUser(userId);
      throw new Error(pError.message);
    }
    const { error: rError } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: userId, role: data.role });
    if (rError) throw new Error(rError.message);
    return { ok: true };
  });

/** Somente administrador: altera o perfil (papel) de um usuário. */
export const adminSetRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { user_id: string; role: "admin" | "responsavel" }) => {
    if (!d?.user_id) throw new Error("Usuário inválido.");
    if (d.role !== "admin" && d.role !== "responsavel") throw new Error("Perfil inválido.");
    return d;
  })
  .handler(async ({ data, context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await assertAdmin(context.supabase as any, context.userId);
    if (data.user_id === context.userId) {
      throw new Error("Você não pode alterar o seu próprio perfil de acesso.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("user_roles").delete().eq("user_id", data.user_id);
    const { error } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: data.user_id, role: data.role });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Somente administrador: redefine a senha de um usuário. */
export const adminResetPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { user_id: string; senha: string }) => {
    if (!d?.user_id) throw new Error("Usuário inválido.");
    if (!d?.senha || d.senha.length < 8) throw new Error("A senha deve ter ao menos 8 caracteres.");
    return d;
  })
  .handler(async ({ data, context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await assertAdmin(context.supabase as any, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.user_id, {
      password: data.senha,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
