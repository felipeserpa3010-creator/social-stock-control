import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Boxes, ClipboardCheck, PackageMinus, PackagePlus, TrendingUp } from "lucide-react";
import { useUnit } from "@/hooks/useUnit";
import {
  checksOptions,
  movementsOptions,
  productsOptions,
  stockOptions,
} from "@/lib/queries";
import { byMonth, lastMonths, monthKey } from "@/lib/media";
import { formatDate, formatQty, stockStatus, todayISO } from "@/lib/format";
import { EmptyState, PageHeader, Panel, StatCard, StatusPill, TypeBadge } from "@/components/ui-kit";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Painel — Controle de Inventário" },
      {
        name: "description",
        content: "Situação do estoque, alertas e movimentos recentes da unidade selecionada.",
      },
      { property: "og:title", content: "Painel — Controle de Inventário" },
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
  const { data: products = [] } = useQuery(productsOptions(false));
  const { data: stock = [] } = useQuery(stockOptions(unitId));
  const { data: movements = [] } = useQuery(movementsOptions({ unitId, limit: 400 }));
  const { data: checks = [] } = useQuery(checksOptions(unitId));

  const month = todayISO().slice(0, 7);
  const entradasMes = movements
    .filter((m) => m.tipo === "entrada" && monthKey(m.data) === month)
    .reduce((acc, m) => acc + Number(m.quantidade), 0);
  const saidasMes = movements
    .filter((m) => m.tipo === "saida" && monthKey(m.data) === month)
    .reduce((acc, m) => acc + Number(m.quantidade), 0);

  const alertas = stock
    .filter((s) => stockStatus(s.quantity, s.product.estoque_minimo) !== "normal")
    .sort((a, b) => a.quantity - b.quantity);
  const zerados = alertas.filter((s) => stockStatus(s.quantity) === "zerado");
  const baixos = alertas.filter((s) => stockStatus(s.quantity) !== "zerado");
  const serie = byMonth(movements, lastMonths(6), "saida");
  const max = Math.max(1, ...serie.map((s) => s.total));
  const ultima = checks[0];

  return (
    <>
      <PageHeader
        title="Painel da unidade"
        description={
          unit
            ? `Resumo de ${unit.nome}${unit.sigla ? ` (${unit.sigla})` : ""}.`
            : "Cadastre uma unidade para começar."
        }
        actions={
          <>
            <Button asChild variant="outline" size="sm">
              <Link to="/conferencia">
                <ClipboardCheck /> Nova conferência
              </Link>
            </Button>
            <Button asChild size="sm">
              <Link to="/relatorios">
                <TrendingUp /> Gerar relatório
              </Link>
            </Button>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Produtos ativos" value={products.length} icon={Boxes} />
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
        <StatCard
          label="Última conferência"
          value={ultima ? formatDate(ultima.data_conferencia) : "—"}
          icon={ClipboardCheck}
          hint={ultima?.responsavel ? `Por ${ultima.responsavel}` : "Nenhuma conferência registrada."}
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
                      {s.product.categories?.nome ?? "Sem categoria"} · mínimo{" "}
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
          <Panel title="Saídas dos últimos 6 meses" description="Total registrado em cada mês.">
            <div className="flex h-32 items-end gap-2">
              {serie.map((s) => (
                <div key={s.key} className="flex h-full flex-1 flex-col justify-end gap-1">
                  <div
                    className="w-full rounded-t bg-primary/85 transition-all"
                    style={{ height: `${Math.max(2, (s.total / max) * 100)}%` }}
                    title={`${s.label}: ${formatQty(s.total)}`}
                  />
                  <span className="text-center text-[10px] text-muted-foreground">{s.label}</span>
                </div>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap gap-3 border-t border-border/70 pt-3 text-sm">
              <span className="inline-flex items-center gap-1.5">
                <PackagePlus className="size-4 text-success" />
                <strong className="tabular-nums">{formatQty(entradasMes)}</strong> entradas no mês
              </span>
              <span className="inline-flex items-center gap-1.5">
                <PackageMinus className="size-4 text-destructive" />
                <strong className="tabular-nums">{formatQty(saidasMes)}</strong> saídas no mês
              </span>
            </div>
          </Panel>

          <Panel title="Últimos lançamentos" bodyClassName="p-0">
            {movements.length === 0 ? (
              <div className="p-4">
                <EmptyState title="Nada lançado ainda" description="Registre entradas e saídas para acompanhar aqui." />
              </div>
            ) : (
              <ul className="divide-y divide-border/70">
                {movements.slice(0, 7).map((m) => (
                  <li key={m.id} className="flex items-center gap-3 px-4 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">{m.products?.nome ?? "Produto"}</p>
                      <p className="text-[11px] text-muted-foreground">{formatDate(m.data)}</p>
                    </div>
                    <span className="text-sm font-semibold tabular-nums">
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
    </>
  );
}
