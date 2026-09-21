import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Boxes } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

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
        <span className="grid size-12 place-items-center rounded-lg bg-sidebar-primary/15 ring-1 ring-sidebar-primary/30">
          <Boxes className="size-6 text-sidebar-primary" />
        </span>
        <p className="text-sm font-semibold text-sidebar-foreground">Controle de Inventário</p>
        <p className="text-xs text-sidebar-foreground/60">Carregando...</p>
      </div>
    </div>
  );
}
