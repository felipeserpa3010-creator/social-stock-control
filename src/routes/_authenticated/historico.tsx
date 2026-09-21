import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { useUnit } from "@/hooks/useUnit";
import { movementsOptions, productsOptions } from "@/lib/queries";
import { formatDate, formatQty, todayISO } from "@/lib/format";
import { EmptyState, PageHeader, Panel, SearchInput, TableSkeleton, TypeBadge } from "@/components/ui-kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/historico")({
  head: () => ({
    meta: [
      { title: "Histórico de movimentações — Controle de Inventário" },
      {
        name: "description",
        content: "Histórico completo de entradas, saídas e ajustes de estoque da unidade.",
      },
      { property: "og:title", content: "Histórico de movimentações — Controle de Inventário" },
      {
        property: "og:description",
        content: "Entradas, saídas e ajustes registrados na dispensa, com filtros por período.",
      },
    ],
  }),
  component: HistoryPage,
});

function HistoryPage() {
  const { unitId, unit } = useUnit();
  const { data: products = [] } = useQuery(productsOptions(true));
  const [tipo, setTipo] = useState<"" | MovementType>("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [productId, setProductId] = useState("");
  const [term, setTerm] = useState("");
  const [visible, setVisible] = useState(80);

  const { data: movements = [], isPending } = useQuery(
    movementsOptions({ unitId, tipo: tipo || undefined, from: from || undefined, to: to || undefined, productId: productId || undefined, limit: 2000 }),
  );

  const rows = useMemo(() => {
    if (!term.trim()) return movements;
    const q = term.trim().toLowerCase();
    return movements.filter((m) => (m.products?.nome ?? "").toLowerCase().includes(q));
  }, [movements, term]);

  const exportCsv = () => {
    const header = ["Data", "Tipo", "Produto", "Quantidade", "Responsavel", "Observacao"];
    const lines = rows.map((m) => [
      formatDate(m.data),
      m.tipo,
      m.products?.nome ?? "",
      String(m.quantidade),
      m.responsavel ?? "",
      m.observacao ?? "",
    ]);
    const csv = [header, ...lines]
      .map((cols) => cols.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";"))
      .join("\n");
    const url = URL.createObjectURL(new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `historico_${unit?.sigla ?? "unidade"}_${todayISO()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <PageHeader
        title="Histórico de movimentações"
        description="Todos os lançamentos da dispensa. Registros não podem ser editados nem excluídos."
        actions={
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={!rows.length}>
            <Download /> CSV
          </Button>
        }
      />

      <Panel
        title="Filtros"
        description="Combine período, tipo e produto para encontrar um lançamento."
        bodyClassName="p-0"
      >
        <div className="grid gap-3 border-b border-border/70 p-4 sm:grid-cols-2 lg:grid-cols-5">
          <div>
            <label className="mb-1 block text-[11px] text-muted-foreground" htmlFor="f-tipo">Tipo</label>
            <select
              id="f-tipo"
              value={tipo}
              onChange={(e) => setTipo(e.target.value)}
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="">Todos</option>
              <option value="entrada">Entradas</option>
              <option value="saida">Saídas</option>
              <option value="conferencia">Conferências</option>
              <option value="ajuste">Ajustes</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[11px] text-muted-foreground" htmlFor="f-prod">Produto</label>
            <select
              id="f-prod"
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="">Todos</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>{p.nome}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[11px] text-muted-foreground" htmlFor="f-from">De</label>
            <Input id="f-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-[11px] text-muted-foreground" htmlFor="f-to">Até</label>
            <Input id="f-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-[11px] text-muted-foreground" htmlFor="f-term">Busca</label>
            <SearchInput
              id="f-term"
              value={term}
              onChange={setTerm}
              placeholder="Produto..."
              className="h-9"
            />
          </div>
        </div>

        {isPending ? (
          <div className="p-4">
            <TableSkeleton rows={10} cols={5} />
          </div>
        ) : rows.length === 0 ? (
          <div className="p-4">
            <EmptyState
              title="Nenhum lançamento encontrado"
              description="Ajuste os filtros ou registre entradas e saídas."
            />
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <Table className="min-w-[820px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Produto</TableHead>
                    <TableHead className="text-right">Quantidade</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Responsável</TableHead>
                    <TableHead>Observação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.slice(0, visible).map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className="whitespace-nowrap tabular-nums">{formatDate(m.data)}</TableCell>
                      <TableCell className="font-medium">{m.products?.nome ?? "—"}</TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">
                        {formatQty(m.quantidade)}
                        <span className="ml-1 text-[11px] font-normal text-muted-foreground">
                          {m.products?.unidade_medida}
                        </span>
                      </TableCell>
                      <TableCell><TypeBadge tipo={m.tipo} /></TableCell>
                      <TableCell className="text-muted-foreground">{m.responsavel ?? "—"}</TableCell>
                      <TableCell className="max-w-[280px] truncate text-xs text-muted-foreground">
                        {m.observacao ?? "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 p-4">
              <p className="text-xs text-muted-foreground">
                Exibindo {Math.min(visible, rows.length)} de {rows.length} registros.
              </p>
              {visible < rows.length && (
                <Button variant="outline" size="sm" onClick={() => setVisible((v) => v + 80)}>
                  Carregar mais
                </Button>
              )}
            </div>
          </>
        )}
      </Panel>
    </>
  );
}
