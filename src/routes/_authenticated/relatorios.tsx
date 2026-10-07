import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileDown } from "lucide-react";
import { toast } from "sonner";
import { useUnit } from "@/hooks/useUnit";
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
      { title: "Relatórios — Controle de Estoque" },
      { name: "description", content: "Gere relatórios PDF do estoque aproximado da unidade para impressão." },
      { property: "og:title", content: "Relatórios — Controle de Estoque" },
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
  const selectedMonths = useMemo(() => {
    const start = from ? new Date(`${from}T12:00:00`) : null;
    const end = to ? new Date(`${to}T12:00:00`) : null;
    if (!start || !end) return 1;
    return Math.max(1, (end.getFullYear() - start.getFullYear()) * 12 + end.getMonth() - start.getMonth() + 1);
  }, [from, to]);

  const generate = async () => {
    setLoading(true);
    try {
      const byProduct = new Map<string, InventoryRow>();
      stock.forEach((s) => {
        const current = byProduct.get(s.product.id);
        if (current) current.estoque += s.quantity;
        else {
          byProduct.set(s.product.id, {
            produto: s.product.nome,
            medida: s.product.unidade_medida,
            estoque: s.quantity,
            media: media.get(s.product.id)?.media ?? null,
          });
        }
      });
      const rows: InventoryRow[] = Array.from(byProduct.values()).sort((a, b) =>
        a.produto.localeCompare(b.produto, "pt-BR"),
      );
      const today = new Date().toISOString().slice(0, 10);
      const doc = await buildInventoryPdf({
        titulo: "Relatório de estoque aproximado",
        instituicao: settings?.nome_instituicao ?? "Assistência Social",
        secretaria: settings?.nome_secretaria ?? "",
        logoUrl: settings?.logo_url ?? null,
        unidade: unit?.nome ?? "Unidade",
        dataConferencia: today,
        incluirMedia: withMedia,
        rows,
        assinatura: true,
      });
      doc.save(reportFileName("Estoque", unit?.nome ?? "Todas-as-unidades", today));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível gerar o PDF.");
    } finally {
      setLoading(false);
    }
  };

  const generateConsumption = async () => {
    setLoading(true);
    try {
      if (from && to && from > to) throw new Error("A data inicial não pode ser maior que a data final.");
      const totals = new Map<string, InventoryRow>();
      const categoryTotals = new Map<string, { total: number; monthlyAverage: number }>();
      periodMovements
        .filter((m) => m.tipo === "saida")
        .forEach((m) => {
          const product = m.products;
          if (!product) return;
          const rawCategory = product.categories?.nome?.trim() ?? "Sem categoria";
          const normalized = rawCategory.toLowerCase();

          let category = rawCategory;
          if (normalized === "grãos" || normalized === "graos" || normalized === "grãos e cereais" || normalized === "graos e cereais") {
            category = "Grãos e Cereais";
          } else if (normalized.includes("higiene") || normalized.includes("limpeza")) {
            category = "Materiais de Higiene e Limpeza";
          } else if (normalized === "óleo" || normalized === "oleo" || normalized === "óleos e gorduras" || normalized === "oleos e gorduras") {
            category = "Óleos e Gorduras";
          } else if (normalized === "açúcar" || normalized === "acucar" || normalized === "açúcares e adoçantes" || normalized === "acucares e adoçantes") {
            category = "Açúcares e Adoçantes";
          } else if (normalized === "leite" || normalized === "laticínios" || normalized === "laticinios") {
            category = "Laticínios";
          }

          const categoryCurrent = categoryTotals.get(category) ?? { total: 0, monthlyAverage: 0 };
          categoryCurrent.total += Number(m.quantidade);
          categoryTotals.set(category, categoryCurrent);
          const current = totals.get(product.id);
          if (current) current.estoque += Number(m.quantidade);
          else {
            totals.set(product.id, {
              produto: product.nome,
              medida: product.unidade_medida,
              estoque: Number(m.quantidade),
            });
          }
        });

      const categorySummary = Array.from(categoryTotals.entries())
        .map(([categoria, values]) => ({ categoria, total: values.total, mediaMensal: values.total / selectedMonths }))
        .sort((a, b) => b.total - a.total);
      const rows = Array.from(totals.values()).sort((a, b) =>
        a.produto.localeCompare(b.produto, "pt-BR"),
      );
      const today = new Date().toISOString().slice(0, 10);
      const doc = await buildInventoryPdf({
        titulo: "Relatório de consumo por período",
        instituicao: settings?.nome_instituicao ?? "Assistência Social",
        secretaria: settings?.nome_secretaria ?? "",
        logoUrl: settings?.logo_url ?? null,
        unidade: unit?.nome ?? "Unidade",
        dataConferencia: today,
        periodoSelecionado: { ...(from ? { from } : {}), ...(to ? { to } : {}) },
        incluirMedia: false,
        modo: "consumo",
        rows,
        categorySummary,
        assinatura: false,
      });
      doc.save(reportFileName("Consumo", unit?.nome ?? "Unidade", to || today));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível gerar o relatório de consumo.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <PageHeader title="Relatórios" description="Consumo, média mensal e estoque da unidade selecionada." />
      <Panel title="Relatório de consumo por período" description="Selecione as datas para apurar as saídas registradas e gerar um PDF.">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="grid gap-3 sm:grid-cols-2">
            <div><label className="mb-1 block text-[11px] text-muted-foreground" htmlFor="rel-from">De</label><Input id="rel-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
            <div><label className="mb-1 block text-[11px] text-muted-foreground" htmlFor="rel-to">Até</label><Input id="rel-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
          </div>
          <Button variant="outline" onClick={generateConsumption} disabled={loading || !unitId || !periodMovements.length}>
            <FileDown className="size-4" /> Gerar PDF de consumo
          </Button>
        </div>
      </Panel>

      <Panel title={`Estoque — ${unit?.nome ?? "Unidade"}`} description={`${stock.length} registros de estoque.`}>
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
