import { createFileRoute, redirect } from "@tanstack/react-router";
import { MovementForm } from "@/components/movement-form";
import { PageHeader } from "@/components/ui-kit";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/entrada")({
  head: () => ({
    meta: [
      { title: "Entrada de materiais — Controle de Inventário" },
      {
        name: "description",
        content: "Registre recebimentos e doações que aumentam o estoque da unidade.",
      },
      { property: "og:title", content: "Entrada de materiais — Controle de Inventário" },
      {
        property: "og:description",
        content: "Registro de recebimentos e doações no estoque da unidade.",
      },
    ],
  }),
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
    const { data: isViewer } = await supabase.rpc("has_role", { _user_id: data.user.id, _role: "visualizador" });
    if (isViewer === true) throw redirect({ to: "/dashboard" });
  },
  component: EntradaPage,
});

function EntradaPage() {
  return (
    <>
      <PageHeader
        title="Entrada de materiais"
        description="Recebimentos, doações e transferências que entram na dispensa da unidade."
      />
      <MovementForm tipo="entrada" />
    </>
  );
}
