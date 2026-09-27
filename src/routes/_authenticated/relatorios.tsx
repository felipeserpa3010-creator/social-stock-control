import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileDown } from "lucide-react";
import { toast } from "sonner";
import { ALL_UNITS, useUnit } from "@/hooks/useUnit";
import { movementsOptions, settingsOptions, stockOptions } from "@/lib/queries";
import { computeMediaMap, lastMonths } from "@/lib/media";
import { buildInventoryPdf, reportFileName, type InventoryRow } from "@/lib/pdf";
import { PageHeader, Panel } from "@/components/ui-kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_authenticated/relatorios")({
  head: () => ({
    meta: [
      { title: "Relatórios — Controle de Inventário" },
      { name: "description", content: "Gere relatórios PDF do estoque aproximado da unidade para impressão." },
      { property: "og:title", content: "Relatórios — Controle de Inventário" },
      { property: "og:description", content: "Relatórios PDF A4 de estoque com média de consumo opcional." },
    ],
  }),
  component: ReportsPage,
});

function ReportsPage() {
  const { unitId, unit } = useUnit();
  const { data: stock = [] } = useQuery(stockOptions(unitId));
  const { data: movements = [] } = useQuery(movementsOptions({ unitId, limit: 5000 }));
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const { data: periodMovements = [] } = useQuery(
    movementsOptions({ unitId, limit: 5000, ...(from ? { from } : {}), ...(to ? { to } : {}) }),
  );
  const { data: settings } = useQuery(settingsOptions());
  const [withMedia, setWithMedia] = useState(true);
  const [loading, setLoading] = useState(false);
  const series = useMemo(() => lastMonths(12), []);
  const media = useMemo(() => computeMediaMap(movements, series), [movements, series]);

  const generate = async () => {
    setLoading(true);
    try {
      const byProduct = new Map<string, InventoryRow>();
      stock.forEach((s) => {
        const current = byProduct.get(s.product.id);
        if (current) {
          current.estoque += s.quantity;
        } else {
          byProduct.set(s.product.id, {
            categoria: s.product.categories?.nome ?? "—",
            produto: s.product.nome,
            medida: s.product.unidade_medida,
            estoque: s.quantity,
            media: media.get(s.product.id)?.media ?? null,
          });
        }
      });
      const rows: InventoryRow[] = Array.from(byProduct.values()).sort(
        (a, b) =>
          a.categoria.localeCompare(b.categoria, "pt-BR") ||
          a.produto.localeCompare(b.produto, "pt-BR"),
      );
      const today = new Date().toISOString().slice(0, 10);
      const doc = await buildInventoryPdf({
        titulo: "Relatório de estoque aproximado",
        instituicao: settings?.nome_instituicao ?? "Assistência Social",
        secretaria: settings?.nome_secretaria ?? "",
        logoUrl: settings?.logo_url ?? null,
        unidade: unit?.nome ?? (unitId === ALL_UNITS ? "Todas as unidades" : "Unidade"),
        dataConferencia: today,
        incluirMedia: withMedia,
        rows,
        assinatura: true,
      });
      doc.save(reportFileName("Estoque", unit?.nome ?? "Unidade", today));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível gerar o PDF.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <PageHeader title="Relatórios" description={unitId === ALL_UNITS ? "Gere um PDF consolidado com o estoque de todas as unidades." : "Gere o PDF do estoque atual da unidade para impressão e arquivamento."} />
      <Panel title="Relatório de consumo por período" description="Selecione as datas para apurar as saídas registradas e gerar um PDF.">\n        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">\n          <div className="grid gap-3 sm:grid-cols-2">\n            <div><label className="mb-1 block text-[11px] text-muted-foreground" htmlFor="rel-from">De</label><Input id="rel-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>\n            <div><label className="mb-1 block text-[11px] text-muted-foreground" htmlFor="rel-to">Até</label><Input id="rel-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>\n          </div>\n          <Button variant="outline" onClick={generateConsumption} disabled={loading || !unitId || !periodMovements.length}>\n            <FileDown className="size-4" /> Gerar PDF de consumo\n          </Button>\n        </div>\n      </Panel>\n\n      <Panel title={`Estoque — ${unit?.nome ?? "Unidade"}`} description={`${stock.length} produtos com saldo registrado.`}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <Checkbox id="with-media" checked={withMedia} onCheckedChange={(v) => setWithMedia(v === true)} />
            <Label htmlFor="with-media">Incluir média de consumo mensal</Label>
          </div>
          <Button onClick={generate} disabled={loading || !unitId}>
            <FileDown className="size-4" /> {loading ? "Gerando..." : "Gerar PDF"}
          </Button>
        </div>
      </Panel>
    </>
  );
}
