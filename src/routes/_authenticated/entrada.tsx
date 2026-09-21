import { createFileRoute } from "@tanstack/react-router";
import { MovementForm } from "@/components/movement-form";
import { PageHeader } from "@/components/ui-kit";

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
