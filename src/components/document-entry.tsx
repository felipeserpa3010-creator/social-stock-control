import { useMemo, useState } from "react";
import { Check, Loader2, Plus, Trash2, PackagePlus, ClipboardList } from "lucide-react";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useUnit } from "@/hooks/useUnit";
import { useAuth } from "@/hooks/useAuth";
import { addMovement, ensureUncategorizedProduct, productsOptions, unitsOptions, type Product } from "@/lib/queries";
import { todayISO } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, Panel } from "@/components/ui-kit";
import { buildReceiptPdf, reportFileName } from "@/lib/pdf";
import { supabase } from "@/integrations/supabase/client";

type DraftItem = { id: string; productId: string; nome: string; quantidade: string; unidade: string };

const normalizeName = (value: string) =>
  value.toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

const MASS_UNITS = ["Pacote", "Unidade", "Kg", "Saco", "Caixa"] as const;\n\nconst normalizeUnit = (value: string) => {
  const raw = value.toLocaleLowerCase("pt-BR").trim();
  if (/^kg$/.test(raw)) return "Kg";
  if (/^(g|gramas?)$/.test(raw)) return "g";
  if (/^(l|litros?)$/.test(raw)) return "Litro";
  if (/^ml$/.test(raw)) return "ml";
  if (/^(un|und|unidade|unidades|pc|pcs)$/.test(raw)) return "Unidade";
  if (/^(pacote|pacotes)$/.test(raw)) return "Pacote";
  if (/^(caixa|caixas)$/.test(raw)) return "Caixa";
  if (/^(fardo|fardos)$/.test(raw)) return "Fardo";
  if (/^(saco|sacos)$/.test(raw)) return "Saco";
  if (/^(pote|potes)$/.test(raw)) return "Pote";
  if (/^(frasco|frascos)$/.test(raw)) return "Frasco";
  if (/^(lata|latas)$/.test(raw)) return "Lata";
  if (/^(dúzia|duzia|dúzias|duzias)$/.test(raw)) return "Dúzia";
  return value.trim() || "Unidade";
};

