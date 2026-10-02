import { useMemo, useRef, useState } from "react";
import { createWorker } from "tesseract.js";
import { Camera, Check, FileText, Loader2, Plus, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useUnit } from "@/hooks/useUnit";
import { useAuth } from "@/hooks/useAuth";
import { addMovement, productsOptions, unitsOptions, type Product } from "@/lib/queries";
import { todayISO } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, Panel } from "@/components/ui-kit";

type DraftItem = { id: string; productId: string; nome: string; quantidade: string; unidade: string; encontrado: boolean };

const normalize = (value: string) =>
  value.toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();

function extractQuantity(text: string, productName: string) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const target = normalize(productName);
  const line = lines.find((value) => normalize(value).includes(target)) ?? "";
  const match = line.match(/(\d+(?:[.,]\d+)?)\s*(kg|kilo|quilo|g|gramas?|l|litros?|un|und|unid(?:ade)?s?|cx|caixa|pct|pacote|saco|fardo)?/i);
  if (match) return match[1].replace(",", ".");
  const all = line.match(/(\d+(?:[.,]\d+)?)/);
  return all?.[1]?.replace(",", ".") ?? "";
}

function guessProducts(text: string, products: Product[]): DraftItem[] {
  const normalizedText = normalize(text);
  const candidates = products.filter((p) => normalizedText.includes(normalize(p.nome))).sort((a, b) => normalize(b.nome).length - normalize(a.nome).length);
  const unique = new Map<string, Product>();
  candidates.forEach((p) => unique.set(p.id, p));
  return Array.from(unique.values()).map((p) => ({
    id: crypto.randomUUID(), productId: p.id, nome: p.nome, quantidade: extractQuantity(text, p.nome),
    unidade: p.unidade_medida, encontrado: true,
  }));
}

