import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ClipboardCheck, Loader2, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useUnit } from "@/hooks/useUnit";
import {
  createStockCheck,
  productsOptions,
  stockOptions,
  type CheckInput,
} from "@/lib/queries";
import { formatDate, formatQty, todayISO } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState, Field, PageHeader, Panel } from "@/components/ui-kit";

export const Route = createFileRoute("/_authenticated/conferencia")({
  head: () => ({
    meta: [
      { title: "Conferência de estoque — Controle de Inventário" },
      {
        name: "description",
        content: "Conferência física dos produtos da dispensa, com registro de diferenças.",
      },
      { property: "og:title", content: "Conferência de estoque — Controle de Inventário" },
      {
        property: "og:description",
        content: "Conferência física dos produtos com registro de diferenças e ajustes.",
      },
    ],
  }),
  component: CheckPage,
});

function CheckPage() {
  const { unitId, unit, loading } = useUnit();
  const { profile } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: products = [], isPending } = useQuery(productsOptions(false));
  const { data: stock = [] } = useQuery(stockOptions(unitId));

  const registered = useMemo(() => {
    const map = new Map<string, number>();
    stock.forEach((s) => map.set(s.product.id, Number(s.quantity)));
    return map;
  }, [stock]);

  const [counted, setCounted] = useState<Record<string, string>>({});
  const [data, setData] = useState(todayISO());
  const [responsavel, setResponsavel] = useState(profile?.nome ?? "");
  const [obs, setObs] = useState("");
  const [saving, setSaving] = useState(false);

  const activeProducts = useMemo(
    () =>
      products
        .filter((p) => p.ativo)
        .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
    [products],
  );

  const filled = activeProducts.filter((p) => (counted[p.id] ?? "").trim() !== "");
  const diffTotal = filled.reduce((acc, p) => {
    const n = Number(String(counted[p.id]).replace(",", "."));
    return acc + (Number.isNaN(n) ? 0 : n - (registered.get(p.id) ?? 0));
  }, 0);

  const fillAll = () => {
    const next: Record<string, string> = {};
    activeProducts.forEach((p) => {
      next[p.id] = String(registered.get(p.id) ?? 0);
    });
    setCounted(next);
    toast.info("Quantidades registradas copiadas para conferência.");
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!unitId) {
      toast.error("Selecione a unidade.");
      return;
    }
    if (!responsavel.trim()) {
      toast.error("Informe o responsável pela conferência.");
      return;
    }
    const items: CheckInput["items"] = [];
    for (const p of activeProducts) {
      const raw = (counted[p.id] ?? "").trim();
      if (!raw) continue;
      const qty = Number(raw.replace(",", "."));
      if (Number.isNaN(qty) || qty < 0) {
        toast.error(`Quantidade inválida para ${p.nome}.`);
        return;
      }
      items.push({ product_id: p.id, quantity: qty });
    }
    if (items.length === 0) {
      toast.error("Informe ao menos um produto conferido.");
      return;
    }
    setSaving(true);
    try {
      await createStockCheck({
        unit_id: unitId,
        data_conferencia: data,
        responsavel: responsavel.trim(),
        observacao: obs.trim() || null,
        items,
      });
      queryClient.invalidateQueries({ queryKey: ["stock", unitId] });
      queryClient.invalidateQueries({ queryKey: ["movements"] });
      queryClient.invalidateQueries({ queryKey: ["checks"] });
      toast.success(`Conferência salva com ${items.length} produtos.`);
      setCounted({});
      setObs("");
      navigate({ to: "/conferencias" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível salvar a conferência.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Conferência de estoque"
        description="Contagem física dos produtos. O estoque aproximado é atualizado e as diferenças ficam no histórico."
        actions={
          <Button type="button" variant="outline" size="sm" onClick={fillAll} disabled={!activeProducts.length}>
            <Wand2 /> Copiar registrado
          </Button>
        }
      />

      <form onSubmit={submit} className="space-y-5">
        <Panel
          title="Dados da conferência"
          description={unit ? `Unidade: ${unit.nome}` : "Nenhuma unidade disponível."}
        >
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Data da conferência" htmlFor="data-conf" required>
              <Input
                id="data-conf"
                type="date"
                value={data}
                max={todayISO()}
                onChange={(e) => setData(e.target.value)}
              />
            </Field>
            <Field label="Responsável" htmlFor="resp-conf" required hint="Quem esteve presente na contagem.">
              <Input
                id="resp-conf"
                value={responsavel}
                onChange={(e) => setResponsavel(e.target.value)}
                placeholder="Nome do responsável"
              />
            </Field>
            <Field
              label="Produtos conferidos"
              htmlFor="conf-count"
              hint={`${filled.length} de ${activeProducts.length} informados`}
            >
              <Input
                id="conf-count"
                value={`${filled.length} / ${activeProducts.length}`}
                readOnly
                className="bg-muted/50"
              />
            </Field>
          </div>
          <div className="mt-4">
            <Field label="Observação" htmlFor="obs-conf" hint="Ex.: contagem com a coordenação e duas servidoras.">
              <Textarea
                id="obs-conf"
                rows={2}
                value={obs}
                onChange={(e) => setObs(e.target.value)}
                placeholder="Detalhes da conferência"
              />
            </Field>
          </div>
        </Panel>

        <Panel
          title="Contagem dos produtos"
          description="Deixe em branco os produtos que não forem conferidos agora."
          bodyClassName="p-0"
        >
          {loading || isPending ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-12 animate-pulse rounded-md bg-muted" />
              ))}
            </div>
          ) : activeProducts.length === 0 ? (
            <div className="p-4">
              <EmptyState title="Nenhum produto ativo" description="Cadastre produtos para conferir." />
            </div>
          ) : (
            <ul>
              {activeProducts.map((p) => {
                const reg = registered.get(p.id) ?? 0;
                const raw = counted[p.id] ?? "";
                const n = raw.trim() === "" ? null : Number(raw.replace(",", "."));
                const diff = n !== null && !Number.isNaN(n) ? n - reg : null;
                return (
                  <li
                    key={p.id}
                    className="flex flex-wrap items-center gap-3 border-b border-border/70 px-4 py-2.5 last:border-0"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{p.nome}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {p.categories?.nome ?? "Sem categoria"} · registrado {formatQty(reg)}{" "}
                        {p.unidade_medida}
                      </p>
                    </div>
                    <Input
                      inputMode="decimal"
                      aria-label={`Quantidade conferida de ${p.nome}`}
                      value={raw}
                      onChange={(e) => setCounted((prev) => ({ ...prev, [p.id]: e.target.value }))}
                      placeholder="—"
                      className="w-24 text-right tabular-nums"
                    />
                    <span
                      className={`w-24 shrink-0 text-right text-xs font-semibold tabular-nums ${
                        diff === null || diff === 0
                          ? "text-muted-foreground"
                          : diff > 0
                            ? "text-success"
                            : "text-destructive"
                      }`}
                    >
                      {diff === null ? "" : `${diff > 0 ? "+" : ""}${formatQty(diff)}`}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4">
          <p className="text-sm text-muted-foreground">
            Diferença total apurada:{" "}
            <strong className={`tabular-nums ${diffTotal > 0 ? "text-success" : diffTotal < 0 ? "text-destructive" : ""}`}>
              {diffTotal > 0 ? "+" : ""}
              {formatQty(diffTotal)}
            </strong>
          </p>
          <Button type="submit" disabled={saving || !unitId || filled.length === 0}>
            {saving ? <Loader2 className="animate-spin" /> : <ClipboardCheck />}
            Salvar conferência
          </Button>
        </div>
      </form>
    </>
  );
}
