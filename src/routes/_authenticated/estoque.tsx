import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { ALL_UNITS, useUnit } from "@/hooks/useUnit";
import { stockOptions } from "@/lib/queries";
import { formatDate, formatQty, stockStatus } from "@/lib/format";
import { EmptyState, PageHeader, Panel, SearchInput, TableSkeleton } from "@/components/ui-kit";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/estoque")({
  head: () => ({
    meta: [
      { title: "Estoque — Controle de Estoque" },
      {
        name: "description",
        content: "Estoque aproximado de cada produto da unidade, com alertas de mínimo e zerado.",
      },
      { property: "og:title", content: "Estoque — Controle de Estoque" },
      {
        property: "og:description",
        content: "Estoque aproximado por produto, com situação e data da última atualização.",
      },
    ],
  }),
  component: StockPage,
});

type Filter = "todos" | "normal" | "baixo" | "zerado";

function StockPage() {
  const { unitId, unit, loading } = useUnit();
  const { data: entries, isPending } = useQuery(stockOptions(unitId));
  const [term, setTerm] = useState("");
  const [filter, setFilter] = useState<Filter>("todos");

  const rows = useMemo(() => {
    const list = (entries ?? []).filter((e) => {
      const status = stockStatus(e.quantity, e.product.estoque_minimo);
      if (filter !== "todos" && status !== filter) return false;
      if (!term.trim()) return true;
      const q = term.trim().toLowerCase();
      return (
        e.product.nome.toLowerCase().includes(q) ||
        (e.product.categories?.nome ?? "").toLowerCase().includes(q)
      );
    });
    return list.sort((a, b) => a.product.nome.localeCompare(b.product.nome, "pt-BR"));
  }, [entries, term, filter]);

  const counts = useMemo(() => {
    const list = entries ?? [];
    return {
      total: list.length,
      zerado: list.filter((e) => stockStatus(e.quantity) === "zerado").length,
      baixo: list.filter((e) => stockStatus(e.quantity, e.product.estoque_minimo) === "baixo").length,
    };
  }, [entries]);

  const exportCsv = () => {
    const header = ["Produto", "Estoque aproximado", "Unidade de medida", "Situação", "Atualizado em"];
    const lines = rows.map((r) => {
      const status = stockStatus(r.quantity, r.product.estoque_minimo);
      const situacao = status === "zerado" ? "Zerado" : status === "baixo" ? "Quase acabando" : "Disponível";
      return [
        r.product.nome,
        String(r.quantity),
        r.product.unidade_medida,
        situacao,
        r.updated_at ? new Date(r.updated_at).toLocaleDateString("pt-BR") : "",
      ];
    });
    const csv = [header, ...lines]
      .map((cols) => cols.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";"))
      .join("\n");
    const url = URL.createObjectURL(new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `estoque_${unit?.sigla ?? "unidade"}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <PageHeader
        title="Estoque da unidade"
        description={
          unit
            ? `Estoque aproximado de ${unit.nome}.`
            : "Nenhuma unidade disponível."
        }
        actions={
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={!rows.length}>
            <Download /> CSV
          </Button>
        }
      />

      <Panel
        title="Estoque"
        description={`${counts.total} produtos · ${counts.baixo} quase acabando · ${counts.zerado} zerados`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <SearchInput value={term} onChange={setTerm} placeholder="Pesquisar produto..." className="w-56" />
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value as Filter)}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
              aria-label="Filtrar situação"
            >
              <option value="todos">Todas as situações</option>
              <option value="normal">Disponíveis</option>
              <option value="baixo">Quase acabando</option>
              <option value="zerado">Zerados</option>
            </select>
          </div>
        }
        bodyClassName="p-0"
      >
        {loading || isPending ? (
          <div className="p-4">
            <TableSkeleton rows={8} cols={4} />
          </div>
        ) : rows.length === 0 ? (
          <div className="p-4">
            <EmptyState
              title="Nenhum produto nesta lista"
              description="Ajuste a busca ou o filtro. Produtos aparecem na ficha de estoque após a primeira movimentação."
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table className="min-w-[720px]">
              <TableHeader>
                <TableRow className="bg-muted/50">
                  {unitId === ALL_UNITS && <TableHead>Unidade</TableHead>}
                  <TableHead>Nome do produto</TableHead>
                  <TableHead className="text-right">Estoque aproximado</TableHead>
                  <TableHead>Unidade de medida</TableHead>
                  <TableHead>Situação</TableHead>
                  <TableHead className="text-right">Atualizado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={`${r.unit_id}-${r.product.id}`}>
                    {unitId === ALL_UNITS && <TableCell className="font-medium">{r.unit?.nome ?? "—"}</TableCell>}
                    <TableCell className="font-semibold">{r.product.nome}</TableCell>
                    <TableCell className="text-right font-bold tabular-nums">{formatQty(r.quantity)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{r.product.unidade_medida}</TableCell>
                    <TableCell>
                      {(() => {
                        const status = stockStatus(r.quantity, r.product.estoque_minimo);
                        return (
                          <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${
                            status === "zerado"
                              ? "border-destructive/40 bg-destructive/10 text-destructive"
                              : status === "baixo"
                                ? "border-amber-600/40 bg-amber-500/10 text-amber-800 dark:text-amber-300"
                                : "border-border bg-muted text-foreground"
                          }`}>
                            {status === "zerado" ? "Zerado" : status === "baixo" ? "Quase acabando" : "Disponível"}
                          </span>
                        );
                      })()}
                    </TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">{formatDate(r.updated_at)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Panel>


    </>
  );
}
