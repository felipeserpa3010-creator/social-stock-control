import { createFileRoute } from "@tanstack/react-router";
import { InventoryDispatch } from "@/components/inventory-dispatch";
import { requireEnvioRegistroAccess } from "@/lib/expediente-access";
export const Route = createFileRoute("/_authenticated/distribuir")({
  beforeLoad: requireEnvioRegistroAccess,
  head: () => ({ meta: [
    { title: "Distribuir materiais — SEMADS" },
    { name: "description", content: "Envios do Centro de Distribuição e de materiais externos às unidades SEMADS." },
    { property: "og:title", content: "Distribuir materiais — SEMADS" },
    { property: "og:description", content: "Recibos de entrega com confirmação pela unidade destinatária." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: InventoryDispatch,
});