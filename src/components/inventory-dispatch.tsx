import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { unitsOptions, productsOptions, stockOptions } from "@/lib/queries";
import { emptyDispatchItem, prepareDispatchItems, type DispatchItem } from "@/lib/dispatch";
import { todayISO } from "@/lib/format";
import { Field, PageHeader } from "@/components/ui-kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";

export function InventoryDispatch() {
  const qc = useQueryClient();
  const { data: units = [] } = useQuery(unitsOptions());
  const { data: products = [] } = useQuery(productsOptions());
  const centers = units.filter((u) => /gabinete semads|centro de distribui/i.test(u.nome));
  const [centerId, setCenterId] = useState("");
  const sourceId = centerId || centers[0]?.id || "";
  const { data: stock = [] } = useQuery(stockOptions(sourceId));
  const [destination, setDestination] = useState("");
  const [date, setDate] = useState(todayISO());
  const [items, setItems] = useState<DispatchItem[]>([emptyDispatchItem()]);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [receipt, setReceipt] = useState("");
  const update = (index: number, patch: Partial<DispatchItem>) => setItems((old) => old.map((item, i) => i === index ? { ...item, ...patch } : item));
  const selectClass = "h-9 w-full min-w-0 rounded-md border border-input bg-background px-2 text-sm";
  return <>
    <PageHeader title="Distribuir materiais" />
    <form className="space-y-6" onSubmit={async (e) => {
      e.preventDefault(); setSaving(true); setReceipt("");
      try {
        const { data, error } = await supabase.rpc("create_inventory_dispatch", { _destination_unit_id: destination, _sent_at: date, _items: prepareDispatchItems(items), ...(note ? { _note: note } : {}) });
        if (error) throw error;
        setReceipt(String(data)); setItems([emptyDispatchItem()]); setNote("");
        toast.success(`Recibo ${data} criado. Aguardando confirmação da unidade.`);
        await Promise.all([qc.invalidateQueries({ queryKey: ["expediente-receipts"] }), qc.invalidateQueries({ queryKey: ["products"] })]);
      } catch (error) { toast.error(error instanceof Error ? error.message : (error as { message?: string })?.message || "Não foi possível criar o envio."); }
      finally { setSaving(false); }
    }}>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Unidade destinatária" htmlFor="dispatch-destination"><select id="dispatch-destination" required className={selectClass} value={destination} onChange={(e) => setDestination(e.target.value)}><option value="">Selecione...</option>{units.filter((u) => !centers.some((c) => c.id === u.id)).map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}</select></Field>
        <Field label="Centro de Distribuição" htmlFor="dispatch-center"><select id="dispatch-center" className={selectClass} value={sourceId} onChange={(e) => { setCenterId(e.target.value); setItems((old) => old.map((i) => ({ ...i, source_unit_id: i.source_unit_id ? e.target.value : "" }))); }}>{centers.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></Field>
        <Field label="Data do envio" htmlFor="dispatch-date"><Input id="dispatch-date" type="date" required max={todayISO()} value={date} onChange={(e) => setDate(e.target.value)} /></Field>
      </div>
      <div className="flex items-center justify-between"><h2 className="font-semibold">Itens do recibo</h2><Button type="button" variant="outline" size="sm" onClick={() => setItems((old) => [...old, emptyDispatchItem()])}><Plus />Adicionar item</Button></div>
      <div className="divide-y divide-border">{items.map((item, index) => <div key={index} className="space-y-3 py-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[2fr_2fr_1fr_1fr]">
          <Field label="Produto cadastrado" htmlFor={`dispatch-product-${index}`}><select id={`dispatch-product-${index}`} className={selectClass} value={item.product_id} onChange={(e) => { const p = products.find((p) => p.id === e.target.value); update(index, { product_id: p?.id || "", name: p?.nome || "", unit: p?.unidade_medida || "unidade", source_unit_id: "" }); }}><option value="">Novo material / informar nome</option>{products.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}</select></Field>
          <Field label="Nome do item" htmlFor={`dispatch-name-${index}`}><Input id={`dispatch-name-${index}`} required disabled={Boolean(item.product_id)} value={item.name} onChange={(e) => update(index, { name: e.target.value })} /></Field>
          <Field label="Quantidade" htmlFor={`dispatch-quantity-${index}`}><Input id={`dispatch-quantity-${index}`} required inputMode="decimal" value={item.quantity} onChange={(e) => update(index, { quantity: e.target.value })} /></Field>
          <Field label="Medida" htmlFor={`dispatch-unit-${index}`}><Input id={`dispatch-unit-${index}`} required disabled={Boolean(item.product_id)} value={item.unit} onChange={(e) => update(index, { unit: e.target.value })} /></Field>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-sm"><Checkbox checked={item.controls_stock} onCheckedChange={(v) => update(index, { controls_stock: v === true, source_unit_id: "" })} />Entra no estoque da unidade</label>
          {item.controls_stock && <select aria-label={`Origem do item ${index + 1}`} className={`${selectClass} sm:max-w-72`} value={item.source_unit_id} onChange={(e) => update(index, { source_unit_id: e.target.value })}><option value="">Recebido externamente (sem saída do Centro)</option>{item.product_id && sourceId && <option value={sourceId}>Retirar do Centro · saldo {stock.find((s) => s.product.id === item.product_id)?.quantity ?? 0}</option>}</select>}
          <Button type="button" variant="ghost" size="icon" title="Remover item" disabled={items.length === 1} onClick={() => setItems((old) => old.filter((_, i) => i !== index))}><Trash2 /></Button>
        </div>
      </div>)}</div>
      <Field label="Observação" htmlFor="dispatch-note"><Input id="dispatch-note" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      <Button type="submit" disabled={saving || !destination}><Send />{saving ? "Registrando..." : "Registrar envio e gerar recibo"}</Button>
      {receipt && <p role="status" className="text-sm font-semibold text-primary">Recibo {receipt} · Pendente de recebimento</p>}
    </form>
  </>;
}