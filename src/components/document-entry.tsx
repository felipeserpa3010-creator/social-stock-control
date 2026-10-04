import { useMemo, useRef, useState } from "react";
import { createWorker, PSM } from "tesseract.js";
import { Camera, Check, FileText, Loader2, Plus, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useUnit } from "@/hooks/useUnit";
import { useAuth } from "@/hooks/useAuth";
import { addMovement, ensureUncategorizedProduct, productsOptions, unitsOptions, type Product } from "@/lib/queries";
import { supabase } from "@/integrations/supabase/client";
import { todayISO } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, Panel } from "@/components/ui-kit";

type DraftItem = { id: string; productId: string; nome: string; quantidade: string; unidade: string; encontrado: boolean };

const normalize = (value: string) =>
  value.toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();

function simplifyOcrProductName(value: string) {
  const cleaned = value
    .replace(/^\s*[-–—]+\s*/, "")
    .replace(/^\d{2,7}\s+/, "")
    .replace(/\b(?:kg|k6|kb|ki|k5|k8|ks|kº|g|gr|gramas?|l|lt|litros?|un|und|unid(?:ade)?s?|pc|pç|pct|pacote|cx|caixa|sc|saco|fd|fardo|pl|p1|mm|m)\b/gi, "")
    .replace(/\.{2,}.*$/g, "")
    .replace(/[|*_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // O OCR usa somente o nome principal do alimento/produto.
  // Exemplos: "CEBOLA II" -> "CEBOLA"; "SALSICHA HOT DOG BOVINA" -> "SALSICHA";
  // "TOMATE ANÁPOLIS" -> "TOMATE"; "LINGUIÇA CALABRESA SADIA" -> "LINGUIÇA".
  const firstWord = cleaned.match(/^[A-Za-zÀ-ÖØ-öø-ÿ]+/u)?.[0] ?? "";
  return firstWord || cleaned;
}

function guessProducts(text: string, products: Product[]): DraftItem[] {
  const normalizedText = normalize(text);
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const items: DraftItem[] = [];

  for (const product of products) {
    const name = product.nome?.trim();
    if (!name || !normalizedText.includes(normalize(name))) continue;

    const lineIndex = lines.findIndex((line) => normalize(line).includes(normalize(name)));
    const nearby = lineIndex >= 0 ? lines.slice(lineIndex, lineIndex + 4).join(" ") : text;
    const quantidade = extractQuantity(nearby, name);
    if (!quantidade || Number(quantidade) <= 0) continue;

    const unitMatch = nearby.match(/\b(kg|kilo|quilo|g|gramas?|l|litros?|un|und|unid(?:ade)?s?|pc|pç|pct|pacote|cx|caixa|saco|fardo)\b/i);
    const unidade = inferUnit(unitMatch?.[1] ?? "", product.unidade_medida || "unidade");

    if (!items.some((item) => item.productId === product.id)) {
      items.push({
        id: crypto.randomUUID(),
        productId: product.id,
        nome: simplifyOcrProductName(product.nome),
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
  const nearby = index >= 0 ? lines.slice(index, index + 4) : lines;
  const joined = nearby.join(" ");

  const table = joined.match(/(?:kg|kilo|quilo|g|gramas?|l|litros?|un|und|unid(?:ade)?s?|pc|pç|pct|pacote|cx|caixa|saco|fardo)\s+(\d+(?:[.,]\d+)?)\s+\d+(?:[.,]\d+)?\s+\d+(?:[.,]\d+)?/i);
  if (table?.[1]) return table[1].replace(",", ".");

  const match = joined.match(/(\d+(?:[.,]\d+)?)\s*(kg|kilo|quilo|g|gramas?|l|litros?|un|und|unid(?:ade)?s?|pc|pç|pct|pacote|cx|caixa|saco|fardo)\b/i);
  if (match?.[1]) return match[1].replace(",", ".");
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

function normalizeOcrUnit(value: string) {
  const token = value.toLocaleLowerCase("pt-BR").replace(/[^a-z0-9]/g, "");
  if (/^(kg|k6|kb|ki|k5|k8|ks)$/.test(token)) return "kg";
  if (/^(g|gr|gram|grama|gramas)$/.test(token)) return "g";
  if (/^(l|lt|litro|litros)$/.test(token)) return "litro";
  if (/^(un|und|unid|unidade|unidades|pl|p1|mm|m)$/.test(token)) return "unidade";
  if (/^(pc|pç|pct|pacote|pacotes)$/.test(token)) return "pacote";
  if (/^(cx|caixa|caixas)$/.test(token)) return "caixa";
  if (/^(sc|saco|sacos)$/.test(token)) return "saco";
  if (/^(fd|fardo|fardos)$/.test(token)) return "fardo";
  return "";
}

function extractUnknownCandidates(text: string, knownNames: Set<string>) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const result: { nome: string; quantidade: string; unidade: string }[] = [];
  const unitPattern = "(kg|kilo|quilo|g|gramas?|l|litros?|un|und|unid(?:ade)?s?|pc|pç|pct|pacote|cx|caixa|saco|fardo)";
  const isQuotationTable = /descri[cç][aã]o\s+do\s+produto|quantid|vlr\.?\s*\.?(?:unit|total)/i.test(text);


  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    if (/^(item|cod\.?|desc\.?|qtde|total|valor|cartao|troco|cnpj|cpf|data|consumidor|documento|protocolo|tributos|consulte|mfc|serie)/i.test(line)) continue;

    // Em uma cotação, só linhas numeradas de itens podem virar produtos.
    // Isso impede que cabeçalho, endereço, total e observações sejam interpretados como produto.
    const looksLikeTableItem = /^\d{3}\s*\d*\s+.+$/i.test(line);
    if (isQuotationTable && !looksLikeTableItem) continue;

    // Parser específico para linhas de cotação: código do item + descrição + unidade +
    // quantidade + preço unitário + total. Os preços são descartados.
    if (isQuotationTable) {
      const row = line.match(/^\s*\d{3}\s+(.+?)\s+(kg|k6|kb|ki|k5|k8|ks|kº|g|gr|gramas?|l|lt|litros?|un|und|unid(?:ade)?s?|pc|pç|pct|pacote|cx|caixa|sc|saco|fd|fardo|pl|p1|mm|m)\.?\s+(\d+(?:[.,]\d+)?)\s+\d+(?:[.,]\d+)?\s+\d+(?:[.,]\d+)?\s*$/i);
      if (row?.[1] && row[2] && row[3]) {
        let nome = row[1]
          .replace(/^\d{2,7}\s*/i, "")
          .replace(/^[A-Z]?\d{2,7}/i, "")
          .replace(/\.{2,}\s*.*$/g, "")
          .replace(/\s+/g, " ")
          .trim();
        const unidade = normalizeOcrUnit(row[2]) || inferUnit(row[2]);
        if (nome.length >= 3 && !knownNames.has(normalize(nome))) {
          result.push({ nome: simplifyOcrProductName(nome), quantidade: row[3].replace(",", "."), unidade: unidade || "unidade" });
          continue;
        }
      }

      // Algumas linhas perdem a sigla da unidade. Nesse caso, ainda usamos
      // os três números finais e inferimos a unidade pelo nome (ex.: KG).
      const rowNoUnit = line.match(/^\s*\d{3}\s+(.+?)\s+(\d+(?:[.,]\d+)?)\s+\d+(?:[.,]\d+)?\s+\d+(?:[.,]\d+)?\s*$/i);
      if (rowNoUnit?.[1] && rowNoUnit[2]) {
        let nome = rowNoUnit[1]
          .replace(/^\d{2,7}\s*/i, "")
          .replace(/^[A-Z]?\d{2,7}/i, "")
          .replace(/\.{2,}\s*.*$/g, "")
          .replace(/\s+/g, " ")
          .trim();
        const unidade = /\b(?:kg|k6|kb|ki|k5|k8|ks|kº)\b/i.test(nome) ? "kg" :
          /\b(?:un|und|unid|mm|m)\b/i.test(nome) ? "unidade" : "unidade";
        if (nome.length >= 3 && !knownNames.has(normalize(nome))) {
          result.push({ nome: simplifyOcrProductName(nome), quantidade: rowNoUnit[2].replace(",", "."), unidade });
          continue;
        }
      }
    }

    // Tabelas de orçamento/cotação. Aceita linhas com ou sem códigos no início.
    // Ex.: "01 001 CENOURA KG 10,000 4,25 42,50" ou "CENOURA KG 10,000 4,25 42,50".
    const tableMatch = line.match(new RegExp("^(?:\\d+\\s+){0,2}(.+?)\\s+(?:" + unitPattern + ")\\s+(\\d+(?:[.,]\\d+)?)\\s+\\d+(?:[.,]\\d+)?\\s+\\d+(?:[.,]\\d+)?\\s*$", "i"));
    if (tableMatch?.[1] && tableMatch[2]) {
      const nome = tableMatch[1]
        .replace(/\.{2,}/g, " ")
        .replace(/[|*_]+/g, " ")
        .replace(/^\d+\s+\d+\s+/, "")
        .replace(/\s+/g, " ")
        .trim();
      const unitMatch = line.match(new RegExp("(?:" + unitPattern + ")\\s+(\\d+(?:[.,]\\d+)?)\\s+\\d+(?:[.,]\\d+)?\\s+\\d+(?:[.,]\\d+)?\\s*$", "i"));
      const unidade = inferUnit(unitMatch?.[0] ?? "");
      if (nome.length >= 2 && !knownNames.has(normalize(nome)) && !/^(item|codigo|descri[cç][aã]o|total|valor)$/i.test(nome)) {
        result.push({ nome, quantidade: tableMatch[2].replace(",", "."), unidade });
      }
      continue;
    }

    // Fallback para tabelas em que o OCR erra a sigla da unidade (ex.: "k6" no lugar de "kg")
    // ou perde a unidade original. Usa as três colunas numéricas finais: quantidade, valor unitário e total.
    const numericTail = line.match(/^(?:\d+\s+){0,2}(.+?)\s+(\d+(?:[.,]\d+)?)\s+(\d+(?:[.,]\d+)?)\s+(\d+(?:[.,]\d+)?)[^\d\s]*\s*$/);
    if (numericTail?.[1] && numericTail[2]) {
      let prefix = numericTail[1].replace(/[|*_]+/g, " ").replace(/\s+/g, " ").trim();

      // Remove item/código mesmo quando o OCR cola os números no início da descrição.
      prefix = prefix.replace(/^\d{3}\s*/i, "").replace(/^\d{2,7}\s*/i, "").trim();

      const unitMatch = prefix.match(/(?:^|\s)(kg|k6|kb|ki|k5|k8|ks|kº|g|gr|gramas?|l|lt|litros?|un|und|unid(?:ade)?s?|pc|pç|pct|pacote|cx|caixa|sc|saco|fd|fardo|pl|p1|mm|m)\.?$/i);
      const unidade = normalizeOcrUnit(unitMatch?.[1] ?? "") || inferUnit(unitMatch?.[1] ?? "");

      // A cotação usa pontilhado entre descrição e unidade. O OCR pode transformar
      // esse pontilhado em uma sequência de letras sem sentido. Mantemos somente
      // os tokens que parecem fazer parte da descrição impressa em maiúsculas.
      let nomePrefix = unitMatch ? prefix.slice(0, unitMatch.index).trim() : prefix;
      nomePrefix = nomePrefix.replace(/\.{1,}.*$/g, "").trim();
      const tokens = nomePrefix.split(/\s+/).filter(Boolean);
      const cleanTokens: string[] = [];
      for (const token of tokens) {
        if (/^[A-ZÀ-Ü0-9]+$/.test(token)) cleanTokens.push(token);
        else break;
      }
      let nome = (cleanTokens.length ? cleanTokens.join(" ") : nomePrefix)
        .replace(/^\d{2,7}\s*/i, "")
        .replace(/\b(?:kg|k6|kb|ki|k5|k8|ks|kº|g|gr|gramas?|l|lt|litros?|un|und|unid(?:ade)?s?|pc|pç|pct|pacote|cx|caixa|sc|saco|fd|fardo|pl|p1|mm|m)\.?$/i, "")
        .trim();

      // Quando a unidade foi perdida, ainda conseguimos inferi-la pelo próprio nome.
      const unidadeFinal = unidade || (/\b(?:kg|k6|kb|ki|k5|k8|ks|kº)\b/i.test(nome) ? "kg" : /\b(?:un|und|unid|mm|m)\b/i.test(nome) ? "unidade" : "unidade");
      if (nome.length >= 3 && !knownNames.has(normalize(nome)) && !/^(item|codigo|cod|referencia|descricao|total|valor|obs)$/i.test(nome)) {
        result.push({ nome: simplifyOcrProductName(nome), quantidade: numericTail[2].replace(",", "."), unidade: unidadeFinal });
        continue;
      }
    }

    // Documento fiscal/recibo com descrição e quantidade na mesma linha.
    // Ex.: "FÍGADO BOV CONG 22,220 KG".
    const sameLineQty = line.match(new RegExp("^(.{3,}?)\\s+(\\d+(?:[.,]\\d+)?)\\s*(?:" + unitPattern + ")\\s*$", "i"));
    if (sameLineQty?.[1] && sameLineQty[2]) {
      const nome = sameLineQty[1]
        .replace(/^\d+\s+\d+\s+/, "")
        .replace(/[|*_]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      const unitMatch = line.match(new RegExp("(?:" + unitPattern + ")\\s*$", "i"));
      if (nome.length >= 3 && !knownNames.has(normalize(nome)) && !/^(item|total|valor|cartao|troco|quantidade|descricao)$/i.test(nome)) {
        result.push({ nome: simplifyOcrProductName(nome), quantidade: sameLineQty[2].replace(",", "."), unidade: inferUnit(unitMatch?.[0] ?? "") });
        continue;
      }
    }

    // NFC-e/recibo: descrição em uma linha e quantidade + unidade na linha seguinte.
    const next = lines[i + 1] ?? "";
    const nextQty = next.match(new RegExp("^(\\d+(?:[.,]\\d+)?)\\s*(?:" + unitPattern + ")\\b", "i"));
    if (nextQty?.[1] && line.length >= 3) {
      const clean = line
        .replace(/^\d+\s+\d+\s+/i, "")
        .replace(/\b(?:kg|kilo|quilo|g|gramas?|l|litros?|un|und|unid(?:ade)?s?|pc|pç|pct|pacote|cx|caixa|saco|fardo)\b/gi, "")
        .replace(/[|*_]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      if (clean.length >= 3 && !knownNames.has(normalize(clean)) && !/^(item|total|valor|cartao|troco|quantidade|descricao)$/i.test(clean)) {
        result.push({ nome: simplifyOcrProductName(clean), quantidade: nextQty[1].replace(",", "."), unidade: inferUnit(nextQty[0]) });
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

  const normalizeVisionUnit = (value: string, fallback = "unidade") => {
    const token = value.toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\\u0300-\\u036f]/g, "").replace(/[^a-z0-9]/g, "");
    if (/^(kg|quilo|kilo)$/.test(token)) return "kg";
    if (/^(g|gr|grama|gramas)$/.test(token)) return "g";
    if (/^(l|lt|litro|litros)$/.test(token)) return "litro";
    if (/^(ml|mililitro|mililitros)$/.test(token)) return "ml";
    if (/^(un|und|unid|unidade|unidades|pc|pç)$/.test(token)) return "unidade";
    if (/^(pct|pacote|pacotes)$/.test(token)) return "pacote";
    if (/^(cx|caixa|caixas)$/.test(token)) return "caixa";
    if (/^(sc|saco|sacos)$/.test(token)) return "saco";
    if (/^(fd|fardo|fardos)$/.test(token)) return "fardo";
    if (/^(pote|potes)$/.test(token)) return "pote";
    if (/^(frasco|frascos)$/.test(token)) return "frasco";
    if (/^(lata|latas)$/.test(token)) return "lata";
    if (/^(duzia|duzias)$/.test(token)) return "dúzia";
    return fallback;
  };

  const fileToVisionDataUrl = async (file: File) => {
    const bitmap = await createImageBitmap(file);
    const maxDimension = 2400;
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Não foi possível preparar a imagem para a leitura por visão.");
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((value) => value ? resolve(value) : reject(new Error("Não foi possível preparar a imagem.")), "image/jpeg", 0.88);
    });

    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Não foi possível converter a imagem."));
      reader.onerror = () => reject(new Error("Não foi possível converter a imagem."));
      reader.readAsDataURL(blob);
    });
  };

  const readWithVision = async (file: File) => {
    const imageDataUrl = await fileToVisionDataUrl(file);
    const { data, error } = await supabase.functions.invoke("vision-ocr", {
      body: { image_data_url: imageDataUrl },
    });

    if (error) {
      let message = error.message;
      try {
        const context = await error.context?.json?.();
        if (context?.error) message = context.error;
      } catch {
        // Mantém a mensagem original do Supabase.
      }
      throw new Error(message || "A API de visão não conseguiu ler o documento.");
    }

    const visionItems = Array.isArray(data?.items) ? data.items : [];
    if (!visionItems.length) throw new Error("A API de visão não identificou produtos legíveis na imagem.");

    const detected: DraftItem[] = [];
    for (const item of visionItems) {
      const nomeOriginal = String(item?.produto ?? "").trim();
      const quantidade = Number(item?.quantidade);
      if (!nomeOriginal || !Number.isFinite(quantidade) || quantidade <= 0) continue;

      const nome = simplifyOcrProductName(nomeOriginal);
      const unidade = normalizeVisionUnit(String(item?.unidade ?? ""), "unidade");
      const normalizedName = normalize(nome);
      const product = products.find((p) => {
        const full = normalize(p.nome ?? "");
        const simple = normalize(simplifyOcrProductName(p.nome ?? ""));
        return full === normalize(nomeOriginal) || full === normalizedName || simple === normalizedName;
      });

      if (!detected.some((entry) => normalize(entry.nome) === normalizedName && entry.quantidade === String(quantidade))) {
        detected.push({
          id: crypto.randomUUID(),
          productId: product?.id ?? "",
          nome: nome || nomeOriginal,
          quantidade: String(quantidade).replace(".", ","),
          unidade: product?.unidade_medida ? normalizeVisionUnit(product.unidade_medida, unidade) : unidade,
          encontrado: Boolean(product),
        });
      }
    }

    if (!detected.length) throw new Error("A API de visão não encontrou produtos e quantidades válidos.");
    return detected;
  };

  const readDocument = async (file: File) => {
    setReading(true); setConfirmed(false); setItems([]);
    try {
      // Primeiro tenta a visão da OpenAI. O Tesseract permanece como fallback
      // para não bloquear o lançamento caso a função de visão esteja temporariamente indisponível.
      try {
        const detected = await readWithVision(file);
        setOcrText("Leitura realizada pela API de visão. Confira os itens antes de confirmar.");
        setItems(detected);
        toast.success(detected.length + " produto(s) identificado(s) pela visão. Confira e confirme o lançamento.");
        return;
      } catch (visionError) {
        console.warn("Vision OCR indisponível; usando OCR local como fallback.", visionError);
        setOcrText("A leitura por visão não ficou disponível nesta tentativa. O sistema usou OCR local como fallback.");
      }

      // Fallback local: prepara a foto para melhorar OCR em celulares.
      const bitmap = await createImageBitmap(file);
      const scale = Math.min(2.5, Math.max(1, 1800 / Math.max(bitmap.width, bitmap.height)));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Não foi possível preparar a imagem para leitura.");
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close();

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      for (let p = 0; p < imageData.data.length; p += 4) {
        const red = imageData.data[p] ?? 0;
        const green = imageData.data[p + 1] ?? 0;
        const blue = imageData.data[p + 2] ?? 0;
        const gray = Math.round(red * 0.299 + green * 0.587 + blue * 0.114);
        const contrast = Math.max(0, Math.min(255, (gray - 128) * 1.35 + 128));
        imageData.data[p] = contrast;
        imageData.data[p + 1] = contrast;
        imageData.data[p + 2] = contrast;
      }
      ctx.putImageData(imageData, 0, 0);

      const worker = await createWorker("por");
      await worker.setParameters({
        tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
        preserve_interword_spaces: "1",
        user_defined_dpi: "300",
      });
      const result = await worker.recognize(canvas);
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

      const valid = detected.filter((item) => Number(item.quantidade.replace(",", ".")) > 0);
      if (!valid.length) {
        throw new Error("Não identifiquei um produto e uma quantidade válidos na imagem. Tente uma foto mais próxima e bem iluminada.");
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
    if (!destination) { toast.error("Escolha a unidade de destino."); return; }
    if (!items.length) { toast.error("Adicione pelo menos um produto."); return; }
    if (items.some((item) => (!item.productId && !item.nome.trim()) || Number(item.quantidade.replace(",", ".")) <= 0))
      { toast.error("Revise produto e quantidade antes de confirmar."); return; }
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
      <Panel title="Lançamento por foto ou documento" description="Leitura por visão com IA. O sistema usa somente produto, quantidade e unidade; valores de preço, códigos e dados fiscais não são lançados.">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-lg border border-dashed border-primary/40 bg-primary/5 p-5">
            <div className="flex items-start gap-3">
              <span className="grid size-10 place-items-center rounded-lg bg-primary/10 text-primary"><Camera className="size-5" /></span>
              <div><p className="font-semibold">Fotografar ou enviar</p><p className="mt-1 text-sm text-muted-foreground">Nota, recibo ou orçamento. Uma API de visão analisa a imagem para identificar todas as linhas da tabela. O documento não é salvo pelo recurso.</p></div>
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
              <li>1. Tire uma foto ou escolha uma imagem da galeria.</li><li>2. A visão por IA identifica todos os produtos, quantidades e unidades.</li>
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
                <td className="px-3 py-2">
                  <select
                    value={item.unidade}
                    onChange={(e) => updateItem(item.id, { unidade: e.target.value })}
                    className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                  >
                    <option value="kg">Quilo (kg)</option>
                    <option value="g">Grama (g)</option>
                    <option value="unidade">Unidade</option>
                    <option value="pacote">Pacote</option>
                    <option value="caixa">Caixa</option>
                    <option value="fardo">Fardo</option>
                    <option value="saco">Saco</option>
                    <option value="litro">Litro</option>
                    <option value="ml">Mililitro (ml)</option>
                    <option value="pote">Pote</option>
                    <option value="frasco">Frasco</option>
                    <option value="lata">Lata</option>
                    <option value="dúzia">Dúzia</option>
                    <option value="pc">Peça (PC)</option>
                    <option value="outro">Outro</option>
                  </select>
                </td>
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
