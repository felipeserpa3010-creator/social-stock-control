import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { useUnit } from "@/hooks/useUnit";
import { movementsOptions, productsOptions, stockOptions } from "@/lib/queries";
import { computeMediaMap, lastMonths, sumSaidas } from "@/lib/media";
import { formatQty, stockStatus } from "@/lib/format";
import { EmptyState, PageHeader, Panel, SearchInput, StatCard, TableSkeleton } from "@/components/ui-kit";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/medias")({
  head: () => ({
    meta: [
      { title: "Média de consumo — Controle de Inventário" },
      {
        name: "description",
        content: "Média mensal de consumo calculada a partir das saídas registradas na unidade.",
      },
      { property: "og:title", content: "Média de consumo — Controle de Inventário" },
      {
        property: "og:description",
        content: "Média mensal de consumo por produto e duração estimada do estoque atual.",
      },
    ],
  }),
  component: MediaPage,
});

function MediaPage() {
  const { unitId, unit } = useUnit();
  const { data: products = [] } = useQuery(productsOptions(true));
  const { data: movements = [], isPending } = useQuery(movementsOptions({ unitId, limit: 5000 }));
  const { data: stock = [] } = useQuery(stockOptions(unitId));
  const [months, setMonths] = useState(12);
  const [term, setTerm] = useState("");

  const series = lastMonths(months);
  const media = useMemo(() => computeMediaMap(movements, series), [movements, series]);
  const stockMap = useMemo(() => {
    const map = new Map<string, number>();
    stock.forEach((s) => map.set(s.product.id, Number(s.quantity)));
    return map;
  }, [stock]);

  const rows = useMemo(() => {
    const list = products.filter((p) => {
      if (!term.trim()) return true;
      const q = term.trim().toLowerCase();
      return p.nome.toLowerCase().includes(q) || (p.categories?.nome ?? "").toLowerCase().includes(q);
    });
    return list.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }, [products, term]);

  const withMedia = rows.filter((p) => media[p.id]?.media !== null);
  const insufficient = rows.filter((p) => media[p.id]?.media === null);
  const risky = rows.filter((p) => {
    const m = media[p.id]?.media;
    const current = stockMap.get(p.id) ?? 0;
    return m ? current > 0 && current / m <= 1 : false;
  });

  return (
    <>
      <PageHeader
        title="Média de consumo mensal"
        description="Calculada automaticamente pelas saídas registradas: total do período dividido pelos meses acompanhados."
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const header = ["Produto", "Categoria", "Total de saidas", "Meses", "Media mensal"];
              const lines = rows.map((p) => {
                const m = media[p.id];
                return [
                  p.nome,
                  p.categories?.nome ?? "",
                  String(sumSaidas(movements, p.id, series)),
                  m && m.media !== null ? String(m.months) : "",
                  m && m.media !== null ? String(m.media) : "Dados insuficientes",
                ];
              });
              const csv = [header, ...lines]
                .map((cols) => cols.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";"))
                .join("\n");
              const url = URL.createObjectURL(new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" }));
              const a = document.createElement("a");
              a.href = url;
              a.download = `medias_${unit?.sigla ?? "unidade"}_${new Date().toISOString().slice(0, 10)}.csv`;
              a.click();
              URL.revokeObjectURL(url);
            }}
            disabled={!rows.length}
          >
            <Download /> CSV
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Produtos com média" value={withMedia.length} tone="success" />
        <StatCard
          label="Sem dados suficientes"
          value={insufficient.length}
          tone={insufficient.length ? "warning" : "neutral"}
          hint="Ainda sem saída registrada."
        />
        <StatCard
          label="Risco de acabar em 1 mês"
          value={risky.length}
          tone={risky.length ? "danger" : "success"}
          hint="Estoque atual dividido pela média mensal."
        />
      </div>

      <Panel
        title={`Período de ${months} meses`}
        description="Quanto maior o período, mais estável a média. A contagem começa no primeiro mês com movimentação."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <SearchInput value={term} onChange={setTerm} placeholder="Buscar produto..." className="w-44" />
            <select
              value={months}
              onChange={(e) => setMonths(Number(e.target.value))}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
              aria-label="Período da média"
            >
              <option value={3}>3 meses</option>
              <option value={6}>6 meses</option>
              <option value={12}>12 meses</option>
            </select>
          </div>
        }
        bodyClassName="p-0"
      >
        {isPending ? (
          <div className="p-4">
            <TableSkeleton rows={8} cols={5} />
          </div>
        ) : rows.length === 0 ? (
          <div className="p-4">
            <EmptyState
              title="Nenhum produto encontrado"
              description="Cadastre produtos ou registre saídas para calcular a média."
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table className="min-w-[760px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Produto</TableHead>
                  <TableHead className="text-right">Saídas no período</TableHead>
                  <TableHead className="text-right">Meses</TableHead>
                  <TableHead className="text-right">Média mensal</TableHead>
                  <TableHead className="text-right">Estoque atual</TableHead>
                  <TableHead className="text-right">Dura aprox.</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((p) => {
                  const m = media[p.id];
                  const current = stockMap.get(p.id) ?? 0;
                  const duration = m?.media ? current / m.media : null;
                  return (
                    <TableRow key={p.id}>
                      <TableCell>
                        <p className="font-medium">{p.nome}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {p.categories?.nome ?? "Sem categoria"} · {p.unidade_medida}
                        </p>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatQty(sumSaidas(movements, p.id, series))}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {m?.media !== null && m ? m.months : "—"}
                      </TableCell>
                      <TableCell className="text-right font-bold tabular-nums">
                        {m?.media !== null && m ? (
                          formatQty(m.media)
                        ) : (
                          <span className="text-xs font-normal italic text-muted-foreground">
                            Dados insuficientes
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        <span
                          className={
                            stockStatus(current, p.estoque_minimo) === "zerado"
                              ? "text-destructive font-semibold"
                              : ""
                          }
                        >
                          {formatQty(current)}
                        </span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {duration === null ? (
                          "—"
                        ) : (
                          <span className={duration <= 1 ? "font-semibold text-destructive" : ""}>
                            {duration.toFixed(1)} meses
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </Panel>
    </>
  );
}
