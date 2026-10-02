import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type BootstrapInput = { nome: string; email: string; senha: string; unit_id: string };
type CreateUserInput = {
  nome: string;
  email: string;
  senha: string;
  unit_id: string | null;
  role: "admin" | "responsavel" | "visualizador";
};

/** Público: informa se o sistema já possui um administrador cadastrado. */
export const getSystemStatus = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { count, error } = await supabaseAdmin
    .from("user_roles")
    .select("user_id", { count: "exact", head: true })
    .eq("role", "admin");
  if (error) throw new Error(error.message);
  return { hasAdmin: (count ?? 0) > 0 };
});

/** Público: lista as unidades ativas disponíveis para o primeiro cadastro. */
export const getSetupUnits = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  // Garante que o Gabinete SEMADS esteja disponível no painel de cadastro,
  // mesmo que a migração de dados ainda não tenha sido aplicada no banco.
  const { data: existingUnit, error: existingError } = await supabaseAdmin
    .from("units")
    .select("id")
    .ilike("nome", "Gabinete SEMADS")
    .maybeSingle();
  if (existingError) throw new Error(existingError.message);

  if (!existingUnit) {
    const { error: insertError } = await supabaseAdmin
      .from("units")
      .insert({ nome: "Gabinete SEMADS", sigla: "SEMADS", ativo: true, demo: false });
    if (insertError) throw new Error(insertError.message);
  }

  const { data, error } = await supabaseAdmin
    .from("units")
    .select("id, nome, sigla")
    .eq("ativo", true)
    .order("nome");
  if (error) throw new Error(error.message);
  return data ?? [];
});

function authErrorPt(msg?: string | null): string {
  const m = (msg ?? "").toLowerCase();
  if (m.includes("weak") || m.includes("easy to guess") || m.includes("pwned"))
    return "Esta senha é muito comum e já apareceu em vazamentos. Escolha outra senha, mais difícil de adivinhar.";
  if (m.includes("already") && (m.includes("registered") || m.includes("exists")))
    return "Já existe um usuário com este e-mail.";
  if (m.includes("invalid") && m.includes("email")) return "E-mail inválido.";
  return msg || "Não foi possível criar o usuário.";
}

/** Público: cadastra um usuário como pendente de autorização do CEO. */
export const registerUser = createServerFn({ method: "POST" })
  .inputValidator((d: { nome: string; email: string; senha: string }) => {
    if (!d?.nome?.trim()) throw new Error("Informe o nome completo.");
    if (!d?.email?.trim()) throw new Error("Informe o e-mail.");
    if (!d?.senha || d.senha.length < 8) throw new Error("A senha deve ter ao menos 8 caracteres.");
    return { nome: d.nome.trim(), email: d.email.trim().toLowerCase(), senha: d.senha };
  })
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.senha,
      email_confirm: true,
      user_metadata: { nome: data.nome },
    });
    if (error || !created.user) return { ok: false as const, error: authErrorPt(error?.message) };

    const userId = created.user.id;
    const { error: pError } = await supabaseAdmin.from("profiles").insert({
      user_id: userId,
      nome: data.nome,
      email: data.email,
      unit_id: null,
      ativo: false,
    });
    if (pError) {
      await supabaseAdmin.auth.admin.deleteUser(userId);
      throw new Error(pError.message);
    }
    return { ok: true as const, error: null };
  });

