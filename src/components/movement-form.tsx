import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, PackageMinus, PackagePlus, Send } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useUnit } from "@/hooks/useUnit";
import {
  addMovement,
  ensureUncategorizedProduct,
  movementsOptions,
  productsOptions,
  stockOptions,
  unitsOptions,
  sendFromCentralDeposit,
  type MovementType,
} from "@/lib/queries";
import { formatQty, formatDate, todayISO } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState, Field, Panel, StatCard, TypeBadge } from "@/components/ui-kit";
import { ProductSelect } from "@/components/pickers";
import { supabase } from "@/integrations/supabase/client";

export function MovementForm({ tipo }: { tipo: Extract<MovementType, "entrada" | "saida"> }) {
  const { unitId, unit } = useUnit();
  const { profile, isAdmin, isViewer } = useAuth();
  const queryClient = useQueryClient();
  const { data: products = [] } = useQuery(productsOptions(false));
  const { data: stock = [] } = useQuery(stockOptions(unitId));
  const { data: recent = [] } = useQuery(movementsOptions({ unitId, tipo, limit: 8 }));

  const [productId, setProductId] = useState<string | null>(null);
  const [quantidade, setQuantidade] = useState("");
  const [data, setData] = useState(todayISO());
  const [observacao, setObservacao] = useState("");
  const [saving, setSaving] = useState(false);

  const [massaTexto, setMassaTexto] = useState("");
  const [massaItens, setMassaItens] = useState<Array<{ nome: string; quantidade: number; unidade: string }>>([]);
  const [massaSaving, setMassaSaving] = useState(false);
  const isCentralUnit = unit?.nome.trim().toLowerCase() === "gabinete semads";

  const parseMassa = (texto: string) => {
    const unidades = ["KG", "PCT", "UND", "UN", "L", "LT", "CX", "FD", "SC", "DZ", "G", "ML"];
    const itens: Array<{ nome: string; quantidade: number; unidade: string }> = [];
    const erros: string[] = [];

    texto.split(/\r?\n/).map((linha) => linha.trim()).filter(Boolean).forEach((linha, index) => {
      const normalizada = linha.replace(/[—–]/g, "-").replace(/\s+/g, " ").trim();
      const match = normalizada.match(/^(.+?)\s*(?:-|:)\s*([0-9]+(?:[,.][0-9]+)?)\s*([A-Za-zÀ-ÿ]+)?$/)
        || normalizada.match(/^(.+?)\s+([0-9]+(?:[,.][0-9]+)?)\s*([A-Za-zÀ-ÿ]+)$/);

      if (!match) {
        erros.push(`Linha ${index + 1}: "${linha}"`);
        return;
      }

      const nome = (match[1] ?? "").trim().replace(/[-:]+$/, "").trim();
      const quantidade = Number((match[2] ?? "0").replace(",", "."));
      const unidadeInformada = (match[3] ?? "UND").toUpperCase();
      const unidade = unidadeInformada === "UN" ? "UND" : unidadeInformada === "LT" ? "L" : unidadeInformada;

      if (!nome || !Number.isFinite(quantidade) || quantidade <= 0) {
        erros.push(`Linha ${index + 1}: quantidade inválida`);
        return;
      }
      if (!unidades.includes(unidade)) {
        erros.push(`Linha ${index + 1}: unidade "${unidadeInformada}" não reconhecida`);
        return;
      }
      itens.push({ nome, quantidade, unidade });
    });

    return { itens, erros };
  };

  const prepararMassa = () => {
    const { itens, erros } = parseMassa(massaTexto);
    if (erros.length) {
      toast.error(`Corrija: ${erros.join(" | ")}`);
      return;
    }
    if (!itens.length) {
      toast.error("Cole pelo menos um produto.");
      return;
    }
    setMassaItens(itens);
  };

  const confirmarMassa = async () => {
    if (isViewer) {
      toast.error("O Gabinete possui acesso somente para consulta e relatórios.");
      return;
    }
    if (!isEntrada || !isAdmin) {
      toast.error("Somente o CEO/Administrador Principal pode registrar entradas.");
      return;
    }
    if (!unitId || !massaItens.length) return;

    setMassaSaving(true);
    try {
      // Entradas para unidades ficam pendentes até a confirmação do usuário.
      // O Depósito Central recebe lançamentos diretamente no próprio estoque.
      let receiptId: string | null = null;
      if (!isCentralUnit) {
        const { data: nextReceipt, error: receiptError } = await (supabase as any).rpc("next_stock_receipt_number");
        if (receiptError || !nextReceipt) throw new Error("Não foi possível gerar o número do recibo.");
        receiptId = String(nextReceipt);
      }

      const produtosCriados = new Map<string, { id: string; unidade_medida: string }>();
      for (const item of massaItens) {
        const key = item.nome.toLocaleLowerCase("pt-BR");
        let produto = produtosCriados.get(key);
        if (!produto) {
          const encontrado = products.find((p) => p.nome.trim().toLocaleLowerCase("pt-BR") === key);
          if (encontrado) {
            const unidadeAtual = (encontrado.unidade_medida ?? "UND").toUpperCase();
            const unidadeNormalizada = unidadeAtual === "UN" ? "UND" : unidadeAtual === "LT" ? "L" : unidadeAtual;
            if (unidadeNormalizada !== item.unidade) {
              throw new Error(`O produto "${item.nome}" já está cadastrado como ${unidadeNormalizada}, mas o lançamento informa ${item.unidade}.`);
            }
            produto = { id: encontrado.id, unidade_medida: encontrado.unidade_medida };
          } else {
            const novo = await ensureUncategorizedProduct(item.nome, item.unidade);
            produto = { id: novo.id, unidade_medida: novo.unidade_medida };
          }
          produtosCriados.set(key, produto);
        }

        await addMovement({
          unit_id: unitId,
          product_id: produto.id,
          tipo: "entrada",
          quantidade: item.quantidade,
          data,
          observacao: isCentralUnit
            ? "Lançamento em massa no Depósito Central"
            : "PENDENTE_RECEBIMENTO | RECIBO_PRODUTOS:" + receiptId + " | Lançamento em massa pelo CEO; aguardando confirmação da unidade",
          responsavel: profile?.nome ?? null,
        });
      }

      await queryClient.invalidateQueries({ queryKey: ["stock", unitId] });
      await queryClient.invalidateQueries({ queryKey: ["movements"] });
      toast.success(isCentralUnit
        ? `${massaItens.length} produto(s) lançados diretamente no estoque do Depósito Central.`
        : `Recibo nº ${receiptId} criado. A unidade precisa confirmar para contabilizar o estoque.`);
      setMassaTexto("");
      setMassaItens([]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível concluir o lançamento em massa.");
    } finally {
      setMassaSaving(false);
    }
  };

  const product = products.find((p) => p.id === productId);
  const current = stock.find((s) => s.product.id === productId)?.quantity ?? 0;
  const qty = Number(quantidade.replace(",", "."));
  const isEntrada = tipo === "entrada";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isEntrada && !isAdmin) {
      toast.error("Somente o CEO/Administrador Principal pode registrar entradas.");
      return;
    }
    if (!isEntrada && isViewer) {
      toast.error("O Gabinete possui acesso somente para consulta e relatórios.");
      return;
    }
    if (!unitId) {
      toast.error("Selecione a unidade.");
      return;
    }
    if (!productId) {
      toast.error("Selecione o produto.");
      return;
    }
    if (!quantidade.trim() || Number.isNaN(qty) || qty <= 0) {
      toast.error("Informe uma quantidade maior que zero.");
      return;
    }
    setSaving(true);
    try {
      let movementObservation = observacao.trim() || null;
      let receiptId: string | null = null;

      if (isEntrada && !isCentralUnit) {
        const { data: nextReceipt, error: receiptError } = await (supabase as any).rpc("next_stock_receipt_number");
        if (receiptError || !nextReceipt) throw new Error("Não foi possível gerar o número do recibo.");
        receiptId = String(nextReceipt);
        movementObservation = [
          "PENDENTE_RECEBIMENTO",
          "RECIBO_PRODUTOS:" + receiptId,
          observacao.trim(),
        ].filter(Boolean).join(" | ");
      }

      await addMovement({
        unit_id: unitId,
        product_id: productId,
        tipo,
        quantidade: qty,
        data,
        observacao: movementObservation,
        responsavel: profile?.nome ?? null,
      });
      queryClient.invalidateQueries({ queryKey: ["stock", unitId] });
      queryClient.invalidateQueries({ queryKey: ["received-entries", unitId] });
      queryClient.invalidateQueries({ queryKey: ["pending-receipts", unitId] });
      queryClient.invalidateQueries({ queryKey: ["movements"] });
      queryClient.invalidateQueries({ queryKey: ["checks"] });
      toast.success(
        isEntrada
          ? isCentralUnit
            ? "Entrada de " + formatQty(qty) + " " + (product?.unidade_medida ?? "") + " registrada diretamente no estoque do Depósito Central."
            : "Recibo nº " + receiptId + " criado. A entrada só será contabilizada após a confirmação da unidade."
          : "Saída de " + formatQty(qty) + " " + (product?.unidade_medida ?? "") + " registrada.",
      );
      setQuantidade("");
      setObservacao("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível registrar.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
      <Panel
        title={isEntrada ? "Registrar entrada de material" : "Registrar saída de material"}
        description={
          unit ? `Unidade: ${unit.nome}` : "Nenhuma unidade cadastrada. Peça ao administrador."
        }
      >
        <form onSubmit={submit} className="space-y-4">
          <Field label="Produto" htmlFor="produto" required>
            <ProductSelect
              id="produto"
              products={products}
              value={productId}
              onChange={setProductId}
              placeholder="Buscar produto..."
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Quantidade"
              htmlFor="quantidade"
              required
              hint={product ? `Unidade de medida: ${product.unidade_medida}` : "Ex.: 12 ou 3,5"}
            >
              <Input
                id="quantidade"
                inputMode="decimal"
                autoComplete="off"
                value={quantidade}
                onChange={(e) => setQuantidade(e.target.value)}
                placeholder="0"
              />
            </Field>
            <Field label="Data do lançamento" htmlFor="data" required>
              <Input
                id="data"
                type="date"
                value={data}
                max={todayISO()}
                onChange={(e) => setData(e.target.value)}
              />
            </Field>
          </div>

          <Field label="Observação" htmlFor="observacao" hint="Opcional. Ex.: origem, solicitante, nota.">
            <Textarea
              id="observacao"
              rows={3}
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              placeholder="Ex.: recebimento da doação da feira"
            />
          </Field>

          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={saving || !unitId}>
              {saving ? <Loader2 className="animate-spin" /> : isEntrada ? <PackagePlus /> : <PackageMinus />}
              {isEntrada ? "Registrar entrada" : "Registrar saída"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setProductId(null);
                setQuantidade("");
                setObservacao("");
                setData(todayISO());
              }}
            >
              Limpar
            </Button>
          </div>
        </form>
      </Panel>

      {isEntrada && isAdmin && (
        <Panel
          title="Lançamento de documento"
          description="Digite ou cole a lista de produtos, com nome, quantidade e unidade."
        >
          <div className="space-y-4">
            <Textarea
              rows={14}
              maxLength={10000}
              value={massaTexto}
              onChange={(e) => setMassaTexto(e.target.value)}
              placeholder={"Digite ou cole até 10.000 caracteres, por exemplo:\nCEBOLA — 4 KG\nLIMÃO — 3 KG\nSALSICHA — 5 PCT\nARROZ — 10 PCT"}
            />
            <div className="flex justify-end text-xs text-muted-foreground">
              {massaTexto.length.toLocaleString("pt-BR")} / 10.000 caracteres
            </div>
            <div className="flex flex-wrap gap-3">
              <Button type="button" variant="outline" onClick={prepararMassa} disabled={!massaTexto.trim() || massaSaving}>
                Processar lista
              </Button>
              <Button type="button" onClick={confirmarMassa} disabled={!massaItens.length || massaSaving}>
                {massaSaving ? <Loader2 className="animate-spin" /> : <PackagePlus />}
                Confirmar lançamento
              </Button>
              {massaItens.length > 0 && (
                <Button type="button" variant="ghost" onClick={() => setMassaItens([])}>
                  Limpar prévia
                </Button>
              )}
            </div>

            {massaItens.length > 0 && (
              <div className="rounded-lg border border-border/70 overflow-hidden">
                <div className="grid grid-cols-[1fr_100px_80px] gap-2 bg-muted/50 px-3 py-2 text-xs font-semibold">
                  <span>Produto</span><span>Quantidade</span><span>Unidade</span>
                </div>
                {massaItens.map((item, index) => (
                  <div key={index} className="grid grid-cols-[1fr_100px_80px] gap-2 border-t border-border/60 px-3 py-2 text-sm">
                    <span className="truncate">{item.nome}</span>
                    <span className="tabular-nums">{formatQty(item.quantidade)}</span>
                    <span className="font-medium">{item.unidade}</span>
                  </div>
                ))}
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              Aceita KG, PCT, UND, L, CX, FD, SC, DZ, G e ML. Uma linha por produto.
            </p>
          </div>
        </Panel>
      )}

      <div className="space-y-5">
        <StatCard
          label={isEntrada ? "Saldo atual do produto" : "Disponível para saída"}
          value={`${formatQty(current)} ${product?.unidade_medida ?? ""}`}
          hint={product ? product.nome : "Selecione um produto para ver o saldo atual."}
          tone={current <= 0 ? "danger" : "neutral"}
        />

        <Panel title="Lançamentos recentes" bodyClassName="p-0">
          {recent.length === 0 ? (
            <div className="p-4">
              <EmptyState title="Nenhum lançamento ainda" description="Os registros desta unidade aparecem aqui." />
            </div>
          ) : (
            <ul className="divide-y divide-border/70">
              {recent.map((m) => (
                <li key={m.id} className="flex items-center gap-3 px-4 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{m.products?.nome ?? "Produto"}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {formatDate(m.data)}
                      {m.responsavel ? ` · ${m.responsavel}` : ""}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm font-semibold tabular-nums">
                    {formatQty(m.quantidade)}
                  </span>
                  <TypeBadge tipo={m.tipo} />
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}


export function CentralDispatchForm() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const { data: products = [] } = useQuery(productsOptions(false));
  const { data: units = [] } = useQuery(unitsOptions(false));
  const central = units.find((u) => u.nome.trim().toLowerCase() === "gabinete semads");
  const { data: centralStock = [], isPending: stockLoading } = useQuery(stockOptions(central?.id ?? null));

  const [productId, setProductId] = useState<string | null>(null);
  const [destinationId, setDestinationId] = useState("");
  const [quantidade, setQuantidade] = useState("");
  const [data, setData] = useState(todayISO());
  const [observacao, setObservacao] = useState("");
  const [ordemFornecimento, setOrdemFornecimento] = useState("");
  const [saving, setSaving] = useState(false);

  const product = products.find((p) => p.id === productId);
  const current = centralStock.find((s) => s.product.id === productId)?.quantity ?? 0;
  const qty = Number(quantidade.replace(",", "."));
  const destinations = units.filter((u) => u.id !== central?.id);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!central?.id) {
      toast.error("O Gabinete SEMADS não está cadastrado como Depósito Central.");
      return;
    }
    if (!destinationId) {
      toast.error("Selecione a unidade que receberá os materiais.");
      return;
    }
    if (!productId) {
      toast.error("Selecione o produto.");
      return;
    }
    if (!quantidade.trim() || Number.isNaN(qty) || qty <= 0) {
      toast.error("Informe uma quantidade maior que zero.");
      return;
    }
    if (qty > current) {
      toast.error(`Estoque insuficiente no Depósito Central. Disponível: ${formatQty(current)}.`);
      return;
    }

    const destination = destinations.find((u) => u.id === destinationId);
    if (!destination) {
      toast.error("Unidade de destino inválida.");
      return;
    }

    const confirmed = window.confirm(
      `Enviar ${formatQty(qty)} ${product?.unidade_medida ?? ""} de ${product?.nome ?? "produto"} para ${destination.nome}?\\n\\nO estoque do Depósito Central será reduzido e será gerado um recibo para confirmação da unidade.`
    );
    if (!confirmed) return;

    setSaving(true);
    try {
      const receipt = await sendFromCentralDeposit({
        product_id: productId,
        destination_unit_id: destinationId,
        quantidade: qty,
        data,
        observacao: observacao.trim() || null,
        receipt_number: ordemFornecimento.trim() || null,
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["stock"] }),
        queryClient.invalidateQueries({ queryKey: ["movements"] }),
        queryClient.invalidateQueries({ queryKey: ["received-entries"] }),
      ]);
      toast.success(`Recibo nº ${receipt} gerado. Envio para ${destination.nome} registrado.`);
      setProductId(null);
      setDestinationId("");
      setQuantidade("");
      setObservacao("");
      setOrdemFornecimento("");
      setData(todayISO());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível enviar os materiais.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
      <Panel
        title="Enviar materiais do Depósito Central"
        description="O Gabinete SEMADS é o Depósito Central. Selecione os materiais e a unidade que receberá o envio."
      >
        <form onSubmit={submit} className="space-y-4">
          <Field label="Unidade de destino" htmlFor="destino-deposito" required>
            <select
              id="destino-deposito"
              value={destinationId}
              onChange={(e) => setDestinationId(e.target.value)}
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="">Selecione a unidade...</option>
              {destinations.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
            </select>
          </Field>

          <Field label="Produto" htmlFor="produto-deposito" required>
            <ProductSelect
              id="produto-deposito"
              products={products}
              value={productId}
              onChange={setProductId}
              placeholder="Buscar produto..."
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Quantidade" htmlFor="quantidade-deposito" required
              hint={product ? `Unidade de medida: ${product.unidade_medida}` : "Ex.: 12 ou 3,5"}>
              <Input
                id="quantidade-deposito"
                inputMode="decimal"
                value={quantidade}
                onChange={(e) => setQuantidade(e.target.value)}
                placeholder="0"
              />
            </Field>
            <Field label="Data do envio" htmlFor="data-deposito" required>
              <Input id="data-deposito" type="date" value={data} max={todayISO()} onChange={(e) => setData(e.target.value)} />
            </Field>
          </div>

          <Field
            label="Número da ordem de fornecimento"
            htmlFor="ordem-fornecimento"
            hint="Opcional. Se preenchido, será o número do recibo; se deixar em branco, o número é gerado automaticamente."
          >
            <Input
              id="ordem-fornecimento"
              autoComplete="off"
              value={ordemFornecimento}
              onChange={(e) => setOrdemFornecimento(e.target.value)}
              placeholder="Ex.: OF-2026/015"
              maxLength={60}
            />
          </Field>

          <Field label="Observação" htmlFor="observacao-deposito" hint="Opcional. Ex.: solicitação da unidade.">
            <Textarea
              id="observacao-deposito"
              rows={3}
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              placeholder="Ex.: reposição do estoque da unidade"
            />
          </Field>

          <Button type="submit" disabled={saving || stockLoading || !central?.id}>
            {saving ? <Loader2 className="animate-spin" /> : <Send />}
            {saving ? "Enviando..." : "Enviar e gerar recibo"}
          </Button>
        </form>
      </Panel>

      <div className="space-y-5">
        <StatCard
          label="Disponível no Depósito Central"
          value={`${formatQty(current)} ${product?.unidade_medida ?? ""}`}
          hint={product ? product.nome : "Selecione um produto para consultar o saldo."}
          tone={current <= 0 ? "danger" : "neutral"}
        />
        <Panel title="Fluxo do envio">
          <ol className="space-y-2 text-sm text-muted-foreground">
            <li>1. O material sai do estoque do Depósito Central.</li>
            <li>2. Um Recibo de Produtos é gerado automaticamente.</li>
            <li>3. A unidade recebe o recibo e confirma o recebimento.</li>
            <li>4. O material só entra no estoque da unidade após a confirmação.</li>
          </ol>
          <p className="mt-4 text-xs text-muted-foreground">
            O cadastro de produtos continua sendo exclusivo do CEO.
          </p>
        </Panel>
      </div>
    </div>
  );
}
