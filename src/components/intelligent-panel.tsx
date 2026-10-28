import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Building2, CheckCircle2, Clock3, MinusCircle, PackageSearch, RefreshCw, Send, XCircle } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { ALL_UNITS, isExpedienteMaterialName, receiptIdFromObservation, stockOptions, unitsOptions } from "@/lib/queries";
import { formatDate, formatQty, todayISO } from "@/lib/format";
import { EmptyState, PageHeader, Panel, SearchInput, StatCard, TableSkeleton } from "@/components/ui-kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type Status = "pendente" | "confirmado" | "nao_recebido";
type Shipment = {
  key: string;
  numero: string;
  unitId: string;
  unitName: string;
  date: string;
  items: number;
  status: Status;
  confirmedAt: string | null;
};

const STATUS_LABEL: Record<Status, string> = { pendente: "Aguardando confirmação", confirmado: "Confirmado", nao_recebido: "Não recebido" };
const STATUS_CLS: Record<Status, string> = {
  pendente: "border-warning/40 bg-warning/15 text-warning-foreground",
  confirmado: "border-success/40 bg-success/10 text-success",
  nao_recebido: "border-destructive/40 bg-destructive/10 text-destructive",
};
const PENDING_ALERT_DAYS = 3;
const PAGE_SIZE = 10;

type PeriodKey = "hoje" | "7d" | "mes" | "mes_anterior" | "personalizado";