/** Público apenas enquanto não existir administrador. Cria o Administrador Principal. */
export const bootstrapFirstAdmin = createServerFn({ method: "POST" })
  .inputValidator((d: BootstrapInput) => {
    if (!d?.nome?.trim()) throw new Error("Informe o primeiro nome.");
    if (!d?.email?.trim()) throw new Error("Informe o e-mail.");
    if (!d?.unit_id?.trim()) throw new Error("Selecione a unidade onde trabalha.");
      if (!d?.senha || d.senha.length < 8) throw new Error("A senha deve ter ao menos 8 caracteres.");
    return {
      nome: d.nome.trim().split(/\s+/)[0] ?? d.nome.trim(),
      email: d.email.trim().toLowerCase(),
      senha: d.senha,
      unit_id: d.unit_id.trim(),
    };
  })
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { count, error: countError } = await supabaseAdmin
      .from("user_roles")
      .select("user_id", { count: "exact", head: true })
      .eq("role", "admin");
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
    if (error || !created.user) {
      return { ok: false as const, error: authErrorPt(error?.message) };
    }

    const userId = created.user.id;
    const { error: pError } = await supabaseAdmin
      .from("profiles")
      .insert({ user_id: userId, nome: data.nome, email: data.email, unit_id: data.unit_id, ativo: true });
    if (pError) {
      await supabaseAdmin.auth.admin.deleteUser(userId);
      throw new Error(pError.message);
    }
    const { error: rError } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: userId, role: "admin" });
    if (rError) {
      // Roll back everything if the role could not be created, so a failed
      // first registration does not leave the system blocked by a partial user.
      await supabaseAdmin.from("profiles").delete().eq("user_id", userId);
      await supabaseAdmin.auth.admin.deleteUser(userId);
      throw new Error(rError.message);
    }

    return { ok: true as const, error: null };
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
    if (d.role !== "responsavel" && d.role !== "visualizador") throw new Error("Perfil inválido.");
    if (!d.unit_id) throw new Error("Selecione a unidade.");
    if (d.role === "visualizador" && !d.unit_id) throw new Error("O Visualizador deve ser vinculado ao Gabinete SEMADS.");
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

    if (data.unit_id) {
      const { data: unit, error: unitError } = await supabaseAdmin
        .from("units")
        .select("nome")
        .eq("id", data.unit_id)
        .maybeSingle();
      if (unitError) throw new Error(unitError.message);
      const isSemads = unit?.nome?.toLowerCase() === "gabinete semads";
      if (isSemads && data.role !== "visualizador") {
        throw new Error("Usuários do Gabinete SEMADS devem ser cadastrados como Visualizador.");
      }
      if (!isSemads && data.role === "visualizador") {
        throw new Error("O perfil Visualizador é exclusivo do Gabinete SEMADS.");
      }
    }

    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.senha,
      email_confirm: true,
      user_metadata: { nome: data.nome },
    });
    if (error || !created.user) {
      return { ok: false as const, error: authErrorPt(error?.message) };
    }
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
    if (rError) {
      await supabaseAdmin.from("profiles").delete().eq("user_id", userId);
      await supabaseAdmin.auth.admin.deleteUser(userId);
      throw new Error(rError.message);
    }
    return { ok: true as const, error: null };
  });

/** Somente administrador: altera o perfil (papel) de um usuário. */
export const adminSetRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { user_id: string; role: "admin" | "responsavel" | "visualizador" }) => {
    if (!d?.user_id) throw new Error("Usuário inválido.");
    if (d.role !== "admin" && d.role !== "responsavel" && d.role !== "visualizador") throw new Error("Perfil inválido.");
    return d;
  })
  .handler(async ({ data, context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await assertAdmin(context.supabase as any, context.userId);
    if (data.user_id === context.userId) {
      throw new Error("Você não pode alterar o seu próprio perfil de acesso.");
    }
    if (data.role === "admin") {
      throw new Error("O sistema possui apenas um CEO/Administrador Principal.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("user_roles").delete().eq("user_id", data.user_id);
    const { error } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: data.user_id, role: data.role });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Somente administrador: atribui a unidade de um usuário. */
export const adminSetUnit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { user_id: string; unit_id: string | null }) => {
    if (!d?.user_id) throw new Error("Usuário inválido.");
    return d;
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase as any, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ unit_id: data.unit_id })
      .eq("user_id", data.user_id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
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
    if (error) return { ok: false as const, error: authErrorPt(error.message) };
    return { ok: true as const, error: null };
  });

/** Somente administrador: libera ou bloqueia o acesso de um usuário. */
export const adminSetAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { user_id: string; ativo: boolean }) => {
    if (!d?.user_id) throw new Error("Usuário inválido.");
    return d;
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase as any, context.userId);
    if (data.user_id === context.userId && !data.ativo) {
      throw new Error("O Administrador Principal não pode bloquear o próprio acesso.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (data.ativo) {
      const [{ data: profile }, { data: role }] = await Promise.all([
        supabaseAdmin.from("profiles").select("unit_id").eq("user_id", data.user_id).maybeSingle(),
        supabaseAdmin.from("user_roles").select("role").eq("user_id", data.user_id).maybeSingle(),
      ]);
      if (!role?.role) throw new Error("Defina o perfil do usuário antes de liberar o acesso.");
      if (role.role !== "admin" && !profile?.unit_id) {
        throw new Error("Defina a unidade do usuário antes de liberar o acesso.");
      }
    }
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ ativo: data.ativo })
      .eq("user_id", data.user_id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
