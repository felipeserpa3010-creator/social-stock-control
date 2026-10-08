import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Clock3 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useUnit } from "@/hooks/useUnit";
import { receivedEntriesOptions, confirmStockReceipt, confirmStockReceiptGroup, receiptIdFromObservation, orderNumberFromObservation, type ReceivedEntryRow } from "@/lib/queries";
import { formatDate, formatQty } from "@/lib/format";
import { EmptyState, PageHeader, Panel, TableSkeleton } from "@/components/ui-kit";
import { Button } from "@/components/ui/button";
import { buildReceiptPdf } from "@/lib/pdf";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/recebimento")({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
    const { data: isResponsible } = await supabase.rpc("has_role", { _user_id: data.user.id, _role: "responsavel" });
    if (isResponsible !== true) throw redirect({ to: "/dashboard" });
  },
  head: () => ({ meta: [
    { title: "Confirmar recebimento — Controle de Estoque" },
    { name: "description", content: "Confirme o recebimento das mercadorias lançadas pelo CEO." },
  ]}),
  component: ReceiptPage,
});

function ReceiptPage() {
  const { role, profile, isAdmin, isViewer } = useAuth();
  const { unitId, unit, loading } = useUnit();
  const queryClient = useQueryClient();
  const canConfirm = role === "responsavel" && Boolean(profile?.unit_id);
  const { data: entries = [], isPending } = useQuery(receivedEntriesOptions(unitId, canConfirm));
  const pending = useMemo(() => entries.filter((e) => !e.receipt), [entries]);
  const confirmed = useMemo(() => entries.filter((e) => e.receipt), [entries]);
  const pendingGroups = useMemo(() => {
    const map = new Map<string, ReceivedEntryRow[]>();
    pending.forEach((entry) => {
      const id = receiptIdFromObservation(entry.observacao) ?? `INDIVIDUAL-${entry.id}`;
      const list = map.get(id) ?? [];
      list.push(entry);
      map.set(id, list);
    });
    return Array.from(map.entries()).map(([id, entries]) => ({ id, entries }));
  }, [pending]);
  const imprimirRecibo = async (receiptId: string, groupEntries: ReceivedEntryRow[]) => {
    const first = groupEntries[0];
    const doc = await buildReceiptPdf({
      reciboId: receiptId,
      numeroOrdemFornecimento: orderNumberFromObservation(first?.observacao),
      unidade: unit?.nome ?? first?.units?.nome ?? "Unidade",
      data: first?.data ?? new Date().toISOString().slice(0, 10),
      rows: groupEntries.map((entry) => ({
        produto: entry.products?.nome ?? "Produto",
        quantidade: entry.quantidade,
        medida: entry.products?.unidade_medida ?? "—",
      })),
    });
    doc.autoPrint();
    window.open(doc.output("bloburl"), "_blank");
  };

  const mutation = useMutation({
    mutationFn: (receiptId: string) =>
      receiptId.startsWith("REC-")
        ? confirmStockReceiptGroup(receiptId, profile?.nome ?? "Responsável pela unidade")
        : confirmStockReceipt(receiptId, profile?.nome ?? "Responsável pela unidade"),
    onSuccess: async () => {
      toast.success("Recebimento confirmado. As quantidades já estão no estoque.");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["received-entries"] }),
        queryClient.invalidateQueries({ queryKey: ["pending-receipts"] }),
        queryClient.invalidateQueries({ queryKey: ["stock"] }),
        queryClient.invalidateQueries({ queryKey: ["movements"] }),
      ]);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Não foi possível confirmar o recebimento."),
  });

  if (isAdmin || isViewer) return (
    <>
      <PageHeader title="Confirmar recebimento" description="A confirmação é realizada pelo responsável da unidade que recebeu a mercadoria." />
      <Panel title="Acesso somente para consulta">
        <EmptyState title={isAdmin ? "Administrador Principal" : "Gabinete SEMADS"}
          description={isAdmin ? "O CEO registra as entradas. O responsável da unidade confirma o recebimento." : "O Gabinete pode acompanhar os lançamentos, mas não confirma recebimentos."} />
      </Panel>
    </>
  );

  if (loading || isPending) return (
    <><PageHeader title="Confirmar recebimento" description="Confira as mercadorias lançadas para sua unidade." />
      <Panel title="Carregando"><TableSkeleton rows={5} cols={5} /></Panel></>
  );

  return (
    <>
      <PageHeader title="Confirmar recebimento"
        description={unit ? "Mercadorias lançadas pelo CEO para " + unit.nome + "." : "Confira as mercadorias lançadas para sua unidade."} />
      <Panel title={pendingGroups.length + " Recibo" + (pendingGroups.length === 1 ? "" : "s") + " de Produtos pendente" + (pendingGroups.length === 1 ? "" : "s")}
        description="Confira a quantidade recebida e confirme. A quantidade lançada pelo CEO não pode ser alterada nesta tela." bodyClassName="p-0">
        {pending.length === 0 ? <div className="p-4"><EmptyState title="Nenhum recebimento pendente"
          description={confirmed.length ? "Todos os lançamentos disponíveis já foram confirmados." : "Quando o CEO lançar uma mercadoria para sua unidade, ela aparecerá aqui."} /></div>
        : <div className="space-y-4 p-4">
          {pendingGroups.map((group) => {
            const first = group.entries[0];
            const receiptId = group.id;
            return <div key={receiptId} className="rounded-lg border p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-semibold">Recibo de Produtos nº {receiptId}</p>
                  <p className="text-xs text-muted-foreground">Data do lançamento: {formatDate(first?.data ?? null)} · {group.entries.length} produto(s)</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={() => imprimirRecibo(receiptId, group.entries)}>
                    Imprimir
                  </Button>
                  <Button size="sm" onClick={() => mutation.mutate(receiptId)} disabled={mutation.isPending}>
                    <CheckCircle2 />{mutation.isPending ? "Confirmando..." : "Confirmar recebimento"}
                  </Button>
                </div>
              </div>
              <div className="overflow-x-auto">
                <Table className="min-w-[620px]"><TableHeader><TableRow>
                  <TableHead>Produto</TableHead><TableHead className="text-right">Quantidade</TableHead><TableHead>Unidade</TableHead>
                </TableRow></TableHeader><TableBody>
                  {group.entries.map((entry) => <TableRow key={entry.id}>
                    <TableCell className="font-semibold">{entry.products?.nome ?? "Produto"}</TableCell>
                    <TableCell className="text-right font-bold tabular-nums">{formatQty(entry.quantidade)}</TableCell>
                    <TableCell>{entry.products?.unidade_medida ?? "—"}</TableCell>
                  </TableRow>)}
                </TableBody></Table>
              </div>
            </div>;
          })}
        </div>}
      </Panel>
      {confirmed.length > 0 && <Panel title="Recebimentos confirmados" description="Registro de quem confirmou e quando a confirmação foi feita." bodyClassName="p-0">
        <div className="overflow-x-auto"><Table className="min-w-[720px]"><TableHeader><TableRow>
          <TableHead>Produto</TableHead><TableHead className="text-right">Quantidade</TableHead><TableHead>Data do lançamento</TableHead><TableHead>Confirmado por</TableHead><TableHead>Data da confirmação</TableHead>
        </TableRow></TableHeader><TableBody>
          {confirmed.map((entry) => <TableRow key={entry.id}>
            <TableCell className="font-medium">{entry.products?.nome ?? "Produto"}</TableCell>
            <TableCell className="text-right tabular-nums">{formatQty(entry.quantidade)} {entry.products?.unidade_medida ?? ""}</TableCell>
            <TableCell className="text-sm text-muted-foreground">{formatDate(entry.data)}</TableCell>
            <TableCell className="text-sm">{entry.receipt?.confirmed_by_name ?? "—"}</TableCell>
            <TableCell className="text-sm text-muted-foreground"><span className="inline-flex items-center gap-1"><Clock3 className="size-3.5" />{formatDate(entry.receipt?.confirmed_at ?? null)}</span></TableCell>
          </TableRow>)}
        </TableBody></Table></div>
      </Panel>}
    </>
  );
}