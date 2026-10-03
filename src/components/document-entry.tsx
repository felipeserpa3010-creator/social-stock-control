import { useMemo, useRef, useState } from "react";
import { createWorker } from "tesseract.js";
import { Camera, Check, FileText, Loader2, Plus, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useUnit } from "@/hooks/useUnit";
import { useAuth } from "@/hooks/useAuth";
import { addMovement, ensureUncategorizedProduct, productsOptions, unitsOptions, type Product } from "@/lib/queries";
import { todayISO } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, Panel } from "@/components/ui-kit";

type DraftItem = { id: string; productId: string; nome: string; quantidade: string; unidade: string; encontrado: boolean };

const normalize = (value: string) =>
  value.toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();

function guessProducts(text: string, products: Product[]): DraftItem[] {
  const normalizedText = normalize(text);
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const items: DraftItem[] = [];

  for (const product of products) {
    const name = product.nome?.trim();
    if (!name || !normalizedText.includes(normalize(name))) continue;

    const lineIndex = lines.findIndex((line) => normalize(line).includes(normalize(name)));
    const nearby = lineIndex >= 0 ? lines.slice(lineIndex, lineIndex + 2).join(" ") : text;
    const quantidade = extractQuantity(nearby, name);
    if (!quantidade || Number(quantidade) <= 0) continue;

    const unitMatch = nearby.match(/\b(kg|kilo|quilo|g|gramas?|l|litros?|un|und|unid(?:ade)?s?|pc|pç|pct|pacote|cx|caixa|saco|fardo)\b/i);
    const unidade = inferUnit(unitMatch?.[1] ?? "", product.unidade_medida || "unidade");

    if (!items.some((item) => item.productId === product.id)) {
      items.push({
        id: crypto.randomUUID(),
        productId: product.id,
        nome: product.nome,
        quantidade,
        unidade,
        encontrado: true,
      });
    }
  }

  return items;
}

function extractQuantity(text: string, productName: string) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const target = normalize(productName);
  const index = lines.findIndex((value) => normalize(value).includes(target));
  const nearby = index >= 0 ? lines.slice(index, index + 2) : lines;
  const joined = nearby.join(" ");

  const table = joined.match(/(?:kg|kilo|quilo|g|gramas?|l|litros?|un|und|unid(?:ade)?s?|pc|pç|pct|pacote|cx|caixa|saco|fardo)\s+(\d+(?:[.,]\d+)?)\s+\d+(?:[.,]\d+)?\s+\d+(?:[.,]\d+)?/i);
  if (table) return table[1].replace(",", ".");

  const match = joined.match(/(\d+(?:[.,]\d+)?)\s*(kg|kilo|quilo|g|gramas?|l|litros?|un|und|unid(?:ade)?s?|pc|pç|pct|pacote|cx|caixa|saco|fardo)\b/i);
  if (match) return match[1].replace(",", ".");
  return "";
}

function inferUnit(text: string, fallback = "unidade") {
  if (/\bkg\b|\bkilo\b|\quilo\b/i.test(text)) return "kg";
  if (/\b(?:g|gramas?)\b/i.test(text)) return "g";
  if (/\b(?:l|litros?)\b/i.test(text)) return "litro";
  if (/\b(?:cx|caixa)\b/i.test(text)) return "caixa";
  if (/\b(?:pct|pacote)\b/i.test(text)) return "pacote";
  if (/\b(?:saco)\b/i.test(text)) return "saco";
  if (/\b(?:fardo)\b/i.test(text)) return "fardo";
  return fallback;
}

function extractUnknownCandidates(text: string, knownNames: Set<string>) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const result: { nome: string; quantidade: string; unidade: string }[] = [];
  const unitPattern = "(kg|kilo|quilo|g|gramas?|l|litros?|un|und|unid(?:ade)?s?|pc|pç|pct|pacote|cx|caixa|saco|fardo)";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^(item|cod\.?|desc\.?|qtde|total|valor|cartao|troco|cnpj|cpf|data|consumidor|documento|protocolo|tributos|consulte|mfc|serie)/i.test(line)) continue;

    // Tabelas de orçamento/cotação: DESCRIÇÃO ... EMB. QUANTID. VLR.UNIT. VLR.TOTAL.
    // Ex.: "CENOURA KG ... KG 10,000 4,25 42,50"
    const tableMatch = line.match(new RegExp("^\\d+\\s+\\d+\\s+(.+?)\\s+(?:" + unitPattern + ")\\s+(\\d+(?:[.,]\\d+)?)\\s+\\d+(?:[.,]\\d+)?\\s+\\d+(?:[.,]\\d+)?\\s*$", "i"));
    if (tableMatch) {
      const nome = tableMatch[1]
        .replace(/\.{2,}/g, " ")
        .replace(/[|*_]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      const unitMatch = line.match(new RegExp("(?:" + unitPattern + ")\\s+(\\d+(?:[.,]\\d+)?)\\s+\\d+(?:[.,]\\d+)?\\s+\\d+(?:[.,]\\d+)?\\s*$", "i"));
      const unidade = inferUnit(unitMatch?.[0] ?? "");
      if (nome.length >= 2 && !knownNames.has(normalize(nome))) {
        result.push({ nome, quantidade: tableMatch[2].replace(",", "."), unidade });
      }
      continue;
    }

    // NFC-e/recibo: descrição em uma linha e quantidade + unidade na linha seguinte.
    const next = lines[i + 1] ?? "";
    const nextQty = next.match(/^(\d+(?:[.,]\d+)?)\s*(kg|kilo|quilo|g|gramas?|l|litros?|un|und|unid(?:ade)?s?|pc|pç|pct|pacote|cx|caixa|saco|fardo)\b/i);
    if (nextQty && line.length >= 3) {
      const clean = line
        .replace(/^\d+\s+\d+\s+/i, "")
        .replace(/\b(?:kg|kilo|quilo|g|gramas?|l|litros?|un|und|unid(?:ade)?s?|pc|pç|pct|pacote|cx|caixa|saco|fardo)\b/gi, "")
        .replace(/[|*_]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      if (clean.length >= 3 && !knownNames.has(normalize(clean)) && !/^(item|total|valor|cartao|troco)$/i.test(clean)) {
        result.push({ nome: clean, quantidade: nextQty[1].replace(",", "."), unidade: inferUnit(nextQty[0]) });
      }
    }
  }

  return result;
}

