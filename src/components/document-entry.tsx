import { useMemo, useState } from "react";
import { Check, Loader2, Plus, Trash2, PackagePlus } from "lucide-react";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useUnit } from "@/hooks/useUnit";
import { useAuth } from "@/hooks/useAuth";
import { addMovement, productsOptions, unitsOptions, type Product } from "@/lib/queries";
import { todayISO } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, Panel } from "@/components/ui-kit";

type DraftItem = {
  id: string;
  productId: string;
  nome: string;
  quantidade: string;
  unidade: string;
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

  const activeUnits = useMemo(() => units.filter((u) => u.ativo), [units]);
  const activeProducts = useMemo(
    () => products.filter((p) => p.ativo).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
    [products],
  );

  if (!isAdmin) return null;

  const addRow = (product?: Product) => {
    const selected = product ?? activeProducts.find((p) => !items.some((item) => item.productId === p.id));
    setItems((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        productId: selected?.id ?? "",
        nome: selected?.nome ?? "",
        quantidade: "",
        unidade: selected?.unidade_medida ?? "unidade",
      },
    ]);
    setConfirmed(false);
  };

  const updateItem = (id: string, patch: Partial<DraftItem>) => {
    setItems((current) =>
      current.map((item) => {
        if (item.id !== id) return item;
        if (patch.productId) {
          const product = activeProducts.find((p) => p.id === patch.productId);
          return {
            ...item,
            ...patch,
            nome: product?.nome ?? item.nome,
            unidade: product?.unidade_medida ?? item.unidade,
          };
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

  const fillAllWithZero = () => {
    setItems(
      activeProducts.map((product) => ({
        id: crypto.randomUUID(),
        productId: product.id,
        nome: product.nome,
        quantidade: "",
        unidade: product.unidade_medida || "unidade",
      })),
    );
    setConfirmed(false);
    toast.success(activeProducts.length + " produtos adicionados à lista.");
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

    if (validItems.some((item) => !item.productId)) {
      toast.error("Selecione o produto em todas as linhas preenchidas.");
      return;
    }

    setSaving(true);
    try {
      for (const item of validItems) {
        await addMovement({
          unit_id: destination,
          product_id: item.productId,
          tipo: "entrada",
          quantidade: Number(item.quantidade.replace(",", ".")),
          data,
          observacao: "Entrada lançada em massa pelo Administrador Principal",
          responsavel: null,
        });
      }

      await queryClient.invalidateQueries({ queryKey: ["products"] });
      await queryClient.invalidateQueries({ queryKey: ["stock"] });
      await queryClient.invalidateQueries({ queryKey: ["movements"] });
      setConfirmed(true);
      toast.success(validItems.length + " produto(s) lançado(s) no estoque.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível concluir o lançamento em massa.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <Panel
        title="Lançamento em massa"
        description="Registre várias entradas de estoque de uma só vez. Informe as quantidades dos produtos e confirme apenas quando tudo estiver conferido."
      >
        <div className="grid gap-4 md:grid-cols-3">
          <Field label="Unidade de destino" htmlFor="mass-unit" required>
            <select
              id="mass-unit"
              value={destination}
              onChange={(e) => { setDestination(e.target.value); setConfirmed(false); }}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">Selecione...</option>
              {activeUnits.map((unit) => (
                <option key={unit.id} value={unit.id}>{unit.nome}</option>
              ))}
            </select>
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

          <div className="flex items-end">
            <Button variant="outline" className="w-full" onClick={fillAllWithZero} disabled={!activeProducts.length || saving}>
              <PackagePlus /> Carregar todos os produtos
            </Button>
          </div>
        </div>
      </Panel>

      <Panel
        title={`${items.length} produto(s) na lista`}
        description="Digite somente as quantidades que deseja lançar. Linhas sem quantidade não serão lançadas."
      >
        {items.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center">
            <PackagePlus className="mx-auto size-8 text-muted-foreground" />
            <p className="mt-3 font-medium">Nenhum produto adicionado</p>
            <p className="mt-1 text-sm text-muted-foreground">Adicione os produtos que deseja lançar ou carregue todos de uma vez.</p>
            <Button className="mt-4" onClick={() => addRow()} disabled={!activeProducts.length}>
              <Plus /> Adicionar produto
            </Button>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-3 py-2 text-left">Produto</th>
                    <th className="px-3 py-2 text-left">Quantidade</th>
                    <th className="px-3 py-2 text-left">Unidade</th>
                    <th className="px-3 py-2 text-right">Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id} className="border-t">
                      <td className="px-3 py-2">
                        <select
                          value={item.productId}
                          onChange={(e) => updateItem(item.id, { productId: e.target.value })}
                          className="h-9 w-full rounded-md border border-input bg-background px-2"
                        >
                          <option value="">Selecione...</option>
                          {activeProducts.map((product) => (
                            <option key={product.id} value={product.id}>{product.nome}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          inputMode="decimal"
                          value={item.quantidade}
                          onChange={(e) => updateItem(item.id, { quantidade: e.target.value })}
                          placeholder="0"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <Input value={item.unidade} readOnly className="bg-muted/30" />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Button variant="ghost" size="icon" aria-label="Excluir produto da lista" onClick={() => removeRow(item.id)}>
                          <Trash2 className="size-4 text-destructive" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <Button variant="outline" onClick={() => addRow()} disabled={saving}>
                <Plus /> Adicionar produto
              </Button>
              <Button onClick={confirmEntry} disabled={saving || confirmed || !destination}>
                {saving ? <Loader2 className="animate-spin" /> : <Check />}
                {confirmed ? "Lançamento confirmado" : "Confirmar lançamento em massa"}
              </Button>
            </div>
          </>
        )}
      </Panel>
    </div>
  );
}
