import { createFileRoute } from "@tanstack/react-router";
import { ExpedientePage } from "@/components/expediente-page";
import { requireExpedienteAccess } from "@/lib/expediente-access";

export const Route = createFileRoute("/_authenticated/outros-materiais")({
  beforeLoad: requireExpedienteAccess,
  head: () => ({ meta: [
    { title: "Outros materiais — SEMADS" },
    { name: "description", content: "Registro de envio de outros materiais da SEMADS." },
    { property: "og:title", content: "Outros materiais — SEMADS" },
    { property: "og:description", content: "Registro de envio de outros materiais da SEMADS." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: () => <ExpedientePage key="outros" view="outros" />,
});