export function DocumentEntry() {
  const { isAdmin } = useAuth();
  const { unitId } = useUnit();
  const queryClient = useQueryClient();
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
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
    setReading(true); setConfirmed(false); setItems([]);
    try {
      const worker = await createWorker("por");
      const result = await worker.recognize(file);
      const text = result.data.text;
      await worker.terminate();
      setOcrText(text);

      const known = guessProducts(text, products);
      const knownNames = new Set(known.map((item) => normalize(item.nome)));
      const candidates = extractUnknownCandidates(text, knownNames);

      const detected = [...known];
      for (const candidate of candidates) {
        if (!detected.some((item) => normalize(item.nome) === normalize(candidate.nome))) {
          detected.push({
            id: crypto.randomUUID(),
            productId: "",
            nome: candidate.nome,
            quantidade: candidate.quantidade,
            unidade: candidate.unidade,
            encontrado: false,
          });
        }
      }

      // If OCR found only the product description and the quantity is on the following line,
      // the candidate parser above handles it. No stock movement is created at this stage.
      const valid = detected.filter((item) => Number(item.quantidade.replace(",", ".")) > 0);
      if (!valid.length) {
        toast.warning("Não identifiquei um produto e uma quantidade válidos na imagem.");
        return;
      }

      setItems(valid);
      toast.success(valid.length + " produto(s) identificado(s). Confira e confirme o lançamento.");
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
        let productId = item.productId;
        if (!productId) {
          const created = await ensureUncategorizedProduct(item.nome, item.unidade || "unidade");
          productId = created.id;
        }
        await addMovement({
          unit_id: destination, product_id: productId, tipo: "entrada",
          quantidade: Number(item.quantidade.replace(",", ".")), data,
          observacao: "Entrada lançada a partir de documento lido por OCR", responsavel: null,
        });
      }
      await queryClient.invalidateQueries({ queryKey: ["products"] });
      await queryClient.invalidateQueries({ queryKey: ["stock"] });
      await queryClient.invalidateQueries({ queryKey: ["movements"] });
      setConfirmed(true);
      toast.success(items.length + " entrada(s) lançada(s) na unidade. Os produtos confirmados foram mantidos no cadastro.");
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
            <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="sr-only"
              onChange={(e) => { const file = e.target.files?.[0]; if (file) void readDocument(file); e.currentTarget.value = ""; }} />
            <input ref={galleryInputRef} type="file" accept="image/*" className="sr-only"
              onChange={(e) => { const file = e.target.files?.[0]; if (file) void readDocument(file); e.currentTarget.value = ""; }} />
            <div className="mt-4 flex flex-wrap gap-2">
              <Button onClick={() => cameraInputRef.current?.click()} disabled={reading}>
                {reading ? <Loader2 className="animate-spin" /> : <Camera />} {reading ? "Lendo..." : "Tirar foto"}
              </Button>
              <Button variant="outline" onClick={() => galleryInputRef.current?.click()} disabled={reading}>
                <Upload /> Escolher da galeria
              </Button>
            </div>
          </div>
          <div className="rounded-lg border bg-muted/30 p-5">
            <div className="flex items-center gap-2 font-semibold"><FileText className="size-4" /> Como funciona</div>
            <ol className="mt-3 space-y-2 text-sm text-muted-foreground">
              <li>1. Tire uma foto ou escolha uma imagem da galeria.</li><li>2. O OCR identifica produtos cadastrados e quantidades.</li>
              <li>3. Você pode editar tudo antes do lançamento.</li><li>4. Escolha a unidade e confirme somente quando estiver certo.</li>
            </ol>
          </div>
        </div>
      </Panel>

      {items.length > 0 && (
        <Panel title="Conferência antes do lançamento" description="Confira produto e quantidade. Nada será lançado no estoque até você confirmar. Produtos novos identificados na foto só serão cadastrados depois da sua confirmação. Use 🗑️ para excluir uma linha que estiver errada.">
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
                <td className="px-3 py-2">
                  {item.productId ? (
                    <select value={item.productId} onChange={(e) => {
                      const p = products.find((product) => product.id === e.target.value);
                      updateItem(item.id, { productId: e.target.value, nome: p?.nome ?? item.nome, unidade: p?.unidade_medida ?? item.unidade });
                    }} className="h-9 w-full rounded-md border border-input bg-background px-2">
                      <option value="">Selecione...</option>{products.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
                    </select>
                  ) : (
                    <Input value={item.nome} onChange={(e) => updateItem(item.id, { nome: e.target.value })} placeholder="Novo produto" />
                  )}
                </td>
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
