import { createFileRoute, redirect } from "@tanstack/react-router";
import { CentralDispatchForm, MovementForm } from "@/components/movement-form";
import { PageHeader } from "@/components/ui-kit";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/_authenticated/saida")({
  head: () => ({
    meta: [
      { title: "Saída de materiais — Controle de Estoque" },
      {
        name: "description",
        content: "Registre as dispensas e consumos que reduzem o estoque da unidade.",
      },
      { property: "og:title", content: "Saída de materiais — Controle de Estoque" },
      {
        property: "og:description",
        content: "Registro de dispensas e consumos no estoque da unidade.",
      },
    ],
  }),
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });

    const [{ data: role }, { data: profile }] = await Promise.all([
      supabase.from("user_roles").select("role").eq("user_id", data.user.id).maybeSingle(),
      supabase.from("profiles").select("unit_id").eq("user_id", data.user.id).maybeSingle(),
    ]);

    if (role?.role === "admin" || role?.role === "responsavel") return;

    if (role?.role === "visualizador" && profile?.unit_id) {
      const { data: unit } = await supabase.from("units").select("nome").eq("id", profile.unit_id).maybeSingle();
      const normalized = (unit?.nome ?? "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();
      if (normalized === "gabinete semads") return;
    }

    throw redirect({ to: "/dashboard" });
  },
  component: SaidaPage,
});

function SaidaPage() {
  const { isViewer } = useAuth();
  return (
    <>
      <PageHeader
        title={isViewer ? "Enviar materiais" : "Saída de materiais"}
        description={isViewer
          ? "Envie materiais do Depósito Central SEMADS para as unidades e gere o Recibo de Produtos."
          : "Dispensas às famílias, atendimentos e consumos internos da unidade."}
      />
      {isViewer ? <CentralDispatchForm /> : <MovementForm tipo="saida" />}
    </>
  );
}
