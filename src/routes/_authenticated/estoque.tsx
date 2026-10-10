import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileText } from "lucide-react";
import { useUnit } from "@/hooks/useUnit";
import { ALL_UNITS, stockOptions } from "@/lib/queries";
import { formatDate, formatQty, stockStatus, todayISO } from "@/lib/format";
import { buildInventoryPdf } from "@/lib/pdf";
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
type CategoryFilter = "todas" | "alimentos" | "higiene" | "outras";

function StockPage() {
  const { unitId, unit, loading } = useUnit();
  const { data: entries, isPending } = useQuery(stockOptions(unitId));
  const [term, setTerm] = useState("");
  const [filter, setFilter] = useState<Filter>("todos");
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("todas");

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

  const exportPdf = async () => {
    if (!rows.length) return;
    const doc = await buildInventoryPdf({
      titulo: "Relatório de Estoque",
      instituicao: "SEMADS",
      secretaria: "Depósito SEMADS",
      unidade: unit?.nome ?? "Unidade",
      dataConferencia: todayISO(),
      rows: rows.map((r) => ({ produto: r.product.nome, estoque: r.quantity, medida: r.product.unidade_medida })),
      modo: "estoque",
      incluirMedia: false,
      assinatura: false,
    });
    doc.save("estoque_" + (unit?.sigla ?? "unidade") + "_" + todayISO() + ".pdf");
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
          <Button variant="outline" size="sm" onClick={exportPdf} disabled={!rows.length}>
            <FileText /> PDF
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
            <TableSkeleton rows={8} cols={5} />
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
