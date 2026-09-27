import { createFileRoute, redirect } from "@tanstack/react-router";
import { MovementForm } from "@/components/movement-form";
import { PageHeader } from "@/components/ui-kit";
import { supabase } from "@/integrations/supabase/client";

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
    const { data: isViewer } = await supabase.rpc("has_role", { _user_id: data.user.id, _role: "visualizador" });
    if (isViewer === true) throw redirect({ to: "/dashboard" });
  },
  component: SaidaPage,
});

function SaidaPage() {
  return (
    <>
      <PageHeader
        title="Saída de materiais"
        description="Dispensas às famílias, atendimentos e consumos internos da unidade."
      />
      <MovementForm tipo="saida" />
    </>
  );
}