export function DocumentEntry() {
  const { isAdmin } = useAuth();
  const { unitId } = useUnit();
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const { data: products = [] } = useQuery(productsOptions(false));
  const { data: units = [] } = useQuery(unitsOptions(false));
  const [items, setItems] = useState<DraftItem[]>([]);
  const [destination, setDestination] = useState(unitId ?? "");
  const [data, setData] = useState(todayISO());
  const [reading, setReading] = useState(false);
  const [ocrText, setOcrText] = useState("");
  const [confirmed, setConfirmed] = useState(false);

  const activeUnits = useMemo(() => units.filter((u) => u.ativo), [units]);
  if (!isAdmin) return null;

  const readDocument = async (file: File) => {
    setReading(true); setConfirmed(false);
    try {
      const worker = await createWorker("por");
      const result = await worker.recognize(file);
      const text = result.data.text;
      await worker.terminate();
      setOcrText(text);
      const detected = guessProducts(text, products);
      if (!detected.length) toast.warning("Não identifiquei produtos cadastrados. Confira a foto e tente novamente.");
      else { setItems(detected); toast.success(detected.length + " produto(s) identificado(s). Confira antes de lançar."); }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível ler o documento.");
    } finally { setReading(false); }
  };

  const updateItem = (id: string, patch: Partial<DraftItem>) =>
    setItems((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item));

  const confirmEntry = async () => {
    if (!destination) return toast.error("Escolha a unidade de destino.");
    if (!items.length) return toast.error("Adicione pelo menos um produto.");
    if (items.some((item) => !item.productId || Number(item.quantidade.replace(",", ".")) <= 0))
      return toast.error("Revise produto e quantidade antes de confirmar.");
    setReading(true);
    try {
      for (const item of items) {
        await addMovement({
          unit_id: destination, product_id: item.productId, tipo: "entrada",
          quantidade: Number(item.quantidade.replace(",", ".")), data,
          observacao: "Entrada lançada a partir de documento lido por OCR", responsavel: null,
        });
      }
      await queryClient.invalidateQueries({ queryKey: ["stock"] });
      await queryClient.invalidateQueries({ queryKey: ["movements"] });
      setConfirmed(true);
      toast.success(items.length + " entrada(s) lançada(s) na unidade.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível confirmar o lançamento.");
    } finally { setReading(false); }
  };

  return (
    <div className="space-y-5">
      <Panel title="Lançamento por foto ou documento" description="Leitura gratuita no próprio navegador. O sistema usa somente produto, quantidade e unidade; valores de preço não são lançados.">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-lg border border-dashed border-primary/40 bg-primary/5 p-5">
            <div className="flex items-start gap-3">
              <span className="grid size-10 place-items-center rounded-lg bg-primary/10 text-primary"><Camera className="size-5" /></span>
              <div><p className="font-semibold">Fotografar ou enviar</p><p className="mt-1 text-sm text-muted-foreground">Nota, recibo ou orçamento. O documento é processado no navegador e não é salvo pelo recurso.</p></div>
            </div>
            <input ref={inputRef} type="file" accept="image/*" capture="environment" className="sr-only"
              onChange={(e) => { const file = e.target.files?.[0]; if (file) void readDocument(file); e.currentTarget.value = ""; }} />
            <div className="mt-4"><Button onClick={() => inputRef.current?.click()} disabled={reading}>{reading ? <Loader2 className="animate-spin" /> : <Upload />} {reading ? "Lendo..." : "Tirar foto / escolher imagem"}</Button></div>
          </div>
          <div className="rounded-lg border bg-muted/30 p-5">
            <div className="flex items-center gap-2 font-semibold"><FileText className="size-4" /> Como funciona</div>
            <ol className="mt-3 space-y-2 text-sm text-muted-foreground">
              <li>1. Tire a foto do documento.</li><li>2. O OCR identifica produtos cadastrados e quantidades.</li>
              <li>3. Você pode editar tudo antes do lançamento.</li><li>4. Escolha a unidade e confirme somente quando estiver certo.</li>
            </ol>
          </div>
        </div>
      </Panel>

      {items.length > 0 && (
        <Panel title="Conferência antes do lançamento" description="Confira o resumo. Nada foi lançado no estoque ainda.">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Unidade de destino" htmlFor="ocr-unit" required>
              <select id="ocr-unit" value={destination} onChange={(e) => setDestination(e.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                <option value="">Selecione...</option>{activeUnits.map((unit) => <option key={unit.id} value={unit.id}>{unit.nome}</option>)}
              </select>
            </Field>
            <Field label="Data do lançamento" htmlFor="ocr-date" required><Input id="ocr-date" type="date" max={todayISO()} value={data} onChange={(e) => setData(e.target.value)} /></Field>
          </div>
          <div className="mt-5 overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[720px] text-sm"><thead className="bg-muted/50"><tr>
              <th className="px-3 py-2 text-left">Produto</th><th className="px-3 py-2 text-left">Quantidade</th><th className="px-3 py-2 text-left">Unidade</th><th className="px-3 py-2" />
            </tr></thead><tbody>
              {items.map((item) => <tr key={item.id} className="border-t">
                <td className="px-3 py-2"><select value={item.productId} onChange={(e) => {
                  const p = products.find((product) => product.id === e.target.value);
                  updateItem(item.id, { productId: e.target.value, nome: p?.nome ?? item.nome, unidade: p?.unidade_medida ?? item.unidade });
                }} className="h-9 w-full rounded-md border border-input bg-background px-2">
                  <option value="">Selecione...</option>{products.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
                </select></td>
                <td className="px-3 py-2"><Input inputMode="decimal" value={item.quantidade} onChange={(e) => updateItem(item.id, { quantidade: e.target.value })} /></td>
                <td className="px-3 py-2 font-medium">{item.unidade}</td>
                <td className="px-3 py-2 text-right"><Button variant="ghost" size="icon" onClick={() => setItems((current) => current.filter((x) => x.id !== item.id))}><Trash2 className="size-4" /></Button></td>
              </tr>)}
            </tbody></table>
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <Button variant="outline" onClick={() => setItems((current) => [...current, { id: crypto.randomUUID(), productId: "", nome: "", quantidade: "", unidade: "", encontrado: false }])}><Plus /> Adicionar produto</Button>
            <Button onClick={confirmEntry} disabled={reading || confirmed || !destination}>{reading ? <Loader2 className="animate-spin" /> : <Check />} {confirmed ? "Lançamento confirmado" : "Confirmar e lançar no estoque"}</Button>
          </div>
          {ocrText && <details className="mt-4 rounded-lg border bg-muted/20 p-3"><summary className="cursor-pointer text-xs font-semibold text-muted-foreground">Texto lido pelo OCR</summary><pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap text-xs text-muted-foreground">{ocrText}</pre></details>}
        </Panel>
      )}
    </div>
  );
}
