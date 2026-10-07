import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileText, Printer } from "lucide-react";
import { ALL_UNITS, receivedEntriesOptions, receiptIdFromObservation, type ReceivedEntryRow } from "@/lib/queries";
import { formatDate, formatQty } from "@/lib/format";
import { EmptyState, PageHeader, Panel, SearchInput, TableSkeleton } from "@/components/ui-kit";
import { Button } from "@/components/ui/button";
import { buildReceiptPdf } from "@/lib/pdf";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/recibos")({
  head: () => ({
    meta: [
      { title: "Recibos — Controle de Estoque" },
      { name: "description", content: "Consulte os Recibos de Produtos enviados às unidades." },
    ],
  }),
  component: ReceiptsPage,
});

type ReceiptGroup = {
  id: string;
  entries: ReceivedEntryRow[];
  unitName: string;
  date: string;
  confirmed: boolean;
};

function displayReceiptNumber(id: string) {
  const numeric = Number(id);
  return Number.isFinite(numeric) ? String(numeric).padStart(3, "0") : id;
}

function ReceiptsPage() {
  const { data: entries = [], isPending } = useQuery(receivedEntriesOptions(ALL_UNITS, true));
  const [term, setTerm] = useState("");

  const groups = useMemo<ReceiptGroup[]>(() => {
    const map = new Map<string, ReceivedEntryRow[]>();

    entries.forEach((entry) => {
      const id = receiptIdFromObservation(entry.observacao) ?? `INDIVIDUAL-${entry.id}`;
      const list = map.get(id) ?? [];
      list.push(entry);
      map.set(id, list);
    });

    return Array.from(map.entries())
      .map(([id, groupEntries]) => ({
        id,
        entries: groupEntries,
        unitName: groupEntries[0]?.units?.nome ?? "Unidade",
        date: groupEntries[0]?.data ?? "",
        confirmed: groupEntries.every((entry) => Boolean(entry.receipt)),
      }))
      .filter((group) => {
        if (!term.trim()) return true;
        const q = term.trim().toLowerCase();
        return (
          displayReceiptNumber(group.id).toLowerCase().includes(q) ||
          group.unitName.toLowerCase().includes(q) ||
          group.entries.some((entry) => (entry.products?.nome ?? "").toLowerCase().includes(q))
        );
      })
      .sort((a, b) => {
        const aNum = Number(a.id);
        const bNum = Number(b.id);
        if (Number.isFinite(aNum) && Number.isFinite(bNum)) return aNum - bNum;
        return a.id.localeCompare(b.id, "pt-BR");
      });
  }, [entries, term]);

  const imprimirRecibo = async (group: ReceiptGroup) => {
    const doc = await buildReceiptPdf({
      reciboId: displayReceiptNumber(group.id),
      unidade: group.unitName,
      data: group.date || new Date().toISOString().slice(0, 10),
      rows: group.entries.map((entry) => ({
        produto: entry.products?.nome ?? "Produto",
        quantidade: entry.quantidade,
        medida: entry.products?.unidade_medida ?? "—",
      })),
    });
    doc.autoPrint();
    window.open(doc.output("bloburl"), "_blank");
  };

  const total = groups.length;
  const recebidos = groups.filter((group) => group.confirmed).length;
  const pendentes = total - recebidos;

  return (
    <>
      <PageHeader
        title="Recibos"
        description="Consulte os Recibos de Produtos e as entregas realizadas para as unidades."
      />

      <Panel
        title="Consultar recibo de entrega"
        description={`${total} recibo(s) · ${recebidos} recebido(s) · ${pendentes} pendente(s)`}
        actions={
          <SearchInput
            value={term}
            onChange={setTerm}
            placeholder="Pesquisar recibo, unidade ou produto..."
            className="w-72"
          />
        }
        bodyClassName="p-0"
      >
        {isPending ? (
          <div className="p-4"><TableSkeleton rows={8} cols={6} /></div>
        ) : groups.length === 0 ? (
          <div className="p-4">
            <EmptyState
              title="Nenhum recibo encontrado"
              description="Os recibos de entrega aparecerão aqui após um lançamento em massa."
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table className="min-w-[850px]">
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead>Recibo</TableHead>
                  <TableHead>Unidade de destino</TableHead>
                  <TableHead>Data do lançamento</TableHead>
                  <TableHead>Produtos</TableHead>
                  <TableHead>Situação</TableHead>
                  <TableHead className="text-right">Ação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {groups.map((group) => (
                  <TableRow key={group.id}>
                    <TableCell className="font-bold tabular-nums">Nº {displayReceiptNumber(group.id)}</TableCell>
                    <TableCell className="font-medium">{group.unitName}</TableCell>
                    <TableCell>{formatDate(group.date)}</TableCell>
                    <TableCell>{group.entries.length}</TableCell>
                    <TableCell>
                      <span className="inline-flex rounded-full border border-border bg-muted px-2 py-0.5 text-xs font-semibold">
                        {group.confirmed ? "Recebido" : "Pendente"}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="outline" size="sm" onClick={() => imprimirRecibo(group)}>
                        <Printer /> Imprimir
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Panel>

      {groups.length > 0 && (
        <Panel title="Detalhes dos recibos" description="Produtos, quantidades e unidade de medida de cada entrega.">
          <div className="space-y-4">
            {groups.map((group) => (
              <div key={group.id} className="rounded-lg border p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold">Recibo de Produtos nº {displayReceiptNumber(group.id)}</p>
                    <p className="text-xs text-muted-foreground">
                      {group.unitName} · {formatDate(group.date)} · {group.confirmed ? "Recebido" : "Pendente"}
                    </p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => imprimirRecibo(group)}>
                    <FileText /> Consultar / imprimir
                  </Button>
                </div>
                <div className="overflow-x-auto">
                  <Table className="min-w-[620px]">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Produto</TableHead>
                        <TableHead className="text-right">Quantidade</TableHead>
                        <TableHead>Unidade</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {group.entries.map((entry) => (
                        <TableRow key={entry.id}>
                          <TableCell className="font-semibold">{entry.products?.nome ?? "Produto"}</TableCell>
                          <TableCell className="text-right font-bold tabular-nums">{formatQty(entry.quantidade)}</TableCell>
                          <TableCell>{entry.products?.unidade_medida ?? "—"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      )}
    </>
  );
}
