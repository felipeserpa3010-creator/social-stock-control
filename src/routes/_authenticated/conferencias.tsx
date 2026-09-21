import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, FileDown, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useUnit } from "@/hooks/useUnit";
import {
  checkItemsOptions,
  checksOptions,
  productsOptions,
  settingsOptions,
  type CheckRow,
} from "@/lib/queries";
import { formatDate, formatQty } from "@/lib/format";
import { buildInventoryPdf, reportFileName, type InventoryRow } from "@/lib/pdf";
import { EmptyState, PageHeader, Panel, TableSkeleton } from "@/components/ui-kit";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/conferencias")({
  head: () => ({
    meta: [
      { title: "Histórico de conferências — Controle de Inventário" },
      {
        name: "description",
        content: "Conferências de estoque realizadas na unidade, com diferenças e relatório em PDF.",
      },
      { property: "og:title", content: "Histórico de conferências — Controle de Inventário" },
      {
        property: "og:description",
        content: "Conferências registradas na dispensa, com itens conferidos e PDF para assinatura.",
      },
    ],
  }),
  component: ChecksPage,
});

function ChecksPage() {
  const { unitId, unit } = useUnit();
  const { data: checks = [], isPending } = useQuery(checksOptions(unitId));
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <>
      <PageHeader
        title="Histórico de conferências"
        description="Cada conferência atualiza o estoque aproximado e registra as diferenças encontradas."
      />
      <Panel bodyClassName="p-0">
        {isPending ? (
          <div className="p-4">
            <TableSkeleton rows={6} cols={3} />
          </div>
        ) : checks.length === 0 ? (
          <div className="p-4">
            <EmptyState
              title="Nenhuma conferência registrada"
              description="Abra uma conferência para contar os produtos da dispensa."
            />
          </div>
        ) : (
          <ul className="divide-y divide-border/70">
            {checks.map((c) => (
              <CheckListItem
                key={c.id}
                check={c}
                open={openId === c.id}
                unitName={unit?.nome ?? ""}
                onToggle={() => setOpenId((id) => (id === c.id ? null : c.id))}
              />
            ))}
          </ul>
        )}
      </Panel>
    </>
  );
}

function CheckListItem({
  check,
  open,
  unitName,
  onToggle,
}: {
  check: CheckRow;
  open: boolean;
  unitName: string;
  onToggle: () => void;
}) {
  const { data: products = [] } = useQuery(productsOptions(true));
  const { data: settings } = useQuery(settingsOptions());
  const { data: items = [], isPending } = useQuery(checkItemsOptions(open ? check.id : null));
  const [pdfLoading, setPdfLoading] = useState(false);

  const diffTotal = items.reduce((acc, i) => acc + Number(i.diferenca ?? 0), 0);

  const makePdf = async () => {
    setPdfLoading(true);
    try {
      const rows: InventoryRow[] = items
        .filter((i) => i.products)
        .map((i) => {
          const product = products.find((p) => p.id === i.product_id);
          return {
            categoria: product?.categories?.nome ?? "—",
            produto: i.products?.nome ?? "—",
            medida: i.products?.unidade_medida ?? "—",
            estoque: Number(i.quantidade_conferida),
          };
        });
      const doc = await buildInventoryPdf({
        titulo: "Relatório de conferência de estoque",
        instituicao: settings?.nome_instituicao ?? "Assistência Social",
        secretaria: settings?.nome_secretaria ?? "",
        logoUrl: settings?.logo_url,
        unidade: unitName || check.units?.nome || "Unidade",
        dataConferencia: check.data_conferencia,
        rows,
        assinatura: true,
      });
      doc.save(reportFileName("Conferencia", unitName || "Unidade", check.data_conferencia));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível gerar o PDF.");
    } finally {
      setPdfLoading(false);
    }
  };

  return (
    <li>
      <div className="flex flex-wrap items-center gap-3 px-4 py-3">
        <button
          type="button"
          onClick={onToggle}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
          aria-expanded={open}
        >
          {open ? <ChevronDown className="size-4 shrink-0" /> : <ChevronRight className="size-4 shrink-0" />}
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold">
              {formatDate(check.data_conferencia)}
            </span>
            <span className="block truncate text-[11px] text-muted-foreground">
              {check.responsavel ?? "Sem responsável informado"}
              {check.observacao ? ` · ${check.observacao}` : ""}
            </span>
          </span>
        </button>
        {items.length > 0 && (
          <span
            className={`shrink-0 text-xs font-semibold tabular-nums ${
              diffTotal > 0 ? "text-success" : diffTotal < 0 ? "text-destructive" : "text-muted-foreground"
            }`}
          >
            {diffTotal > 0 ? "+" : ""}
            {formatQty(diffTotal)} de diferença
          </span>
        )}
        <Button variant="outline" size="sm" onClick={makePdf} disabled={!items.length || pdfLoading}>
          {pdfLoading ? <Loader2 className="animate-spin" /> : <FileDown />}
          PDF
        </Button>
      </div>

      {open && (
        <div className="border-t border-border/70 bg-muted/30">
          {isPending ? (
            <div className="p-4">
              <TableSkeleton rows={4} cols={3} />
            </div>
          ) : items.length === 0 ? (
            <p className="p-4 text-xs text-muted-foreground">Nenhum item nesta conferência.</p>
          ) : (
            <ul className="divide-y divide-border/60">
              {items.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center gap-2 px-4 py-2 text-sm">
                  <span className="min-w-0 flex-1 truncate">
                    {i.products?.nome ?? "Produto removido"}
                    <span className="ml-1 text-[11px] text-muted-foreground">
                      {i.products?.unidade_medida}
                    </span>
                  </span>
                  <span className="tabular-nums text-muted-foreground">
                    registrado {formatQty(i.quantidade_registrada)}
                  </span>
                  <span className="font-semibold tabular-nums">
                    conferido {formatQty(i.quantidade_conferida)}
                  </span>
                  <span
                    className={`w-20 text-right font-semibold tabular-nums ${
                      Number(i.diferenca) > 0
                        ? "text-success"
                        : Number(i.diferenca) < 0
                          ? "text-destructive"
                          : "text-muted-foreground"
                    }`}
                  >
                    {Number(i.diferenca) > 0 ? "+" : ""}
                    {formatQty(i.diferenca)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </li>
  );
}
