import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { DocumentEntry } from "@/components/document-entry";
import { PageHeader } from "@/components/ui-kit";

export const Route = createFileRoute("/_authenticated/entrada-documento")({
  head: () => ({
    meta: [
      { title: "Lançamento por documento — Controle de Estoque" },
      { name: "description", content: "Leitura gratuita de documentos para lançamento de entradas pelo Administrador Principal." },
    ],
  }),
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: data.user.id, _role: "admin" });
    if (isAdmin !== true) throw redirect({ to: "/dashboard" });
  },
  component: DocumentEntryPage,
});

function DocumentEntryPage() {
  return (
    <>
      <PageHeader
        title="Lançamento por documento"
        description="Somente o CEO. Tire uma foto ou escolha uma imagem da galeria: o sistema identifica os produtos, cadastra os que ainda não existem e lança as quantidades automaticamente no estoque."
      />
      <DocumentEntry />
    </>
  );
}
