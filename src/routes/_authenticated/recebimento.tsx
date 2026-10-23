import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Clock3, Eye, Printer, XCircle } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useUnit } from "@/hooks/useUnit";
import { receivedEntriesOptions, confirmStockReceipt, confirmStockReceiptGroup, markReceiptNotReceived, receiptIdFromObservation, orderNumberFromObservation, type ReceivedEntryRow } from "@/lib/queries";
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
  const myUnitId = profile?.unit_id ?? unitId ?? null;
  const canConfirm = !isAdmin && !isViewer && Boolean(myUnitId);
  const { data: entries = [], isLoading: isPending } = useQuery(receivedEntriesOptions(myUnitId, canConfirm));
  const pending = useMemo(() => entries.filter((e) => !e.receipt && !String(e.observacao ?? "").includes("NAO_RECEBIDO")), [entries]);
  const notReceived = useMemo(() => entries.filter((e) => !e.receipt && String(e.observacao ?? "").includes("NAO_RECEBIDO")), [entries]);
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
  const imprimirRecibo = async (receiptId: string, groupEntries: ReceivedEntryRow[], print = true) => {
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
    if (print) doc.autoPrint();
    window.open(doc.output("bloburl"), "_blank");
  };

  const notReceivedMutation = useMutation({
    mutationFn: (receiptId: string) => markReceiptNotReceived(receiptId),
    onSuccess: async () => {
      toast.success("Recibo marcado como não recebido. Nada foi adicionado ao estoque.");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["received-entries"] }),
        queryClient.invalidateQueries({ queryKey: ["pending-receipts"] }),
        queryClient.invalidateQueries({ queryKey: ["stock"] }),
        queryClient.invalidateQueries({ queryKey: ["movements"] }),
      ]);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Não foi possível registrar o não recebimento."),
  });

  const mutation = useMutation({
    mutationFn: (receiptId: string) =>
      !/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(receiptId)
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
                  <p className="text-xs text-muted-foreground">
                    Data do lançamento: {formatDate(first?.data ?? null)} · {group.entries.length} produto(s)
                    {orderNumberFromObservation(first?.observacao) ? ` · OF: ${orderNumberFromObservation(first?.observacao)}` : ""}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={() => imprimirRecibo(receiptId, group.entries, false)}>
                    <Eye />Visualizar
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => imprimirRecibo(receiptId, group.entries)}>
                    <Printer />Imprimir
                  </Button>
                  <Button size="sm" onClick={() => mutation.mutate(receiptId)} disabled={mutation.isPending || notReceivedMutation.isPending}>
                    <CheckCircle2 />{mutation.isPending ? "Confirmando..." : "Recebi"}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => notReceivedMutation.mutate(receiptId)} disabled={mutation.isPending || notReceivedMutation.isPending}>
                    <XCircle />{notReceivedMutation.isPending ? "Registrando..." : "Não recebi"}
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
      <MaterialReceipts unitId={myUnitId} />

      {notReceived.length > 0 && <Panel title="Recibos não recebidos" description="Esses recibos não geraram entrada no estoque." bodyClassName="p-0">
        <div className="overflow-x-auto"><Table className="min-w-[620px]"><TableHeader><TableRow>
          <TableHead>Produto</TableHead><TableHead className="text-right">Quantidade</TableHead><TableHead>Data do lançamento</TableHead><TableHead>Status</TableHead>
        </TableRow></TableHeader><TableBody>
          {notReceived.map((entry) => <TableRow key={entry.id}>
            <TableCell className="font-medium">{entry.products?.nome ?? "Produto"}</TableCell>
            <TableCell className="text-right tabular-nums">{formatQty(entry.quantidade)} {entry.products?.unidade_medida ?? ""}</TableCell>
            <TableCell className="text-sm text-muted-foreground">{formatDate(entry.data)}</TableCell>
            <TableCell className="text-sm font-medium text-destructive">Não recebido</TableCell>
          </TableRow>)}
        </TableBody></Table></div>
      </Panel>}
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
type MatReceipt = { id: string; receipt_number: string; sent_at: string; material_type: string; items: { id: string; material_name: string; quantity: number; unit_measure: string }[] };

function MaterialReceipts({ unitId }: { unitId: string | null }) {
  const qc = useQueryClient();
  const { data = [] } = useQuery({
    queryKey: ["pending-material-receipts", unitId],
    enabled: Boolean(unitId),
    queryFn: async (): Promise<MatReceipt[]> => {
      const { data: rows, error } = await (supabase as any).from("expediente_receipts").select("*")
        .eq("destination_unit_id", unitId).eq("status", "pending").order("sent_at", { ascending: false });
      if (error) throw error;
      if (!rows?.length) return [];
      const { data: items, error: e2 } = await (supabase as any).from("expediente_receipt_items").select("*").in("receipt_id", rows.map((r: any) => r.id));
      if (e2) throw e2;
      return rows.map((r: any) => ({ ...r, items: (items ?? []).filter((i: any) => i.receipt_id === r.id) }));
    },
  });
  const confirm = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).rpc("confirm_expediente_receipt", { _receipt_id: id });
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Recebimento de materiais confirmado.");
      await qc.invalidateQueries({ queryKey: ["pending-material-receipts"] });
      await qc.invalidateQueries({ queryKey: ["expediente-receipts"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Não foi possível confirmar."),
  });
  return (
    <Panel title={data.length + " Recibo(s) de materiais pendente(s)"} description="Materiais de expediente e outros materiais. A confirmação não altera o estoque." bodyClassName="p-0">
      {data.length === 0 ? <div className="p-4"><EmptyState title="Nenhum recibo de materiais pendente" description="Quando o CEO registrar um envio de materiais para sua unidade, ele aparecerá aqui." /></div>
      : <div className="space-y-4 p-4">{data.map((r) => (
        <div key={r.id} className="rounded-lg border p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-semibold">Recibo nº {r.receipt_number}</p>
              <p className="text-xs text-muted-foreground">{r.material_type === "outros" ? "Outros materiais" : "Materiais de expediente"} · Enviado em {formatDate(r.sent_at)} · {r.items.length} item(ns)</p>
            </div>
            <Button size="sm" onClick={() => confirm.mutate(r.id)} disabled={confirm.isPending}><CheckCircle2 />{confirm.isPending ? "Confirmando..." : "Recebi"}</Button>
          </div>
          <div className="overflow-x-auto"><Table className="min-w-[520px]"><TableHeader><TableRow>
            <TableHead>Material</TableHead><TableHead className="text-right">Quantidade</TableHead><TableHead>Unidade</TableHead>
          </TableRow></TableHeader><TableBody>
            {r.items.map((i) => <TableRow key={i.id}><TableCell className="font-semibold">{i.material_name}</TableCell>
              <TableCell className="text-right font-bold tabular-nums">{formatQty(i.quantity)}</TableCell><TableCell>{i.unit_measure}</TableCell></TableRow>)}
          </TableBody></Table></div>
        </div>))}</div>}
    </Panel>
  );
}
