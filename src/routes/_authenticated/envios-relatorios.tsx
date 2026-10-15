import { createFileRoute } from "@tanstack/react-router";
import { ExpedientePage } from "@/components/expediente-page";
import { requireExpedienteAccess } from "@/lib/expediente-access";

export const Route = createFileRoute("/_authenticated/envios-relatorios")({
  beforeLoad: requireExpedienteAccess,
  head: () => ({ meta: [
    { title: "Relatórios de envios em PDF — SEMADS" },
    { name: "description", content: "Relatórios por período dos materiais entregues pela SEMADS." },
    { property: "og:title", content: "Relatórios de envios em PDF — SEMADS" },
    { property: "og:description", content: "Relatórios por período dos materiais entregues pela SEMADS." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: () => <ExpedientePage key="relatorios" view="relatorios" />,
});
