import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Clock3, PackageCheck } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useUnit } from "@/hooks/useUnit";
import { receivedEntriesOptions, confirmStockReceipt } from "@/lib/queries";
import { formatDate, formatQty } from "@/lib/format";
import { EmptyState, PageHeader, Panel, TableSkeleton } from "@/components/ui-kit";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/recebimento")({
  head: () => ({ meta: [
    { title: "Confirmar recebimento — Controle de Estoque" },
    { name: "description", content: "Confirme o recebimento das mercadorias lançadas pelo CEO." },
  ]}),
  component: ReceiptPage,
});

function ReceiptPage() {
  const { role, profile, isAdmin, isViewer } = useAuth();
  const { unitId, unit, loading } = useUnit();
  const queryClient = useQueryClient();
  const canConfirm = role === "responsavel" && Boolean(profile?.unit_id);
  const { data: entries = [], isPending } = useQuery(receivedEntriesOptions(unitId, canConfirm));
  const pending = useMemo(() => entries.filter((e) => !e.receipt), [entries]);
  const confirmed = useMemo(() => entries.filter((e) => e.receipt), [entries]);
  const mutation = useMutation({
    mutationFn: (movementId: string) => confirmStockReceipt(movementId, profile?.nome ?? "Responsável pela unidade"),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["received-entries"] });
      await queryClient.invalidateQueries({ queryKey: ["stock"] });
    },
  });

  if (isAdmin || isViewer) return (
    <>
      <PageHeader title="Confirmar recebimento" description="A confirmação é realizada pelo responsável da unidade que recebeu a mercadoria." />
      <Panel title="Acesso somente para consulta">
        <EmptyState title={isAdmin ? "Administrador Principal" : "Gabinete SEMADS"}
          description={isAdmin ? "O CEO registra as entradas. O responsável da unidade confirma o recebimento." : "O Gabinete pode acompanhar os lançamentos, mas não confirma recebimentos."} />
      </Panel>
    </>
  );

  if (loading || isPending) return (
    <><PageHeader title="Confirmar recebimento" description="Confira as mercadorias lançadas para sua unidade." />
      <Panel title="Carregando"><TableSkeleton rows={5} cols={5} /></Panel></>
  );

  return (
    <>
      <PageHeader title="Confirmar recebimento"
        description={unit ? "Mercadorias lançadas pelo CEO para " + unit.nome + "." : "Confira as mercadorias lançadas para sua unidade."} />
      <Panel title={pending.length + " recebimento" + (pending.length === 1 ? "" : "s") + " pendente" + (pending.length === 1 ? "" : "s")}
        description="Confira a quantidade recebida e confirme. A quantidade lançada pelo CEO não pode ser alterada nesta tela." bodyClassName="p-0">
        {pending.length === 0 ? <div className="p-4"><EmptyState icon={<PackageCheck className="size-5" />}
          title="Nenhum recebimento pendente"
          description={confirmed.length ? "Todos os lançamentos disponíveis já foram confirmados." : "Quando o CEO lançar uma mercadoria para sua unidade, ela aparecerá aqui."} /></div>
        : <div className="overflow-x-auto"><Table className="min-w-[760px]"><TableHeader><TableRow>
          <TableHead>Produto</TableHead><TableHead className="text-right">Quantidade</TableHead><TableHead>Data do lançamento</TableHead><TableHead>Responsável pelo lançamento</TableHead><TableHead className="text-right">Ação</TableHead>
        </TableRow></TableHeader><TableBody>
          {pending.map((entry) => <TableRow key={entry.id}>
            <TableCell className="font-semibold">{entry.products?.nome ?? "Produto"}</TableCell>
            <TableCell className="text-right font-bold tabular-nums">{formatQty(entry.quantidade)}<span className="ml-1 text-xs font-normal text-muted-foreground">{entry.products?.unidade_medida ?? ""}</span></TableCell>
            <TableCell className="text-sm text-muted-foreground">{formatDate(entry.data)}</TableCell>
            <TableCell className="text-sm text-muted-foreground">{entry.responsavel ?? "CEO/Administrador"}</TableCell>
            <TableCell className="text-right"><Button size="sm" onClick={() => mutation.mutate(entry.id)} disabled={mutation.isPending}><CheckCircle2 />{mutation.isPending ? "Confirmando..." : "Confirmar recebimento"}</Button></TableCell>
          </TableRow>)}
        </TableBody></Table></div>}
      </Panel>
      {confirmed.length > 0 && <Panel title="Recebimentos confirmados" description="Registro de quem confirmou e quando a confirmação foi feita." bodyClassName="p-0">
        <div className="overflow-x-auto"><Table className="min-w-[720px]"><TableHeader><TableRow>
          <TableHead>Produto</TableHead><TableHead className="text-right">Quantidade</TableHead><TableHead>Data do lançamento</TableHead><TableHead>Confirmado por</TableHead><TableHead>Data da confirmação</TableHead>
        </TableRow></TableHeader><TableBody>
          {confirmed.map((entry) => <TableRow key={entry.id}>
            <TableCell className="font-medium">{entry.products?.nome ?? "Produto"}</TableCell>
            <TableCell className="text-right tabular-nums">{formatQty(entry.quantidade)} {entry.products?.unidade_medida ?? ""}</TableCell>
            <TableCell className="text-sm text-muted-foreground">{formatDate(entry.data)}</TableCell>
            <TableCell className="text-sm">{entry.receipt?.confirmed_by_name ?? "—"}</TableCell>
            <TableCell className="text-sm text-muted-foreground"><span className="inline-flex items-center gap-1"><Clock3 className="size-3.5" />{formatDate(entry.receipt?.confirmed_at ?? null)}</span></TableCell>
          </TableRow>)}
        </TableBody></Table></div>
      </Panel>}
    </>
  );
}