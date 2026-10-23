import { createFileRoute } from "@tanstack/react-router";
import { ExpedientePage } from "@/components/expediente-page";
import { requireEnvioRegistroAccess } from "@/lib/expediente-access";

export const Route = createFileRoute("/_authenticated/expediente")({
  beforeLoad: requireEnvioRegistroAccess,
  head: () => ({ meta: [
    { title: "Materiais de expediente — SEMADS" },
    { name: "description", content: "Registro de envio de materiais de expediente da SEMADS." },
    { property: "og:title", content: "Materiais de expediente — SEMADS" },
    { property: "og:description", content: "Registro de envio de materiais de expediente da SEMADS." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: () => <ExpedientePage key="expediente" view="expediente" />,
});
