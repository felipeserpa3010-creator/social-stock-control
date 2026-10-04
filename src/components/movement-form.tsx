import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, PackageMinus, PackagePlus } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useUnit } from "@/hooks/useUnit";
import {
  addMovement,
  ensureUncategorizedProduct,
  movementsOptions,
  productsOptions,
  stockOptions,
  type MovementType,
} from "@/lib/queries";
import { formatQty, formatDate, todayISO } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState, Field, Panel, StatCard, TypeBadge } from "@/components/ui-kit";
import { ProductSelect } from "@/components/pickers";

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

      const nome = match[1].trim().replace(/[-:]+$/, "").trim();
      const quantidade = Number(match[2].replace(",", "."));
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
          observacao: "Lançamento em massa",
          responsavel: profile?.nome ?? null,
        });
      }

      await queryClient.invalidateQueries({ queryKey: ["stock", unitId] });
      await queryClient.invalidateQueries({ queryKey: ["movements"] });
      toast.success(`${massaItens.length} produto(s) lançados no estoque.`);
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
      await addMovement({
        unit_id: unitId,
        product_id: productId,
        tipo,
        quantidade: qty,
        data,
        observacao: observacao.trim() || null,
        responsavel: profile?.nome ?? null,
      });
      queryClient.invalidateQueries({ queryKey: ["stock", unitId] });
      queryClient.invalidateQueries({ queryKey: ["movements"] });
      queryClient.invalidateQueries({ queryKey: ["checks"] });
      toast.success(
        isEntrada
          ? `Entrada de ${formatQty(qty)} ${product?.unidade_medida ?? ""} registrada.`
          : `Saída de ${formatQty(qty)} ${product?.unidade_medida ?? ""} registrada.`,
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
          title="Lançamento em massa"
          description="Cole uma lista com nome, quantidade e unidade. Ex.: CEBOLA — 4 KG"
        >
          <div className="space-y-4">
            <Textarea
              rows={8}
              value={massaTexto}
              onChange={(e) => setMassaTexto(e.target.value)}
              placeholder={"CEBOLA — 4 KG\nLIMÃO — 3 KG\nSALSICHA — 5 PCT\nARROZ — 10 PCT"}
            />
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
