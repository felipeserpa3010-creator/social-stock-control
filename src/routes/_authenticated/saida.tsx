import { createFileRoute } from "@tanstack/react-router";
import { MovementForm } from "@/components/movement-form";
import { PageHeader } from "@/components/ui-kit";

export const Route = createFileRoute("/_authenticated/saida")({
  head: () => ({
    meta: [
      { title: "Saída de materiais — Controle de Inventário" },
      {
        name: "description",
        content: "Registre as dispensas e consumos que reduzem o estoque da unidade.",
      },
      { property: "og:title", content: "Saída de materiais — Controle de Inventário" },
      {
        property: "og:description",
        content: "Registro de dispensas e consumos no estoque da unidade.",
      },
    ],
  }),
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
