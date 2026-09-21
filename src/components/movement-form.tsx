import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, PackageMinus, PackagePlus } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useUnit } from "@/hooks/useUnit";
import {
  addMovement,
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
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const { data: products = [] } = useQuery(productsOptions(false));
  const { data: stock = [] } = useQuery(stockOptions(unitId));
  const { data: recent = [] } = useQuery(movementsOptions({ unitId, tipo, limit: 8 }));

  const [productId, setProductId] = useState<string | null>(null);
  const [quantidade, setQuantidade] = useState("");
  const [data, setData] = useState(todayISO());
  const [observacao, setObservacao] = useState("");
  const [saving, setSaving] = useState(false);

  const product = products.find((p) => p.id === productId);
  const current = stock.find((s) => s.product.id === productId)?.quantity ?? 0;
  const qty = Number(quantidade.replace(",", "."));
  const isEntrada = tipo === "entrada";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
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