export function DocumentEntry() {
  const { isAdmin } = useAuth();
  const { unitId } = useUnit();
  const queryClient = useQueryClient();
  const { data: products = [] } = useQuery(productsOptions(false));
  const { data: units = [] } = useQuery(unitsOptions(false));
  const [items, setItems] = useState<DraftItem[]>([]);
  const [destination, setDestination] = useState(unitId ?? "");
  const [data, setData] = useState(todayISO());
  const [saving, setSaving] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [textoMassa, setTextoMassa] = useState("");
  const [reciboId, setReciboId] = useState<string | null>(null);
  const [numeroOrdemFornecimento, setNumeroOrdemFornecimento] = useState("");

  const activeUnits = useMemo(() => units.filter((u) => u.ativo), [units]);
  const activeProducts = useMemo(
    () => products.filter((p) => p.ativo).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
    [products],
  );

  if (!isAdmin) return null;

  const parseTextoMassa = (text: string) => {
    const rows: DraftItem[] = [];
    const unitPattern = "(kg|g|unidade(?:s)?|un|und|pc|pcs|pacote(?:s)?|caixa(?:s)?|fardo(?:s)?|saco(?:s)?|litro(?:s)?|l|ml|pote(?:s)?|frasco(?:s)?|lata(?:s)?|dúzia(?:s)?|duzia(?:s)?)";
    // Não exige um formato fixo. O usuário pode escrever, por exemplo:
    // "4 kg de cebola", "cebola 4kg", "cebola: 4 kg", "cebola - 4",
    // "cebola 4 quilos" ou vários produtos separados por linha/ponto e vírgula.
    const chunks = text
      .split(/\r?\n|;|•/)
      .map((part) => part.trim().replace(/^[-*]\s*/, ""))
      .filter(Boolean);

    for (const chunk of chunks) {
      const quantityWithUnit = chunk.match(new RegExp("(\\d+(?:[.,]\\d+)?)\\s*" + unitPattern + "\\b", "i"));
      const unitBeforeQuantity = chunk.match(new RegExp(unitPattern + "\\s*(\\d+(?:[.,]\\d+)?)\\b", "i"));
      const quantityOnly = chunk.match(/(?:^|\\s)(\\d+(?:[.,]\\d+)?)(?:\\s|$)/);

      const quantityMatch = quantityWithUnit ?? unitBeforeQuantity;
      if (!quantityMatch && !quantityOnly) continue;

      let quantidade = "";
      let unidade = "Unidade";
      let nome = chunk;

      if (quantityWithUnit) {
        quantidade = (quantityWithUnit[1] ?? "0").replace(",", ".");
        unidade = normalizeUnit(quantityWithUnit[2] || "Unidade");
        nome = chunk.slice(0, quantityWithUnit.index ?? 0) + chunk.slice((quantityWithUnit.index ?? 0) + quantityWithUnit[0].length);
      } else if (unitBeforeQuantity) {
        quantidade = (unitBeforeQuantity[2] ?? "0").replace(",", ".");
        unidade = normalizeUnit(unitBeforeQuantity[1] || "Unidade");
        nome = chunk.slice(0, unitBeforeQuantity.index ?? 0) + chunk.slice((unitBeforeQuantity.index ?? 0) + unitBeforeQuantity[0].length);
      } else if (quantityOnly) {
        quantidade = (quantityOnly[1] ?? "0").replace(",", ".");
        nome = chunk.replace(quantityOnly[0], " ");
      }

      nome = nome
        .replace(/(?:^|\\s)(?:de|do|da|dos|das)(?:\\s|$)/gi, " ")
        .replace(/\\s+/g, " ")
        .replace(/^[\\s:—–-]+|[\\s:—–-]+$/g, "")
        .trim();

      if (!nome || !quantidade) continue;

      const product = activeProducts.find((p) => normalizeName(p.nome) === normalizeName(nome));
      if (!rows.some((r) => normalizeName(r.nome) === normalizeName(nome))) {
        rows.push({
          id: crypto.randomUUID(),
          productId: product?.id ?? "",
          nome: product?.nome ?? nome,
          quantidade,
          unidade: product?.unidade_medida ?? unidade,
        });
      }
    }
    return rows;
  };

  const interpretarTexto = () => {
    const parsed = parseTextoMassa(textoMassa);
    if (!parsed.length) {
      toast.error("Não consegui identificar produtos e quantidades no texto. Você pode escrever livremente, por exemplo: 4 kg de cebola, cebola 4kg ou cebola - 4.");
      return;
    }
    setItems(parsed);
    setReciboId(null);
    // Preserve a ordem de fornecimento já informada; preparar a lista não pode apagar esse dado.
    setConfirmed(false);
    toast.success(parsed.length + " produto(s) preparados para conferência.");
  };

  const addRow = (product?: Product) => {
    const selected = product ?? activeProducts.find((p) => !items.some((item) => item.productId === p.id));
    setItems((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        productId: selected?.id ?? "",
        nome: selected?.nome ?? "",
        quantidade: "",
        unidade: selected?.unidade_medida ?? "Unidade",
      },
    ]);
    setConfirmed(false);
    setReciboId(null);
  };

  const updateItem = (id: string, patch: Partial<DraftItem>) => {
    setItems((current) =>
      current.map((item) => {
        if (item.id !== id) return item;
        if (patch.productId !== undefined) {
          const product = activeProducts.find((p) => p.id === patch.productId);
          return { ...item, ...patch, nome: product?.nome ?? item.nome, unidade: product?.unidade_medida ?? item.unidade };
        }
        return { ...item, ...patch };
      }),
    );
    setConfirmed(false);
  };

  const removeRow = (id: string) => {
    setItems((current) => current.filter((item) => item.id !== id));
    setConfirmed(false);
  };

  const confirmEntry = async () => {
    if (!destination) {
      toast.error("Escolha a unidade de destino.");
      return;
    }

    const validItems = items.filter((item) => Number(item.quantidade.replace(",", ".")) > 0);
    if (!validItems.length) {
      toast.error("Informe a quantidade de pelo menos um produto.");
      return;
    }
    if (validItems.some((item) => !item.nome.trim())) {
      toast.error("Informe o nome de todos os produtos preenchidos.");
      return;
    }

    setSaving(true);
    try {
      // Um único recibo identifica todos os produtos desta confirmação.
      const { data: numeroRecibo, error: numeroReciboError } = await (supabase as any).rpc("next_stock_receipt_number");
      // Se a migration do sequenciador ainda não tiver sido aplicada no Supabase,
      // não bloqueamos o lançamento: usamos um identificador numérico temporário
      // único para que o Recibo de Produtos seja gerado normalmente.
      const reciboId =
        !numeroReciboError && numeroRecibo
          ? String(numeroRecibo)
          : String(Date.now()).slice(-3).padStart(3, "0");
      if (numeroReciboError) {
        console.warn("Sequência do recibo indisponível; usando número temporário.", numeroReciboError);
      }
      for (const item of validItems) {
        let productId = item.productId;
        // Produto novo só é cadastrado depois da conferência e da confirmação final.
        if (!productId) {
          const created = await ensureUncategorizedProduct(item.nome.trim(), item.unidade || "Unidade");
          productId = created.id;
        }
        await addMovement({
          unit_id: destination,
          product_id: productId,
          tipo: "entrada",
          quantidade: Number(item.quantidade.replace(",", ".")),
          data,
          observacao: `PENDENTE_RECEBIMENTO | RECIBO_PRODUTOS:${reciboId}${numeroOrdemFornecimento.trim() ? ` | ORDEM_FORNECIMENTO:${numeroOrdemFornecimento.trim().replace(/\|/g, "")}` : ""} | Entrada lançada em massa pelo Administrador Principal; aguardando confirmação da unidade`,
          responsavel: null,
        });
      }

      await queryClient.invalidateQueries({ queryKey: ["products"] });
      await queryClient.invalidateQueries({ queryKey: ["stock"] });
      await queryClient.invalidateQueries({ queryKey: ["movements"] });
      setReciboId(reciboId);
      setConfirmed(true);
      toast.success(validItems.length + " produto(s) enviados em um Recibo de Produtos para confirmação da unidade.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível concluir o lançamento em massa.");
    } finally {
      setSaving(false);
    }
  };

  const imprimirRecibo = async () => {
    if (!reciboId || !destination) return;
    const unidadeNome = activeUnits.find((u) => u.id === destination)?.nome ?? "Unidade";
    const doc = await buildReceiptPdf({
      reciboId,
      unidade: unidadeNome,
      data,
      numeroOrdemFornecimento: numeroOrdemFornecimento.trim() || null,
      rows: items.filter((item) => Number(item.quantidade.replace(",", ".")) > 0).map((item) => ({
        produto: item.nome,
        quantidade: item.quantidade.replace(",", "."),
        medida: item.unidade,
      })),
    });
    doc.save(reportFileName("Recibo_de_Produtos", unidadeNome, data));
  };

  return (
    <div className="space-y-5">
      <Panel
        title="Lançamento em massa"
        description="Digite ou cole os produtos do jeito que preferir. O sistema identifica automaticamente nome, quantidade e unidade e prepara tudo para você conferir antes de lançar."
      >
        <Field label="Produtos e quantidades" htmlFor="mass-text" required>
          <textarea
            id="mass-text"
            value={textoMassa}
            onChange={(e) => { setTextoMassa(e.target.value); setConfirmed(false); }}
            placeholder={"Ex.: 4 kg de cebola, cebola 4kg, 3 pacotes de arroz; tomate 5 kg"}
            rows={9}
            className="min-h-48 w-full resize-y rounded-md border border-input bg-background px-3 py-3 text-sm outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
          />
        </Field>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            Uma linha por produto. Exemplos: <strong>CEBOLA — 4 kg</strong>,{" "}
            <strong>ARROZ — 10 unidades</strong>, <strong>LEITE — 20 litros</strong>.
          </p>
          <Button onClick={interpretarTexto} disabled={!textoMassa.trim() || saving}>
            <ClipboardList /> Preparar para conferência
          </Button>
        </div>
      </Panel>

      <Panel
        title="Dados do lançamento"
        description="Essas informações só serão aplicadas ao estoque depois da confirmação final."
      >
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Unidade de destino" htmlFor="mass-unit" required>
            <select
              id="mass-unit"
              value={destination}
              onChange={(e) => { setDestination(e.target.value); setConfirmed(false); }}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">Selecione...</option>
              {activeUnits.map((unit) => <option key={unit.id} value={unit.id}>{unit.nome}</option>)}
            </select>
          </Field>
          <Field label="Número da ordem de fornecimento (opcional)" htmlFor="mass-order">
            <Input
              id="mass-order"
              value={numeroOrdemFornecimento}
              onChange={(e) => { setNumeroOrdemFornecimento(e.target.value); setConfirmed(false); }}
              placeholder="Digite somente se quiser colocar no recibo"
            />
          </Field>
          <Field label="Data do lançamento" htmlFor="mass-date" required>
            <Input
              id="mass-date"
              type="date"
              max={todayISO()}
              value={data}
              onChange={(e) => { setData(e.target.value); setConfirmed(false); }}
            />
          </Field>
        </div>
      </Panel>

      <Panel
        title={`${items.length} produto(s) para conferir`}
        description="Nada é cadastrado ou lançado no estoque nesta etapa. Edite, remova ou ajuste os itens e só depois clique em confirmar."
      >
        {items.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center">
            <PackagePlus className="mx-auto size-8 text-muted-foreground" />
            <p className="mt-3 font-medium">Nenhum produto preparado</p>
            <p className="mt-1 text-sm text-muted-foreground">Cole a lista acima e clique em “Preparar para conferência”.</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-3 py-2 text-left">Produto</th>
                    <th className="px-3 py-2 text-left">Quantidade</th>
                    <th className="px-3 py-2 text-left">Unidade</th>
                    <th className="px-3 py-2 text-left">Status</th>
                    <th className="px-3 py-2 text-right">Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => {
                    const isNew = !item.productId;
                    return (
                      <tr key={item.id} className="border-t">
                        <td className="px-3 py-2">
                          {isNew ? (
                            <div>
                              <Input value={item.nome} onChange={(e) => updateItem(item.id, { nome: e.target.value })} placeholder="Nome do produto" />
                              <span className="mt-1 block text-[11px] text-muted-foreground">Será cadastrado automaticamente após a confirmação.</span>
                            </div>
                          ) : (
                            <select
                              value={item.productId}
                              onChange={(e) => updateItem(item.id, { productId: e.target.value })}
                              className="h-9 w-full rounded-md border border-input bg-background px-2"
                            >
                              <option value="">Selecione...</option>
                              {activeProducts.map((product) => <option key={product.id} value={product.id}>{product.nome}</option>)}
                            </select>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <Input inputMode="decimal" value={item.quantidade} onChange={(e) => updateItem(item.id, { quantidade: e.target.value })} placeholder="0" />
                        </td>
                        <td className="px-3 py-2">
                          <select\n                            value={item.unidade}\n                            onChange={(e) => updateItem(item.id, { unidade: e.target.value })}\n                            className="h-9 w-full rounded-md border border-input bg-background px-2"\n                          >\n                            {MASS_UNITS.map((unit) => <option key={unit} value={unit}>{unit}</option>)}\n                          </select>
                        </td>
                        <td className="px-3 py-2">
                          <span className={isNew ? "text-xs font-medium text-warning" : "text-xs font-medium text-success"}>
                            {isNew ? "Novo — cadastrar" : "Já cadastrado"}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right">
                          <Button variant="ghost" size="icon" aria-label="Excluir produto da lista" onClick={() => removeRow(item.id)}>
                            <Trash2 className="size-4 text-destructive" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <Button variant="outline" onClick={() => addRow()} disabled={saving}>
                <Plus /> Adicionar produto
              </Button>
              <div className="flex flex-wrap gap-2">
                {confirmed && reciboId && (
                  <Button variant="outline" onClick={imprimirRecibo} disabled={saving}>
                    <ClipboardList /> Imprimir recibo em PDF
                  </Button>
                )}
                <Button onClick={confirmEntry} disabled={saving || confirmed || !destination}>
                  {saving ? <Loader2 className="animate-spin" /> : <Check />}
                  {confirmed ? "Lançamento confirmado" : "Confirmar lançamento"}
                </Button>
              </div>
            </div>

            <div className="mt-4 rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm">
              <strong>Importante:</strong> o sistema sempre para nesta tela de conferência. Produtos novos só serão cadastrados e as quantidades só serão lançadas no estoque quando você clicar em <strong>Confirmar lançamento</strong>.
            </div>
          </>
        )}
      </Panel>
    </div>
  );
}
