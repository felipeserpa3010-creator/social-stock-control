import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { IntelligentPanel } from "@/components/intelligent-panel";

export const Route = createFileRoute("/_authenticated/painel-ceo")({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: data.user.id, _role: "admin" });
    if (isAdmin !== true) throw redirect({ to: "/dashboard" });
  },
  head: () => ({
    meta: [
      { title: "Painel Inteligente do CEO — SEMADS" },
      { name: "description", content: "Visão geral de envios, recebimentos e estoque de todas as unidades da SEMADS." },
      { property: "og:title", content: "Painel Inteligente do CEO — SEMADS" },
      { property: "og:description", content: "Indicadores reais de envios, recebimentos e estoque das unidades." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: IntelligentPanel,
});

