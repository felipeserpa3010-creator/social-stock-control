import { redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export async function requireExpedienteAccess() {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
    const [{ data: admin }, { data: responsible }, { data: viewer }, { data: dispatcher }] = await Promise.all([
      supabase.rpc("has_role", { _user_id: data.user.id, _role: "admin" }),
      supabase.rpc("has_role", { _user_id: data.user.id, _role: "responsavel" }),
      supabase.rpc("has_role", { _user_id: data.user.id, _role: "visualizador" }),
      (supabase as any).rpc("is_expediente_dispatcher"),
    ]);
    if (admin !== true && responsible !== true && viewer !== true && dispatcher !== true) throw redirect({ to: "/dashboard" });
}
