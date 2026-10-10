import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileDown, Plus, Send, Trash2, CheckCircle2, Loader2 } from "lucide-react";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useUnit } from "@/hooks/useUnit";
import { supabase } from "@/integrations/supabase/client";
import { unitsOptions } from "@/lib/queries";
import { todayISO, formatDate, formatQty } from "@/lib/format";
import { PageHeader, Panel, EmptyState, Field } from "@/components/ui-kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/expediente")({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
    const [{ data: admin }, { data: responsible }, { data: dispatcher }] = await Promise.all([
      supabase.rpc("has_role", { _user_id: data.user.id, _role: "admin" }),
      supabase.rpc("has_role", { _user_id: data.user.id, _role: "responsavel" }),
      (supabase as any).rpc("is_expediente_dispatcher"),
    ]);
    if (admin !== true && responsible !== true && dispatcher !== true) throw redirect({ to: "/dashboard" });
  },
  head: () => ({
    meta: [
      { title: "Materiais de Expediente — Controle de Estoque" },
      { name: "description", content: "Registre envios, confirme recebimentos e consulte relatórios de materiais de expediente." },
    ],
  }),
  component: ExpedientePage,
});

type ExpedienteItem = { name: string; quantity: string; unit: string };
type Receipt = {
  id: string;
  receipt_number: string;
  destination_unit_id: string;
  sent_by: string;
  sent_by_name: string;
  sent_at: string;
  note: string | null;
  status: "pending" | "confirmed";
  confirmed_by: string | null;
  confirmed_by_name: string | null;
  confirmed_at: string | null;
  created_at: string;
};
type ReceiptItem = { id: string; receipt_id: string; material_name: string; quantity: number; unit_measure: string };
type ReceiptWithItems = Receipt & { items: ReceiptItem[]; unitName: string };