function iso(d: Date) {
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
function periodRange(key: PeriodKey, custom: { from: string; to: string }) {
  const now = new Date();
  if (key === "hoje") return { from: todayISO(), to: todayISO() };
  if (key === "7d") return { from: iso(new Date(now.getTime() - 6 * 86400000)), to: todayISO() };
  if (key === "mes") return { from: iso(new Date(now.getFullYear(), now.getMonth(), 1)), to: todayISO() };
  if (key === "mes_anterior") return { from: iso(new Date(now.getFullYear(), now.getMonth() - 1, 1)), to: iso(new Date(now.getFullYear(), now.getMonth(), 0)) };
  return custom;
}
function daysSince(date: string) {
  return Math.floor((Date.now() - new Date(`${date}T12:00:00`).getTime()) / 86400000);
}
function norm(s: string) {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}
function classify(categoria: string) {
  const c = norm(categoria);
  if (c.includes("aliment")) return "Alimentos";
  if (c.includes("higiene") || c.includes("limpeza")) return "Higiene e limpeza";
  return "Outros";
}

/** Envios de produtos do estoque (alimentos/higiene) — somente leitura, respeita RLS. */
function shipmentsOptions(since: string) {
  return {
    queryKey: ["ceo-shipments", since],
    queryFn: async (): Promise<Shipment[]> => {
      const { data, error } = await supabase
        .from("stock_movements")
        .select("id, unit_id, data, observacao, units(nome)")
        .eq("tipo", "entrada")
        .ilike("observacao", "%PENDENTE_RECEBIMENTO%")
        .gte("data", since)
        .order("data", { ascending: false })
        .limit(3000);
      if (error) throw new Error(error.message);
      const rows = (data ?? []) as unknown as Array<{ id: string; unit_id: string; data: string; observacao: string | null; units: { nome: string } | null }>;
      const confirmations = new Map<string, string>();
      for (let i = 0; i < rows.length; i += 200) {
        const ids = rows.slice(i, i + 200).map((r) => r.id);
        if (!ids.length) continue;
        const { data: rec, error: recErr } = await supabase.from("stock_receipts").select("movement_id, confirmed_at").in("movement_id", ids);
        if (recErr) throw new Error(recErr.message);
        (rec ?? []).forEach((r) => confirmations.set(r.movement_id, r.confirmed_at));
      }
      const groups = new Map<string, typeof rows>();
      rows.forEach((r) => {
        const num = receiptIdFromObservation(r.observacao) ?? `INDIVIDUAL-${r.id}`;
        const key = `${num}::${r.unit_id}`;
        groups.set(key, [...(groups.get(key) ?? []), r]);
      });
      return Array.from(groups.entries()).map(([key, list]) => {
        const nao = list.some((r) => String(r.observacao ?? "").includes("NAO_RECEBIDO"));
        const confirmedDates = list.map((r) => confirmations.get(r.id)).filter(Boolean) as string[];
        const allConfirmed = confirmedDates.length === list.length;
        const numero = key.split("::")[0] ?? "";
        const first = list[0];
        if (!first) throw new Error("Recibo sem itens.");
        return {
          key,
          numero: numero.startsWith("INDIVIDUAL-") ? "Avulso" : numero,
          unitId: first.unit_id,
          unitName: first.units?.nome ?? "Unidade",
          date: list.map((r) => r.data).sort()[0] ?? first.data,
          items: list.length,
          status: allConfirmed ? "confirmado" : nao ? "nao_recebido" : "pendente",
          confirmedAt: allConfirmed ? confirmedDates.sort().at(-1) ?? null : null,
        } satisfies Shipment;
      }).sort((a, b) => b.date.localeCompare(a.date) || b.numero.localeCompare(a.numero));
    },
  };
}

export function IntelligentPanel({ viewer = false }: { viewer?: boolean }) {
  const [period, setPeriod] = useState<PeriodKey>("mes");
  const [custom, setCustom] = useState({ from: todayISO(), to: todayISO() });
  const [unitFilter, setUnitFilter] = useState<string>(ALL_UNITS);
  const [statusFilter, setStatusFilter] = useState<Status | "todos">("todos");
  const [term, setTerm] = useState("");
  const [page, setPage] = useState(0);
  const range = periodRange(period, custom);

  // Janela fixa de 12 meses para gráficos mensais e alertas de pendências antigas.
  const since = useMemo(() => {
    const d = new Date();
    const yearAgo = iso(new Date(d.getFullYear() - 1, d.getMonth(), 1));
    return range.from < yearAgo ? range.from : yearAgo;
  }, [range.from]);

  const units = useQuery(unitsOptions());
  const shipments = useQuery(shipmentsOptions(since));
  const stock = useQuery(stockOptions(ALL_UNITS));

  const all = shipments.data ?? [];
  const byUnit = (s: Shipment) => unitFilter === ALL_UNITS || s.unitId === unitFilter;
  const inPeriod = all.filter((s) => byUnit(s) && s.date >= range.from && s.date <= range.to);
  const confirmedInPeriod = all.filter((s) => byUnit(s) && s.status === "confirmado" && s.confirmedAt && s.confirmedAt.slice(0, 10) >= range.from && s.confirmedAt.slice(0, 10) <= range.to);
  const pendingAll = all.filter((s) => byUnit(s) && s.status === "pendente");
  const notReceived = all.filter((s) => byUnit(s) && s.status === "nao_recebido");

  // Estoque confirmado atual (tabela stock), sem materiais de expediente.
  const stockRows = (stock.data ?? []).filter((r) => r.product.ativo && !isExpedienteMaterialName(r.product.nome) && (unitFilter === ALL_UNITS || r.unit_id === unitFilter));
  const zeroed = stockRows.filter((r) => r.quantity <= 0);
  const low = stockRows.filter((r) => r.quantity > 0 && r.product.estoque_minimo != null && r.quantity <= Number(r.product.estoque_minimo));

  const monthly = useMemo(() => {
    const now = new Date();
    return Array.from({ length: 6 }).map((_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1);
      const ym = iso(d).slice(0, 7);
      return {
        mes: d.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }),
        Envios: all.filter((s) => byUnit(s) && s.date.startsWith(ym)).length,
        Confirmados: all.filter((s) => byUnit(s) && s.confirmedAt?.startsWith(ym)).length,
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all, unitFilter]);

  const perUnit = useMemo(() => {
    const m = new Map<string, number>();
    inPeriod.forEach((s) => m.set(s.unitName, (m.get(s.unitName) ?? 0) + 1));
    return Array.from(m.entries()).map(([unidade, envios]) => ({ unidade, envios })).sort((a, b) => b.envios - a.envios).slice(0, 10);
  }, [inPeriod]);

  const statusData = (["pendente", "confirmado", "nao_recebido"] as Status[]).map((st) => ({ name: STATUS_LABEL[st], value: inPeriod.filter((s) => s.status === st).length, st }));
  const statusColors: Record<Status, string> = { pendente: "var(--warning)", confirmado: "var(--success)", nao_recebido: "var(--destructive)" };

  const classification = useMemo(() => {
    const m = new Map<string, number>();
    stockRows.forEach((r) => {
      const k = classify(r.product.categories?.nome ?? "");
      m.set(k, (m.get(k) ?? 0) + r.quantity);
    });
    return Array.from(m.entries()).map(([classe, quantidade]) => ({ classe, quantidade }));
  }, [stockRows]);

  const table = inPeriod.filter((s) => {
    if (statusFilter !== "todos" && s.status !== statusFilter) return false;
    const q = term.trim().toLowerCase();
    return !q || s.numero.toLowerCase().includes(q) || s.unitName.toLowerCase().includes(q);
  });
  const pages = Math.max(1, Math.ceil(table.length / PAGE_SIZE));
  const pageRows = table.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  const oldPending = pendingAll.filter((s) => daysSince(s.date) >= PENDING_ALERT_DAYS);
  const loading = shipments.isPending || stock.isPending;
  const error = shipments.error || stock.error || units.error;

  const select = "h-9 rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring";

  return (
    <div className="space-y-5">
      <PageHeader
        title={viewer ? "Painel inteligente" : "Painel Inteligente do CEO"}
        description="Visão geral de envios, recebimentos e estoque confirmado de todas as unidades. Materiais de expediente não entram nestes indicadores."
        actions={<Button variant="outline" size="sm" onClick={() => { void shipments.refetch(); void stock.refetch(); }}><RefreshCw className="size-4" />Atualizar</Button>}
      />

      <Panel bodyClassName="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs font-semibold text-muted-foreground">Período
          <select className={select} value={period} onChange={(e) => { setPeriod(e.target.value as PeriodKey); setPage(0); }}>
            <option value="hoje">Hoje</option><option value="7d">Últimos 7 dias</option><option value="mes">Este mês</option>
            <option value="mes_anterior">Mês anterior</option><option value="personalizado">Período personalizado</option>
          </select>
        </label>
        {period === "personalizado" && (
          <>
            <label className="flex flex-col gap-1 text-xs font-semibold text-muted-foreground">De<Input type="date" value={custom.from} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} className="h-9" /></label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-muted-foreground">Até<Input type="date" value={custom.to} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} className="h-9" /></label>
          </>
        )}
        <label className="flex flex-col gap-1 text-xs font-semibold text-muted-foreground">Unidade
          <select className={select} value={unitFilter} onChange={(e) => { setUnitFilter(e.target.value); setPage(0); }}>
            <option value={ALL_UNITS}>Todas as unidades</option>
            {(units.data ?? []).map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
          </select>
        </label>
        <p className="text-xs text-muted-foreground">{formatDate(range.from)} a {formatDate(range.to)}</p>
      </Panel>

      {error && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          <span>Não foi possível carregar os dados do painel: {(error as Error).message}</span>
          <Button size="sm" variant="outline" onClick={() => { void shipments.refetch(); void stock.refetch(); void units.refetch(); }}>Tentar novamente</Button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <Link to="/recibos"><StatCard label="Envios pendentes" value={loading ? "…" : pendingAll.length} hint="Aguardando confirmação da unidade" tone="warning" icon={Clock3} /></Link>
        <Link to="/recibos"><StatCard label="Recebimentos confirmados" value={loading ? "…" : confirmedInPeriod.length} hint="Confirmados no período" tone="success" icon={CheckCircle2} /></Link>
        <Link to="/recibos"><StatCard label="Unidades atendidas" value={loading ? "…" : new Set(inPeriod.map((s) => s.unitId)).size} hint="Receberam envios no período" icon={Building2} /></Link>
        <Link to="/estoque"><StatCard label="Estoque baixo" value={loading ? "…" : low.length} hint="Abaixo ou no mínimo definido" tone="warning" icon={AlertTriangle} /></Link>
        <Link to="/estoque"><StatCard label="Itens zerados" value={loading ? "…" : zeroed.length} hint="Estoque confirmado igual a zero" tone="danger" icon={MinusCircle} /></Link>
        <Link to="/recibos"><StatCard label="Envios no período" value={loading ? "…" : inPeriod.length} hint="Recibos de envio registrados" icon={Send} /></Link>
      </div>

      {!viewer && (
      <Panel title="Atenção necessária" description="Alertas gerados a partir dos registros atuais. Nenhum alerta altera o estoque.">
        {loading ? <TableSkeleton rows={3} cols={3} /> : (
          <ul className="divide-y divide-border text-sm">
            {oldPending.slice(0, 8).map((s) => (
              <AlertRow key={`p-${s.key}`} tone="warning" title={`Recibo ${s.numero} aguardando há ${daysSince(s.date)} dias`} detail={`${s.unitName} · enviado em ${formatDate(s.date)}`} to="/recibos" />
            ))}
            {notReceived.slice(0, 8).map((s) => (
              <AlertRow key={`n-${s.key}`} tone="danger" title={`Recibo ${s.numero} marcado como não recebido`} detail={`${s.unitName} · enviado em ${formatDate(s.date)}`} to="/recibos" />
            ))}
            {zeroed.length > 0 && <AlertRow tone="danger" title={`${zeroed.length} produto(s) com estoque zerado`} detail={zeroed.slice(0, 4).map((r) => `${r.product.nome} (${r.unit?.nome ?? ""})`).join(" · ")} to="/estoque" />}
            {low.length > 0 && <AlertRow tone="warning" title={`${low.length} produto(s) com estoque baixo`} detail={low.slice(0, 4).map((r) => `${r.product.nome}: ${formatQty(r.quantity)} (${r.unit?.nome ?? ""})`).join(" · ")} to="/estoque" />}
            {!oldPending.length && !notReceived.length && !zeroed.length && !low.length && <li className="py-3 text-muted-foreground">Nenhum alerta no momento.</li>}
            <li className="py-2 text-xs text-muted-foreground">Divergências entre quantidade enviada e recebida: o sistema ainda não registra a quantidade recebida separadamente, por isso esse alerta não é exibido.</li>
          </ul>
        )}
      </Panel>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Movimentações mensais" description="Envios registrados x recebimentos confirmados (últimos 6 meses)">
          <ChartBox empty={!monthly.some((m) => m.Envios || m.Confirmados)}>
            <BarChart data={monthly}><CartesianGrid strokeDasharray="3 3" stroke="var(--border)" /><XAxis dataKey="mes" fontSize={11} /><YAxis allowDecimals={false} fontSize={11} /><Tooltip /><Legend />
              <Bar dataKey="Envios" fill="var(--primary)" radius={[3, 3, 0, 0]} /><Bar dataKey="Confirmados" fill="var(--success)" radius={[3, 3, 0, 0]} /></BarChart>
          </ChartBox>
        </Panel>
        <Panel title="Envios por unidade" description="Unidades que mais receberam envios no período">
          <ChartBox empty={!perUnit.length}>
            <BarChart data={perUnit} layout="vertical" margin={{ left: 20 }}><CartesianGrid strokeDasharray="3 3" stroke="var(--border)" /><XAxis type="number" allowDecimals={false} fontSize={11} /><YAxis type="category" dataKey="unidade" width={120} fontSize={11} /><Tooltip />
              <Bar dataKey="envios" name="Envios" fill="var(--primary)" radius={[0, 3, 3, 0]} /></BarChart>
          </ChartBox>
        </Panel>
        <Panel title="Situação dos recibos" description="Recibos enviados no período por situação">
          <ChartBox empty={!statusData.some((s) => s.value)}>
            <PieChart><Pie data={statusData} dataKey="value" nameKey="name" innerRadius={50} outerRadius={85} label={({ value }) => value || ""}>
              {statusData.map((s) => <Cell key={s.st} fill={statusColors[s.st]} />)}</Pie><Tooltip /><Legend /></PieChart>
          </ChartBox>
        </Panel>
        <Panel title="Estoque por classificação" description="Quantidades confirmadas atuais (sem materiais de expediente)">
          <ChartBox empty={!classification.some((c) => c.quantidade)}>
            <BarChart data={classification}><CartesianGrid strokeDasharray="3 3" stroke="var(--border)" /><XAxis dataKey="classe" fontSize={11} /><YAxis fontSize={11} /><Tooltip />
              <Bar dataKey="quantidade" name="Quantidade" fill="var(--primary)" radius={[3, 3, 0, 0]} /></BarChart>
          </ChartBox>
        </Panel>
      </div>


      <Panel
        title="Últimos envios realizados"
        actions={
          <div className="flex flex-wrap gap-2">
            <SearchInput value={term} onChange={(v) => { setTerm(v); setPage(0); }} placeholder="Recibo ou unidade" className="w-52" />
            <select className={select} value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value as Status | "todos"); setPage(0); }}>
              <option value="todos">Todas as situações</option><option value="pendente">Aguardando</option><option value="confirmado">Confirmado</option><option value="nao_recebido">Não recebido</option>
            </select>
          </div>
        }
      >
        {loading ? <TableSkeleton /> : !table.length ? <EmptyState title="Nenhum envio encontrado" description="Ajuste o período, a unidade ou a busca." /> : (
          <>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow><TableHead>Recibo</TableHead><TableHead>Data do envio</TableHead><TableHead>Unidade</TableHead><TableHead className="text-right">Itens</TableHead><TableHead>Situação</TableHead><TableHead>Confirmação</TableHead><TableHead /></TableRow></TableHeader>
                <TableBody>
                  {pageRows.map((s) => (
                    <TableRow key={s.key}>
                      <TableCell className="font-semibold">{s.numero}</TableCell>
                      <TableCell>{formatDate(s.date)}</TableCell>
                      <TableCell>{s.unitName}</TableCell>
                      <TableCell className="text-right tabular-nums">{s.items}</TableCell>
                      <TableCell><span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap ${STATUS_CLS[s.status]}`}>{STATUS_LABEL[s.status]}</span></TableCell>
                      <TableCell>{s.confirmedAt ? formatDate(s.confirmedAt) : "—"}</TableCell>
                      <TableCell><Button asChild size="sm" variant="ghost"><Link to="/recibos"><PackageSearch className="size-4" />Detalhes</Link></Button></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
              <span>{table.length} envio(s) · página {page + 1} de {pages}</span>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Anterior</Button>
                <Button size="sm" variant="outline" disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)}>Próxima</Button>
              </div>
            </div>
          </>
        )}
      </Panel>
    </div>
  );
}

function AlertRow({ tone, title, detail, to }: { tone: "warning" | "danger"; title: string; detail: string; to: "/recibos" | "/estoque" }) {
  const Icon = tone === "danger" ? XCircle : AlertTriangle;
  return (
    <li className="flex items-start gap-3 py-2.5">
      <Icon className={`mt-0.5 size-4 shrink-0 ${tone === "danger" ? "text-destructive" : "text-warning"}`} />
      <div className="min-w-0 flex-1"><p className="font-medium">{title}</p><p className="truncate text-xs text-muted-foreground">{detail}</p></div>
      <Button asChild size="sm" variant="ghost"><Link to={to}>Consultar</Link></Button>
    </li>
  );
}

function ChartBox({ empty, children }: { empty: boolean; children: React.ReactElement }) {
  if (empty) return <EmptyState title="Sem dados para exibir" description="Não há registros para o filtro selecionado." />;
  return <div className="h-64 w-full"><ResponsiveContainer width="100%" height="100%">{children}</ResponsiveContainer></div>;
}
