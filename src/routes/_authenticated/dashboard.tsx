import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Boxes, TrendingUp, Trash2 } from "lucide-react";
import { useUnit } from "@/hooks/useUnit";
import { useAuth } from "@/hooks/useAuth";
import {
  movementsOptions,
  productsOptions,
  receivedEntriesOptions,
  stockOptions,
  pendingReceiptOptions,
  removePendingReceipt,
  removePendingReceiptGroup,
  receiptIdFromObservation,
} from "@/lib/queries";
import { formatDate, formatQty, stockStatus } from "@/lib/format";
import { EmptyState, PageHeader, Panel, StatCard, StatusPill, TypeBadge } from "@/components/ui-kit";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Painel — Controle de Estoque" },
      {
        name: "description",
        content: "Situação do estoque, alertas e movimentos recentes da unidade selecionada.",
      },
      { property: "og:title", content: "Painel — Controle de Estoque" },
      {
        property: "og:description",
        content: "Situação do estoque, alertas e movimentos recentes da unidade.",
      },
    ],
  }),
  component: DashboardPage,
});

function DashboardPage() {
  const { unitId, unit } = useUnit();
  const { isViewer, isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const { data: products = [] } = useQuery(productsOptions(false));
  const { data: stock = [] } = useQuery(stockOptions(unitId));
  const { data: movements = [] } = useQuery(movementsOptions({ unitId, limit: 400 }));
  const { data: pendingReceipts = [] } = useQuery(pendingReceiptOptions(unitId, isAdmin));
  const { data: viewerReceipts = [] } = useQuery(receivedEntriesOptions(unitId, isViewer));
  const deletePending = useMutation({
    mutationFn: removePendingReceipt,

    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["pending-receipts"] });
      await queryClient.invalidateQueries({ queryKey: ["stock"] });
      await queryClient.invalidateQueries({ queryKey: ["movements"] });
    },
  });


  const alertas = stock
    .filter((s) => stockStatus(s.quantity, s.product.estoque_minimo) !== "normal")
    .sort((a, b) => a.quantity - b.quantity);
  const zerados = alertas.filter((s) => stockStatus(s.quantity) === "zerado");
  const baixos = alertas.filter((s) => stockStatus(s.quantity) !== "zerado");

  return (
    <>
      <PageHeader
        title="Painel da unidade"
        description={
          unit
            ? `Resumo de ${unit.nome}${unit.sigla ? ` (${unit.sigla})` : ""}.`
            : isViewer
              ? "Visão consolidada de todas as unidades do estoque."
              : "Cadastre uma unidade para começar."
        }
        actions={
          !isViewer && (
            <Button asChild size="sm">
              <Link to="/relatorios">
                <TrendingUp /> Gerar relatório
              </Link>
            </Button>
          )
        }
      />

      {isViewer && (
        <div className="mb-5">
          <Panel
            title="Recibos de produtos enviados"
            description="Os recibos mais recentes aparecem separados por unidade. O visualizador pode consultar os detalhes, mas não pode alterar ou confirmar recebimentos."
            bodyClassName="p-0"
          >
            {viewerReceipts.length === 0 ? (
              <div className="p-4">
                <EmptyState title="Nenhum recibo de produtos encontrado" description="Quando o Centro de Distribuição enviar materiais, os recibos aparecerão aqui." />
              </div>
            ) : (
              <div className="divide-y divide-border/70">
                {(() => {
                  const groups = new Map<string, typeof viewerReceipts>();
                  viewerReceipts.forEach((entry) => {
                    const name = entry.units?.nome ?? "Unidade";
                    const list = groups.get(name) ?? [];
                    list.push(entry);
                    groups.set(name, list);
                  });
                  return Array.from(groups.entries()).map(([unitName, entries]) => {
                    const receipts = new Map<string, typeof entries>();
                    entries.forEach((entry) => {
                      const id = receiptIdFromObservation(entry.observacao) ?? entry.id;
                      const list = receipts.get(id) ?? [];
                      list.push(entry);
                      receipts.set(id, list);
                    });
                    return (
                      <div key={unitName} className="p-4">
                        <div className="mb-3 flex items-center justify-between gap-3">
                          <div>
                            <p className="font-semibold">{unitName}</p>
                            <p className="text-xs text-muted-foreground">{receipts.size} recibo(s) mais recente(s)</p>
                          </div>
                        </div>
                        <div className="space-y-2">
                          {Array.from(receipts.entries()).slice(0, 5).map(([receiptId, items]) => (
                            <div key={receiptId} className="rounded-md border border-border/70 p-3">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <span className="font-medium">Recibo de Produtos nº {receiptIdFromObservation(items[0]?.observacao) ?? receiptId}</span>
                                <span className="text-xs text-muted-foreground">{formatDate(items[0]?.data ?? null)}</span>
                              </div>
                              <p className="mt-1 text-xs text-muted-foreground">{items.length} produto(s) · {items.every((item) => Boolean(item.receipt)) ? "Recebido" : "Pendente"}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            )}
          </Panel>
        </div>
      )}

      {isAdmin && (
        <div className="mb-5">
          <Panel
            title="Lançamentos pendentes de recebimento"
            description="Esses lançamentos foram enviados pelo CEO para as unidades e ainda não entram no estoque disponível. Você pode cancelar um pendente."
            bodyClassName="p-0"
          >
            {pendingReceipts.length === 0 ? (
              <div className="p-4">
                <EmptyState title="Nenhum Recibo de Produtos pendente" description="Quando o CEO enviar mercadorias para uma unidade, o recibo aparecerá aqui até a confirmação." />
              </div>
            ) : (
              <ul className="divide-y divide-border/70">
                {Array.from(new Map(pendingReceipts.map((m) => [receiptIdFromObservation(m.observacao) ?? m.id, m])).values()).map((m) => {
                  const receiptId = receiptIdFromObservation(m.observacao);
                  const group = receiptId ? pendingReceipts.filter((x) => receiptIdFromObservation(x.observacao) === receiptId) : [m];
                  return (
                    <li key={receiptId ?? m.id} className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold">Recibo de Produtos {receiptId ? "nº " + receiptId : ""}</p>
                          <p className="text-xs text-muted-foreground">{m.units?.nome ?? "Unidade"} · {group.length} produto(s) · lançado em {formatDate(m.data)}</p>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          className="shrink-0"
                          onClick={() => {
                            const message = receiptId
                              ? "Excluir o Recibo de Produtos inteiro? Todos os produtos deste recibo serão excluídos e não entrarão no estoque."
                              : "Excluir este lançamento pendente? Ele não será adicionado ao estoque da unidade.";
                            if (window.confirm(message)) {
                              if (receiptId) removePendingReceiptGroup(receiptId).then(() => {
                                queryClient.invalidateQueries({ queryKey: ["pending-receipts"] });
                                queryClient.invalidateQueries({ queryKey: ["stock"] });
                                queryClient.invalidateQueries({ queryKey: ["movements"] });
                              }).catch((error) => toast.error(error instanceof Error ? error.message : "Não foi possível excluir o recibo."));
                              else deletePending.mutate(m.id);
                            }
                          }}
                          disabled={deletePending.isPending}
                        >
                          <Trash2 /> Excluir recibo
                        </Button>
                      </div>
                      <div className="mt-3 space-y-1 border-t pt-2">
                        {group.map((item) => (
                          <div key={item.id} className="flex items-center gap-2 text-xs">
                            <span className="min-w-0 flex-1 truncate">{item.products?.nome ?? "Produto"} · {formatQty(item.quantidade)} {item.products?.unidade_medida ?? ""}</span>
                            <Button variant="ghost" size="sm" onClick={() => {
                              if (window.confirm("Excluir somente este produto do recibo?")) deletePending.mutate(item.id);
                            }} disabled={deletePending.isPending}>
                              Excluir produto
                            </Button>
                          </div>
                        ))}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard
          label="Itens zerados"
          value={zerados.length}
          tone={zerados.length ? "danger" : "success"}
          icon={AlertTriangle}
          hint="Sem saldo para distribuição."
        />
        <StatCard
          label="Abaixo do mínimo"
          value={baixos.length}
          tone={baixos.length ? "warning" : "success"}
          icon={AlertTriangle}
        />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
        <Panel
          title="Alertas de reposição"
          description="Produtos zerados ou abaixo do estoque mínimo definido no cadastro."
          bodyClassName="p-0"
        >
          {alertas.length === 0 ? (
            <div className="p-4">
              <EmptyState
                title="Nenhum alerta no momento"
                description="Todos os produtos com ficha de estoque estão acima do mínimo."
              />
            </div>
          ) : (
            <ul className="divide-y divide-border/70">
              {alertas.slice(0, 9).map((s) => (
                <li key={s.product.id} className="flex items-center gap-3 px-4 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{s.product.nome}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {s.unit?.nome ? `${s.unit.nome} · ` : ""}{s.product.categories?.nome ?? "Sem categoria"} · mínimo{" "}
                      {formatQty(s.product.estoque_minimo)} {s.product.unidade_medida}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm font-bold tabular-nums">
                    {formatQty(s.quantity)}
                  </span>
                  <StatusPill quantity={s.quantity} min={s.product.estoque_minimo} />
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <div className="space-y-5">
          <Panel title="Últimos lançamentos" bodyClassName="p-0">
            {movements.length === 0 ? (
              <div className="p-4">
                <EmptyState title="Nada lançado ainda" description="Registre entradas e saídas para acompanhar aqui." />
              </div>
            ) : (
              <ul className="divide-y divide-border/70">
                {(() => {
                  const grouped: Array<{ key: string; receiptId: string | null; items: typeof movements }> = [];
                  const index = new Map<string, number>();
                  movements.forEach((m) => {
                    const receiptId = m.tipo === "entrada" ? receiptIdFromObservation(m.observacao) : null;
                    const key = receiptId ? "RECIBO:" + receiptId : "MOV:" + m.id;
                    const existing = index.get(key);
                    if (existing === undefined) {
                      index.set(key, grouped.length);
                      grouped.push({ key, receiptId, items: [m] });
                    } else {
                      grouped[existing]?.items.push(m);
                    }
                  });
                  return grouped.slice(0, 7).map((group) => {
                    const first = group.items[0];
                    return (
                      <li key={group.key} className="px-4 py-3">
                        {group.receiptId ? (
                          <>
                            <div className="flex items-center gap-3">
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-semibold">Recibo de Produtos nº {group.receiptId}</p>
                                <p className="text-[11px] text-muted-foreground">
                                  {first?.units?.nome ?? "Unidade"} · {group.items.length} produto(s) · lançado em {formatDate(first?.data ?? null)}
                                </p>
                              </div>
                              <TypeBadge tipo="entrada" />
                            </div>
                            <div className="mt-2 space-y-1 border-t pt-2">
                              {group.items.map((item) => (
                                <div key={item.id} className="flex items-center gap-2 text-xs">
                                  <span className="min-w-0 flex-1 truncate">{item.products?.nome ?? "Produto"}</span>
                                  <span className="font-semibold tabular-nums">{formatQty(item.quantidade)} {item.products?.unidade_medida ?? ""}</span>
                                </div>
                              ))}
                            </div>
                          </>
                        ) : (
                          <div className="flex items-center gap-3">
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm">{first?.products?.nome ?? "Produto"}</p>
                              <p className="text-[11px] text-muted-foreground">{formatDate(first?.data ?? null)}</p>
                            </div>
                            <span className="text-sm font-semibold tabular-nums">{formatQty(first?.quantidade ?? 0)}</span>
                            <TypeBadge tipo={first?.tipo ?? "saida"} />
                          </div>
                        )}
                      </li>
                    );
                  });
                })()}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </>
  );
}
