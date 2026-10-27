import { Fragment, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileDown, Eye, Printer, Plus, Send, Trash2, CheckCircle2, Loader2, ChevronsUpDown } from "lucide-react";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useUnit } from "@/hooks/useUnit";
import { supabase } from "@/integrations/supabase/client";
import { unitsOptions, receiptIdFromObservation } from "@/lib/queries";
import { todayISO, formatDate, formatQty } from "@/lib/format";
import { PageHeader, Panel, EmptyState, Field } from "@/components/ui-kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";

type ExpedienteItem = { name: string; quantity: string; unit: string };
type Receipt = {
  id: string;
  receipt_number: string;
  destination_unit_id: string;
  sent_by: string;
  sent_by_name: string;
  sent_at: string;
  note: string | null;
  material_type: "expediente" | "outros";
  status: "pending" | "confirmed";
  confirmed_by: string | null;
  confirmed_by_name: string | null;
  confirmed_at: string | null;
  created_at: string;
};
type ReceiptItem = { id: string; receipt_id: string; material_name: string; quantity: number; unit_measure: string };
type ReceiptWithItems = Receipt & { items: ReceiptItem[]; unitName: string };

export type ExpedienteView = "expediente" | "outros" | "recibos" | "relatorios";

export function ExpedientePage({ view }: { view: ExpedienteView }) {
  const { isAdmin, role, profile } = useAuth();
  const { unit, unitId } = useUnit();
  const queryClient = useQueryClient();
  const [destinationId, setDestinationId] = useState("");
  const [sentAt, setSentAt] = useState(todayISO());
  const [note, setNote] = useState("");
  const materialType = view === "outros" ? "outros" : "expediente";
  const isLaunchView = view === "expediente" || view === "outros";
  const [items, setItems] = useState<ExpedienteItem[]>([{ name: "", quantity: "1", unit: "unidade" }]);
  const [filterUnit, setFilterUnit] = useState("all");
  const [reportUnit, setReportUnit] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [reportLoading, setReportLoading] = useState(false);
  const [reportItems, setReportItems] = useState<string[]>([]);
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
  const { data: itemOptions = [] } = useQuery({
    queryKey: ["expediente-report-items"],
    queryFn: async () => {
      const { data: products, error } = await supabase.from("products").select("nome").eq("ativo", true).order("nome");
      if (error) throw error;
      const { data: mats, error: matsError } = await (supabase as any)
        .from("expediente_receipt_items").select("material_name");
      if (matsError) throw matsError;
      const names = new Set<string>(((products ?? []) as { nome: string }[]).map((p) => p.nome));
      ((mats ?? []) as { material_name: string }[]).forEach((m) => { if (m.material_name) names.add(m.material_name); });
      return Array.from(names).sort((a, b) => a.localeCompare(b, "pt-BR"));
    },
  });
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
      const unitNames = new Map<string, string>(units.map((u) => [u.id, u.nome] as const));
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

  const receiptsByMonth = useMemo(() => {
    const groups = new Map<string, ReceiptWithItems[]>();
    visibleReceipts.forEach((receipt) => {
      const monthKey = receipt.sent_at.slice(0, 7);
      const current = groups.get(monthKey) ?? [];
      current.push(receipt);
      groups.set(monthKey, current);
    });
    return Array.from(groups.entries()).map(([monthKey, monthReceipts]) => {
      const [year, month] = monthKey.split("-").map(Number);
      const label = new Date(year ?? 1970, (month ?? 1) - 1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
      return { monthKey, monthLabel: label.charAt(0).toUpperCase() + label.slice(1), receipts: monthReceipts };
    });
  }, [visibleReceipts]);
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
        _material_type: materialType,
      });
      if (error) throw error;
      return String(data);
    },
    onSuccess: async (number) => {
      toast.success(`Recibo de ${materialType === "expediente" ? "materiais de expediente" : "outros materiais"} nº ${number} criado e aguardando confirmação da unidade.`);
      setItems([{ name: "", quantity: "1", unit: "unidade" }]);
      setDestinationId("");
      setNote("");
      setSentAt(todayISO());
      await queryClient.invalidateQueries({ queryKey: ["expediente-receipts"] });
    },
    onError: (e: any) => toast.error(e?.message || "Não foi possível registrar o envio."),
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

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).rpc("delete_expediente_receipt", { _receipt_id: id });
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Recibo de expediente excluído.");
      await queryClient.invalidateQueries({ queryKey: ["expediente-receipts"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Não foi possível excluir o recibo."),
  });

  const printReceipt = (receipt: ReceiptWithItems, mode: "view" | "print" | "pdf" = "pdf") => {
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    doc.setFillColor(139, 107, 69);
    doc.rect(0, 0, 210, 28, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(15);
    doc.text(`SEMADS — RECIBO DE ${receipt.material_type === "outros" ? "OUTROS MATERIAIS" : "MATERIAIS DE EXPEDIENTE"}`, 12, 12);
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
    if (mode === "pdf") {
      doc.save(`recibo-expediente-${receipt.receipt_number}.pdf`);
      return;
    }
    if (mode === "print") doc.autoPrint();
    window.open(doc.output("bloburl"), "_blank");
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
      const ownUnit = profile?.unit_id ?? unitId;
      const unitOk = (id: string) => (canDispatch ? reportUnit === "all" || id === reportUnit : id === ownUnit);
      const itemOk = (name: string) => reportItems.length === 0 || reportItems.includes(name);
      const dayOf = (value: string) => {
        const d = new Date(value);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      };
      const confirmed = receipts.filter((r) => {
        if (!unitOk(r.destination_unit_id)) return false;
        if (r.status !== "confirmed" || !r.confirmed_at) return false;
        const date = dayOf(r.confirmed_at);
        return date >= from && date <= to;
      });
      type ReportLine = { numero: string; unitId: string; unitName: string; item: string; qty: string; sentAt: string; confirmedAt: string; estoque: string | null };
      const lines: ReportLine[] = [];
      confirmed.forEach((r) => r.items.forEach((item) => {
        if (!itemOk(item.material_name)) return;
        lines.push({
          numero: r.receipt_number, unitId: r.destination_unit_id, unitName: r.unitName, item: item.material_name,
          qty: `${formatQty(item.quantity)} ${item.unit_measure}`, sentAt: r.sent_at, confirmedAt: r.confirmed_at!,
          estoque: "—",
        });
      }));
      const stockPairs: Array<{ unitId: string; productId: string }> = [];
      {
        const { data: recs, error: recErr } = await (supabase as any)
          .from("stock_receipts").select("movement_id, confirmed_at")
          .gte("confirmed_at", `${from}T00:00:00`).lte("confirmed_at", `${to}T23:59:59.999`);
        if (recErr) throw recErr;
        const recRows = (recs ?? []) as Array<{ movement_id: string; confirmed_at: string }>;
        for (let k = 0; k < recRows.length; k += 200) {
          const chunk = recRows.slice(k, k + 200);
          const { data: movs, error: movErr } = await supabase
            .from("stock_movements").select("id, unit_id, product_id, data, quantidade, observacao, products(nome, unidade_medida), units(nome)")
            .in("id", chunk.map((c) => c.movement_id));
          if (movErr) throw movErr;
          const confMap = new Map(chunk.map((c) => [c.movement_id, c.confirmed_at]));
          ((movs ?? []) as any[]).forEach((m) => {
            const confirmedAt = confMap.get(m.id);
            if (!confirmedAt || !unitOk(m.unit_id)) return;
            const date = dayOf(confirmedAt);
            if (date < from || date > to) return;
            const itemName = m.products?.nome ?? "Produto";
            if (!itemOk(itemName)) return;
            lines.push({
              numero: receiptIdFromObservation(m.observacao) ?? "Avulso", unitId: m.unit_id, unitName: m.units?.nome ?? "Unidade",
              item: itemName, qty: `${formatQty(Number(m.quantidade))} ${m.products?.unidade_medida ?? ""}`.trim(),
              sentAt: m.data, confirmedAt, estoque: null,
            });
            if (m.product_id) stockPairs.push({ unitId: m.unit_id, productId: m.product_id });
          });
        }
      }
      if (!lines.length) throw new Error("Não há recebimentos confirmados nesse período para a unidade selecionada.");
      if (stockPairs.length) {
        const unitIds = [...new Set(stockPairs.map((p) => p.unitId))];
        const productIds = [...new Set(stockPairs.map((p) => p.productId))];
        const { data: stockRows, error: stockErr } = await supabase
          .from("stock").select("unit_id, product_id, quantidade, products(unidade_medida)")
          .in("unit_id", unitIds).in("product_id", productIds);
        if (stockErr) throw stockErr;
        const stockMap = new Map<string, string>();
        ((stockRows ?? []) as any[]).forEach((s) => {
          stockMap.set(`${s.unit_id}::${s.product_id}`, `${formatQty(Number(s.quantidade))} ${s.products?.unidade_medida ?? ""}`.trim());
        });
        // Preenche o estoque atual nas linhas de estoque, na ordem em que foram incluídas.
        let cursor = 0;
        lines.forEach((l) => {
          if (l.estoque !== null) return;
          const pair = stockPairs[cursor];
          cursor += 1;
          l.estoque = pair ? stockMap.get(`${pair.unitId}::${pair.productId}`) ?? "0" : "—";
        });
      }
      lines.sort((a, b) => a.confirmedAt.localeCompare(b.confirmedAt) || a.numero.localeCompare(b.numero));
      const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
      const brown: [number, number, number] = [125, 47, 25];
      const lightBrown: [number, number, number] = [246, 239, 234];
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const selectedUnitName = reportUnit === "all" ? "Todas as unidades" : (units.find((u) => u.id === reportUnit)?.nome ?? "Unidade selecionada");
      // Tenta inserir a logo oficial; se o arquivo não carregar, o relatório continua sendo gerado.
      let logoData: string | null = null;
      try {
        logoData = await new Promise<string | null>((resolve) => {
          const image = new Image();
          image.onload = () => {
            try {
              const canvas = document.createElement("canvas");
              canvas.width = image.naturalWidth;
              canvas.height = image.naturalHeight;
              const context = canvas.getContext("2d");
              if (!context) return resolve(null);
              context.drawImage(image, 0, 0);
              resolve(canvas.toDataURL("image/jpeg", 0.92));
            } catch { resolve(null); }
          };
          image.onerror = () => resolve(null);
          image.src = "/IMG-20260917-WA0055.jpg";
        });
      } catch { logoData = null; }

      // Cabeçalho institucional em marrom SEMADS.
      doc.setFillColor(...brown);
      doc.rect(0, 0, pageWidth, 31, "F");
      if (logoData) {
        try { doc.addImage(logoData, "JPEG", 12, 5, 21, 21, undefined, "FAST"); } catch { /* logo opcional */ }
      }
      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      doc.text("SEMADS", logoData ? 38 : 14, 12);
      doc.setFontSize(11);
      doc.text("RELATÓRIO DE MATERIAIS ENTREGUES", logoData ? 38 : 14, 19);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.text(`Período de recebimento: ${formatDate(from)} a ${formatDate(to)}`, logoData ? 38 : 14, 25);

      // Faixa com a unidade destinatária do relatório.
      doc.setFillColor(...lightBrown);
      doc.roundedRect(12, 36, pageWidth - 24, 13, 2, 2, "F");
      doc.setTextColor(...brown);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.text("UNIDADE", 16, 41.5);
      doc.setTextColor(45, 45, 45);
      doc.setFontSize(10.5);
      doc.text(doc.splitTextToSize(selectedUnitName, pageWidth - 40)[0] ?? selectedUnitName, 16, 46.8);

      const body: Array<Array<string>> = [];
      lines.forEach((l) => body.push([l.numero, l.unitName, l.item, l.qty, formatDate(l.sentAt), l.estoque ?? "—"]));
      autoTable(doc, {
        startY: 55,

        head: [["Nº RECIBO", "UNIDADE DESTINO", "ITEM ENTREGUE", "QUANTIDADE", "DATA DO ENVIO", "ESTOQUE ATUAL"]],
        body,
        theme: "grid",
        showHead: "everyPage",
        headStyles: { fillColor: brown, textColor: [255, 255, 255], fontStyle: "bold", fontSize: 8, cellPadding: 3 },
        styles: { font: "helvetica", fontSize: 8, cellPadding: 3, overflow: "linebreak", textColor: [45, 45, 45], lineColor: [225, 216, 210], lineWidth: 0.15, valign: "middle" },
        alternateRowStyles: { fillColor: [250, 248, 246] },
        columnStyles: { 0: { cellWidth: 28 }, 1: { cellWidth: 46 }, 2: { cellWidth: 60 }, 3: { cellWidth: 30 }, 4: { cellWidth: 32 }, 5: { cellWidth: "auto" } },
        margin: { top: 12, left: 12, right: 12, bottom: 15 },
        didDrawPage: () => {
          if (doc.getCurrentPageInfo().pageNumber > 1) {
            doc.setFillColor(...brown);
            doc.rect(0, 0, pageWidth, 7, "F");
          }
        },
      });
      const pages = doc.getNumberOfPages();
      for (let page = 1; page <= pages; page++) {
        doc.setPage(page);
        doc.setDrawColor(220, 210, 203);
        doc.line(12, pageHeight - 11, pageWidth - 12, pageHeight - 11);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7.5);
        doc.setTextColor(100, 92, 88);
        doc.text("SEMADS · Registro de Envios · Documento para arquivo e consulta", 12, pageHeight - 6);
        doc.text(`Emitido em ${formatDate(todayISO())} · Página ${page} de ${pages}`, pageWidth - 12, pageHeight - 6, { align: "right" });
      }
      doc.save(`relatorio-registro-envios-${from}-a-${to}.pdf`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível gerar o relatório.");
    } finally {
      setReportLoading(false);
    }
  };

  return (
    <>
      <PageHeader title={{ expediente: "Materiais de expediente", outros: "Outros materiais", recibos: "Registro de recibos", relatorios: "Relatórios de envios em PDF" }[view]} />

      {isLaunchView && canDispatch && (
        <div id="expediente-lancamento" className="scroll-mt-20">
        <Panel title={materialType === "outros" ? "Registrar envio de outros materiais" : "Registrar envio de materiais de expediente"}>
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
                <h3 className="text-sm font-semibold">{materialType === "expediente" ? "Materiais de expediente enviados" : "Outros materiais enviados"}</h3>
                <Button type="button" size="sm" variant="outline" onClick={() => setItems((old) => [...old, { name: "", quantity: "1", unit: "unidade" }])}><Plus className="size-4" /> Adicionar material</Button>
              </div>
              {items.map((item, index) => (
                <div key={index} className="grid gap-3 rounded-lg border p-3 sm:grid-cols-[minmax(0,1fr)_110px_145px_40px]">
                  <Field label="Nome do material" htmlFor={`exp-name-${index}`} required>
                    <Input id={`exp-name-${index}`} required value={item.name} onChange={(e) => setItems((old) => old.map((v, i) => i === index ? { ...v, name: e.target.value } : v))} placeholder={materialType === "expediente" ? "Ex.: Papel A4, caneta, pasta..." : "Ex.: Vassoura, rodo, copos, panelas, sacos de lixo..."} />
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
        </div>
      )}
      {isLaunchView && !canDispatch && <EmptyState title="Envio restrito ao administrador e ao Centro de Distribuição" />}

      {view === "recibos" && canConfirm && (
        <Panel title="Recebimentos de materiais pendentes" description="A unidade só confirma os materiais que realmente recebeu. Essa confirmação não altera o estoque.">
          {visibleReceipts.filter((r) => r.status === "pending").length === 0 ? (
            <EmptyState title="Nenhum recibo pendente" description="Quando o CEO ou o Centro de Distribuição registrar um envio para sua unidade, ele aparecerá aqui." />
          ) : (
            <div className="space-y-3">
              {visibleReceipts.filter((r) => r.status === "pending").map((r) => (
                <div key={r.id} className="rounded-lg border p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">Recibo de {r.material_type === "outros" ? "Outros Materiais" : "Expediente"} nº {r.receipt_number}</p>
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

      {view === "recibos" && <div id="expediente-recibos" className="scroll-mt-20">
      <Panel title="Consultar recibos de materiais" description="Os recibos ficam registrados após a confirmação para consulta futura." actions={
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
            {receiptsByMonth.map((group) => (
              <Fragment key={group.monthKey}>
                <TableRow className="bg-muted/60 hover:bg-muted/60">
                  <TableCell colSpan={7} className="py-3 font-semibold">{group.monthLabel} <span className="ml-2 text-xs font-normal text-muted-foreground">({group.receipts.length} {group.receipts.length === 1 ? "recibo" : "recibos"})</span></TableCell>
                </TableRow>
                {group.receipts.map((r) => <TableRow key={r.id}>
              <TableCell className="font-bold">Nº {r.receipt_number}</TableCell>
              <TableCell>{r.unitName}</TableCell>
              <TableCell>{formatDate(r.sent_at)}</TableCell>
              <TableCell className="max-w-[360px] whitespace-normal">{r.items.map((item) => `${item.material_name}: ${formatQty(item.quantity)} ${item.unit_measure}`).join("; ") || "—"}</TableCell>
              <TableCell>{r.confirmed_at ? formatDate(r.confirmed_at) : "—"}</TableCell>
              <TableCell><span className={r.status === "confirmed" ? "rounded-full bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-800" : "rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-800"}>{r.status === "confirmed" ? "Recebido" : "Pendente"}</span></TableCell><TableCell><div className="flex flex-wrap items-center gap-2"><Button size="sm" variant="outline" onClick={() => printReceipt(r, "view")}><Eye className="size-4" /> Visualizar</Button><Button size="sm" variant="outline" onClick={() => printReceipt(r, "print")}><Printer className="size-4" /> Imprimir</Button><Button size="sm" variant="outline" onClick={() => printReceipt(r)}><FileDown className="size-4" /> PDF</Button>{isAdmin && <Button size="sm" variant="destructive" disabled={deleteMutation.isPending} onClick={() => { if (window.confirm(`Tem certeza que deseja excluir o recibo de expediente nº ${r.receipt_number}? Essa ação não pode ser desfeita.`)) deleteMutation.mutate(r.id); }}><Trash2 className="size-4" /> Excluir</Button>}</div></TableCell>
            </TableRow>)}
              </Fragment>
            ))}
          </TableBody></Table></div>}
      </Panel>

      </div>}

      {view === "relatorios" && <div id="expediente-relatorio" className="scroll-mt-20">
      <Panel title="Relatório de materiais entregues por período" description="Escolha o período e, se desejar, uma única unidade. Marque os itens para um relatório só deles ou deixe todos desmarcados para incluir estoque, materiais de expediente e outros materiais.">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="grid w-full gap-3 sm:grid-cols-2">
            {canDispatch && <Field label="Unidade do relatório" htmlFor="exp-report-unit">
              <select id="exp-report-unit" value={reportUnit} onChange={(e) => setReportUnit(e.target.value)} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                <option value="all">Todas as unidades</option>
                {units.filter((u) => !/gabinete semads|centro de distribui/i.test(u.nome)).map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
              </select>
            </Field>}
            <Field label="Data inicial do recebimento" htmlFor="exp-report-from" required>
              <Input id="exp-report-from" type="date" required value={from} onChange={(e) => setFrom(e.target.value)} />
            </Field>
            <Field label="Data final do recebimento" htmlFor="exp-report-to" required>
              <Input id="exp-report-to" type="date" required min={from || undefined} value={to} onChange={(e) => setTo(e.target.value)} />
            </Field>
            <Field label="Itens do relatório" hint="Sem marcação, inclui todos os materiais.">
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    id="exp-report-items"
                    type="button"
                    className="flex h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <span className="truncate">
                      {reportItems.length === 0
                        ? "Todos os materiais"
                        : reportItems.length === 1
                          ? reportItems[0]
                          : `${reportItems.length} itens selecionados`}
                    </span>
                    <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-64 p-2" align="start">
                  <div className="max-h-60 overflow-y-auto">
                    {itemOptions.length === 0 ? (
                      <p className="px-2 py-1 text-sm text-muted-foreground">Nenhum item disponível.</p>
                    ) : itemOptions.map((name) => (
                      <label key={name} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-accent">
                        <Checkbox
                          checked={reportItems.includes(name)}
                          onCheckedChange={(checked) => setReportItems((old) => (checked ? [...old, name] : old.filter((n) => n !== name)))}
                        />
                        <span className="truncate">{name}</span>
                      </label>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
            </Field>
          </div>
          <Button onClick={generateReport} disabled={reportLoading || !from || !to}><FileDown className="size-4" />{reportLoading ? "Gerando PDF..." : "Gerar relatório PDF"}</Button>
        </div>
      </Panel>
      </div>}
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
