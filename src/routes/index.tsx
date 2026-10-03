import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { semadsLogoUrl } from "@/lib/brand";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Controle de Inventário — Assistência Social" },
      {
        name: "description",
        content: "Acesse o controle de estoque das dispensas da Assistência Social.",
      },
      { property: "og:title", content: "Controle de Inventário — Assistência Social" },
      {
        property: "og:description",
        content: "Entradas, saídas, conferências, média de consumo e relatórios em PDF.",
      },
    ],
  }),
  component: Index,
});

function Index() {
  const { session, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;
    navigate({ to: session ? "/dashboard" : "/auth", replace: true });
  }, [loading, session, navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-sidebar px-4">
      <div className="flex flex-col items-center gap-3 text-center">
        <img src={semadsLogoUrl} alt="SEMADS" className="h-auto w-48 rounded-md object-contain shadow-panel" />
        <p className="text-sm font-semibold text-sidebar-foreground">Controle de Inventário</p>
        <p className="text-xs text-sidebar-foreground/60">Carregando...</p>
      </div>
    </div>
  );
}