function ExpedientePage() {
  const { isAdmin, role, profile } = useAuth();
  const { unit, unitId } = useUnit();
  const queryClient = useQueryClient();
  const [destinationId, setDestinationId] = useState("");
  const [sentAt, setSentAt] = useState(todayISO());
  const [note, setNote] = useState("");
  const [items, setItems] = useState<ExpedienteItem[]>([{ name: "", quantity: "1", unit: "unidade" }]);
  const [filterUnit, setFilterUnit] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [reportLoading, setReportLoading] = useState(false);

  const { data: dispatcher = false } = useQuery({
    queryKey: ["expediente-dispatcher"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("is_expediente_dispatcher");
      if (error) throw error;
      return data === true;
    },
  });
  const canDispatch = isAdmin || dispatcher;
  const canConfirm = role === "responsavel" && !isAdmin && !dispatcher && Boolean(profile?.unit_id);
  const { data: units = [] } = useQuery(unitsOptions(false));
  const { data: receipts = [], isPending, isError, error } = useQuery({
    queryKey: ["expediente-receipts", units.map((u) => u.id).join("|")],
    queryFn: async () => {
      const { data: headers, error: headerError } = await (supabase as any)
        .from("expediente_receipts").select("*").order("sent_at", { ascending: false }).order("created_at", { ascending: false });
      if (headerError) throw headerError;
      const rows = (headers ?? []) as Receipt[];
      if (!rows.length) return [] as ReceiptWithItems[];
      const { data: detailRows, error: detailError } = await (supabase as any)
        .from("expediente_receipt_items").select("*").in("receipt_id", rows.map((r) => r.id));
      if (detailError) throw detailError;
      const byReceipt = new Map<string, ReceiptItem[]>();
      ((detailRows ?? []) as ReceiptItem[]).forEach((item) => {
        const current = byReceipt.get(item.receipt_id) ?? [];
        current.push(item);
        byReceipt.set(item.receipt_id, current);
      });
      const unitNames = new Map(units.map((u) => [u.id, u.nome]));
      return rows.map((r) => ({
        ...r,
        items: byReceipt.get(r.id) ?? [],
        unitName: unitNames.get(r.destination_unit_id) ?? (r.destination_unit_id === unitId ? unit?.nome ?? "Minha unidade" : "Unidade"),
      })) as ReceiptWithItems[];
    },
  });

  const visibleReceipts = useMemo(() => receipts.filter((r) => {
    if (canDispatch) return filterUnit === "all" || r.destination_unit_id === filterUnit;
    return r.destination_unit_id === (profile?.unit_id ?? unitId);
  }), [receipts, canDispatch, filterUnit, profile?.unit_id, unitId]);

  const launchMutation = useMutation({
    mutationFn: async () => {
      if (!destinationId) throw new Error("Selecione a unidade que receberá os materiais.");
      if (!sentAt || sentAt > todayISO()) throw new Error("Informe uma data de envio válida.");
      const validItems = items.map((i) => ({
        name: i.name.trim(),
        quantity: Number(i.quantity.replace(",", ".")),
        unit: i.unit.trim(),
      }));
      if (!validItems.length || validItems.some((i) => !i.name || !i.unit || !Number.isFinite(i.quantity) || i.quantity <= 0)) {
        throw new Error("Preencha o nome, a quantidade e a unidade de cada material.");
      }
      const { data, error } = await (supabase as any).rpc("create_expediente_receipt", {
        _destination_unit_id: destinationId,
        _sent_at: sentAt,
        _items: validItems,
        _note: note.trim() || null,
      });
      if (error) throw error;
      return String(data);
    },
    onSuccess: async (number) => {
      toast.success(`Recibo de expediente nº ${number} criado e aguardando confirmação da unidade.`);
      setItems([{ name: "", quantity: "1", unit: "unidade" }]);
      setDestinationId("");
      setNote("");
      setSentAt(todayISO());
      await queryClient.invalidateQueries({ queryKey: ["expediente-receipts"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Não foi possível registrar o envio."),
  });

  const confirmMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).rpc("confirm_expediente_receipt", { _receipt_id: id });
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Recebimento de materiais de expediente confirmado.");
      await queryClient.invalidateQueries({ queryKey: ["expediente-receipts"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Não foi possível confirmar o recebimento."),
  });

  const printReceipt = (receipt: ReceiptWithItems) => {
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    doc.setFillColor(139, 107, 69);
    doc.rect(0, 0, 210, 28, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(15);
    doc.text("SEMADS — RECIBO DE MATERIAIS DE EXPEDIENTE", 12, 12);
    doc.setFontSize(10);
    doc.text(`Recibo nº ${receipt.receipt_number}`, 12, 21);
    doc.setTextColor(40, 40, 40);
    doc.setFontSize(10);
    doc.text(`Unidade destinatária: ${receipt.unitName}`, 12, 38);
    doc.text(`Data do envio: ${formatDate(receipt.sent_at)}`, 12, 45);
    doc.text(`Enviado por: ${receipt.sent_by_name}`, 12, 52);
    doc.text(`Situação: ${receipt.status === "confirmed" ? "Recebimento confirmado" : "Pendente de confirmação"}`, 12, 59);
    if (receipt.confirmed_at) {
      doc.text(`Recebido por: ${receipt.confirmed_by_name ?? "—"}`, 12, 66);
      doc.text(`Data do recebimento: ${formatDate(receipt.confirmed_at)}`, 12, 73);
    }
    autoTable(doc, {
      startY: receipt.confirmed_at ? 80 : 66,
      head: [["Material", "Quantidade", "Unidade"]],
      body: receipt.items.map((item) => [item.material_name, formatQty(item.quantity), item.unit_measure]),
      theme: "grid",
      headStyles: { fillColor: [139, 107, 69], textColor: [255, 255, 255] },
      styles: { fontSize: 9, cellPadding: 3 },
      margin: { left: 12, right: 12 },
    });
    if (receipt.note) {
      const y = ((doc as any).lastAutoTable?.finalY ?? 80) + 8;
      doc.setFontSize(9);
      doc.text(`Observação: ${receipt.note}`, 12, y, { maxWidth: 185 });
    }
    doc.save(`recibo-expediente-${receipt.receipt_number}.pdf`);
  };

  const generateReport = async () => {
    if (!from || !to) {
      toast.error("Selecione a data inicial e a data final do relatório.");
      return;
    }
    if (from > to) {
      toast.error("A data inicial não pode ser maior que a data final.");
      return;
    }
    setReportLoading(true);
    try {
      const confirmed = visibleReceipts.filter((r) => {
        if (r.status !== "confirmed" || !r.confirmed_at) return false;
        const date = r.confirmed_at.slice(0, 10);
        return date >= from && date <= to;
      });
      if (!confirmed.length) throw new Error("Não há recebimentos confirmados nesse período para os filtros selecionados.");
      const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
      doc.setFillColor(139, 107, 69);
      doc.rect(0, 0, 297, 25, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(15);
      doc.text("SEMADS — RELATÓRIO DE MATERIAIS DE EXPEDIENTE", 14, 11);
      doc.setFontSize(9);
      doc.text(`Recebimentos confirmados de ${formatDate(from)} até ${formatDate(to)}`, 14, 19);
      doc.setTextColor(40, 40, 40);
      const body: Array<Array<string>> = [];
      confirmed.forEach((r) => r.items.forEach((item) => body.push([
        r.receipt_number,
        r.unitName,
        item.material_name,
        `${formatQty(item.quantity)} ${item.unit_measure}`,
        formatDate(r.sent_at),
        formatDate(r.confirmed_at),
      ])));
      autoTable(doc, {
        startY: 31,
        head: [["Recibo", "Unidade", "Material", "Quantidade", "Data do envio", "Data do recebimento"]],
        body,
        theme: "grid",
        headStyles: { fillColor: [139, 107, 69], textColor: [255, 255, 255] },
        styles: { fontSize: 8, cellPadding: 2.5, overflow: "linebreak" },
        margin: { left: 12, right: 12 },
      });
      const pages = doc.getNumberOfPages();
      for (let page = 1; page <= pages; page++) {
        doc.setPage(page);
        doc.setFontSize(8);
        doc.setTextColor(100, 100, 100);
        doc.text(`Gerado em ${formatDate(todayISO())} · Página ${page} de ${pages}`, 285, 203, { align: "right" });
      }
      doc.save(`relatorio-materiais-expediente-${from}-a-${to}.pdf`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível gerar o relatório.");
    } finally {
      setReportLoading(false);
    }
  };

  return (
    <>
      <PageHeader title="Materiais de Expediente" description="Registro dos materiais enviados, confirmação de recebimento e consulta dos recibos por unidade. Este módulo não movimenta o estoque." />

      {canDispatch && (
        <Panel title="Registrar envio de materiais" description="O CEO e o Centro de Distribuição podem registrar os envios. Cada lançamento gera um recibo independente do estoque.">
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); launchMutation.mutate(); }}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Unidade destinatária" htmlFor="exp-destino" required>
                <select id="exp-destino" required value={destinationId} onChange={(e) => setDestinationId(e.target.value)} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                  <option value="">Selecione a unidade...</option>
                  {units.filter((u) => u.ativo && !/gabinete semads|centro de distribui/i.test(u.nome)).map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
                </select>
              </Field>
              <Field label="Data do envio" htmlFor="exp-data" required>
                <Input id="exp-data" type="date" required max={todayISO()} value={sentAt} onChange={(e) => setSentAt(e.target.value)} />
              </Field>
            </div>

            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">Materiais enviados</h3>
                <Button type="button" size="sm" variant="outline" onClick={() => setItems((old) => [...old, { name: "", quantity: "1", unit: "unidade" }])}><Plus className="size-4" /> Adicionar material</Button>
              </div>
              {items.map((item, index) => (
                <div key={index} className="grid gap-3 rounded-lg border p-3 sm:grid-cols-[minmax(0,1fr)_110px_145px_40px]">
                  <Field label="Nome do material" htmlFor={`exp-name-${index}`} required>
                    <Input id={`exp-name-${index}`} required value={item.name} onChange={(e) => setItems((old) => old.map((v, i) => i === index ? { ...v, name: e.target.value } : v))} placeholder="Ex.: Papel A4, caneta, pasta..." />
                  </Field>
                  <Field label="Quantidade" htmlFor={`exp-qty-${index}`} required>
                    <Input id={`exp-qty-${index}`} required inputMode="decimal" value={item.quantity} onChange={(e) => setItems((old) => old.map((v, i) => i === index ? { ...v, quantity: e.target.value } : v))} />
                  </Field>
                  <Field label="Unidade" htmlFor={`exp-unit-${index}`} required>
                    <select id={`exp-unit-${index}`} value={item.unit} onChange={(e) => setItems((old) => old.map((v, i) => i === index ? { ...v, unit: e.target.value } : v))} className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm">
                      {["unidade", "pacote", "caixa", "resma", "kit", "rolo", "fardo", "cartucho", "par", "outro"].map((u) => <option key={u} value={u}>{u}</option>)}
                    </select>
                  </Field>
                  <div className="flex items-end justify-end">
                    <Button type="button" size="icon" variant="ghost" disabled={items.length === 1} title="Remover material" onClick={() => setItems((old) => old.filter((_, i) => i !== index))}><Trash2 className="size-4" /></Button>
                  </div>
                </div>
              ))}
            </div>
            <Field label="Observação" htmlFor="exp-observacao">
              <Textarea id="exp-observacao" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Observação opcional sobre a entrega" />
            </Field>
            <Button type="submit" disabled={launchMutation.isPending || !destinationId}>
              {launchMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              {launchMutation.isPending ? "Registrando envio..." : "Registrar envio e gerar recibo"}
            </Button>
          </form>
        </Panel>
      )}

      {canConfirm && (
        <Panel title="Recebimentos de expediente pendentes" description="A unidade só confirma os materiais que realmente recebeu. Essa confirmação não altera o estoque.">
          {visibleReceipts.filter((r) => r.status === "pending").length === 0 ? (
            <EmptyState title="Nenhum recibo pendente" description="Quando o CEO ou o Centro de Distribuição registrar um envio para sua unidade, ele aparecerá aqui." />
          ) : (
            <div className="space-y-3">
              {visibleReceipts.filter((r) => r.status === "pending").map((r) => (
                <div key={r.id} className="rounded-lg border p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">Recibo de Expediente nº {r.receipt_number}</p>
                      <p className="text-xs text-muted-foreground">{r.unitName} · Enviado em {formatDate(r.sent_at)} · Por {r.sent_by_name}</p>
                    </div>
                    <Button size="sm" disabled={confirmMutation.isPending} onClick={() => confirmMutation.mutate(r.id)}><CheckCircle2 className="size-4" /> Confirmar recebimento</Button>
                  </div>
                  <ReceiptItemsTable items={r.items} />
                  {r.note && <p className="mt-2 text-sm text-muted-foreground">Observação: {r.note}</p>}
                </div>
              ))}
            </div>
          )}
        </Panel>
      )}

      <Panel title="Consultar recibos de materiais de expediente" description="Os recibos ficam registrados após a confirmação para consulta futura." actions={
        canDispatch ? (
          <select aria-label="Filtrar por unidade" value={filterUnit} onChange={(e) => setFilterUnit(e.target.value)} className="h-9 max-w-[220px] rounded-md border border-input bg-background px-2 text-sm">
            <option value="all">Todas as unidades</option>
            {units.filter((u) => !/gabinete semads|centro de distribui/i.test(u.nome)).map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
          </select>
        ) : undefined
      } bodyClassName="p-0">
        {isPending ? <div className="p-5 text-sm text-muted-foreground">Carregando recibos...</div>
          : isError ? <div className="p-5 text-sm text-destructive">{error instanceof Error ? error.message : "Erro ao consultar recibos."}</div>
          : visibleReceipts.length === 0 ? <div className="p-4"><EmptyState title="Nenhum recibo encontrado" description="Os recibos registrados para esta unidade aparecerão aqui." /></div>
          : <div className="overflow-x-auto"><Table className="min-w-[1050px]"><TableHeader><TableRow className="bg-muted/50">
            <TableHead>Recibo</TableHead><TableHead>Unidade</TableHead><TableHead>Data do envio</TableHead><TableHead>Materiais</TableHead><TableHead>Data do recebimento</TableHead><TableHead>Situação</TableHead><TableHead>Ação</TableHead>
          </TableRow></TableHeader><TableBody>
            {visibleReceipts.map((r) => <TableRow key={r.id}>
              <TableCell className="font-bold">Nº {r.receipt_number}</TableCell>
              <TableCell>{r.unitName}</TableCell>
              <TableCell>{formatDate(r.sent_at)}</TableCell>
              <TableCell className="max-w-[360px] whitespace-normal">{r.items.map((item) => `${item.material_name}: ${formatQty(item.quantity)} ${item.unit_measure}`).join("; ") || "—"}</TableCell>
              <TableCell>{r.confirmed_at ? formatDate(r.confirmed_at) : "—"}</TableCell>
              <TableCell><span className={r.status === "confirmed" ? "rounded-full bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-800" : "rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-800"}>{r.status === "confirmed" ? "Recebido" : "Pendente"}</span></TableCell><TableCell><Button size="sm" variant="outline" onClick={() => printReceipt(r)}><FileDown className="size-4" /> PDF</Button></TableCell>
            </TableRow>)}
          </TableBody></Table></div>}
      </Panel>

      <Panel title="Relatório de recebimento por período" description="O PDF inclui somente recibos confirmados cuja data de recebimento esteja no período selecionado.">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="grid w-full gap-3 sm:grid-cols-2">
            <Field label="Data inicial do recebimento" htmlFor="exp-report-from" required>
              <Input id="exp-report-from" type="date" required value={from} onChange={(e) => setFrom(e.target.value)} />
            </Field>
            <Field label="Data final do recebimento" htmlFor="exp-report-to" required>
              <Input id="exp-report-to" type="date" required min={from || undefined} value={to} onChange={(e) => setTo(e.target.value)} />
            </Field>
          </div>
          <Button onClick={generateReport} disabled={reportLoading || !from || !to}><FileDown className="size-4" />{reportLoading ? "Gerando PDF..." : "Gerar relatório PDF"}</Button>
        </div>
      </Panel>
    </>
  );
}

function ReceiptItemsTable({ items }: { items: ReceiptItem[] }) {
  return (
    <div className="mt-3 overflow-x-auto">
      <Table className="min-w-[450px]"><TableHeader><TableRow><TableHead>Material</TableHead><TableHead className="text-right">Quantidade</TableHead><TableHead>Unidade</TableHead></TableRow></TableHeader>
        <TableBody>{items.map((item) => <TableRow key={item.id}><TableCell>{item.material_name}</TableCell><TableCell className="text-right font-semibold">{formatQty(item.quantity)}</TableCell><TableCell>{item.unit_measure}</TableCell></TableRow>)}</TableBody>
      </Table>
    </div>
  );
}
