import { createFileRoute } from "@tanstack/react-router";
import { ExpedientePage } from "@/components/expediente-page";
import { requireExpedienteAccess } from "@/lib/expediente-access";

export const Route = createFileRoute("/_authenticated/envios-recibos")({
  beforeLoad: requireExpedienteAccess,
  head: () => ({ meta: [
    { title: "Registro de recibos — SEMADS" },
    { name: "description", content: "Consulta e confirmação dos recibos de materiais da SEMADS." },
    { property: "og:title", content: "Registro de recibos — SEMADS" },
    { property: "og:description", content: "Consulta e confirmação dos recibos de materiais da SEMADS." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: () => <ExpedientePage key="recibos" view="recibos" />,
});
