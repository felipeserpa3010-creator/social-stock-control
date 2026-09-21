import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { removeUnit, saveUnit, unitsOptions, type Unit } from "@/lib/queries";
import { EmptyState, Field, PageHeader, Panel, TableSkeleton } from "@/components/ui-kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/unidades")({
  head: () => ({
    meta: [
      { title: "Unidades — Controle de Inventário" },
      {
        name: "description",
        content: "Cadastro das unidades e dispensas controladas pela Assistência Social.",
      },
      { property: "og:title", content: "Unidades — Controle de Inventário" },
      {
        property: "og:description",
        content: "Gerencie as unidades atendidas pelo controle de inventário.",
      },
    ],
  }),
  component: UnitsPage,
});

const empty = {
  nome: "",
  sigla: "",
  responsavel: "",
  telefone: "",
  endereco: "",
  observacao: "",
  ativo: true,
};

function UnitsPage() {
  const queryClient = useQueryClient();
  const { data: units = [], isPending } = useQuery(unitsOptions(true));
  const [editing, setEditing] = useState<Unit | null>(null);
  const [form, setForm] = useState(empty);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Unit | null>(null);

  const startNew = () => {
    setEditing(null);
    setForm(empty);
    setOpen(true);
  };
  const startEdit = (u: Unit) => {
    setEditing(u);
    setForm({
      nome: u.nome,
      sigla: u.sigla ?? "",
      responsavel: u.responsavel ?? "",
      telefone: u.telefone ?? "",
      endereco: u.endereco ?? "",
      observacao: u.observacao ?? "",
      ativo: u.ativo,
    });
    setOpen(true);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nome.trim()) {
      toast.error("Informe o nome da unidade.");
      return;
    }
    setSaving(true);
    try {
      await saveUnit(editing?.id ?? null, {
        nome: form.nome.trim(),
        sigla: form.sigla.trim() || null,
        responsavel: form.responsavel.trim() || null,
        telefone: form.telefone.trim() || null,
        endereco: form.endereco.trim() || null,
        observacao: form.observacao.trim() || null,
        ativo: form.ativo,
      });
      queryClient.invalidateQueries({ queryKey: ["units"] });
      toast.success(editing ? "Unidade atualizada." : "Unidade cadastrada.");
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível salvar.");
    } finally {
      setSaving(false);
    }
  };

  const doDelete = async () => {
    if (!confirmDelete) return;
    try {
      await removeUnit(confirmDelete.id);
      queryClient.invalidateQueries({ queryKey: ["units"] });
      toast.success("Unidade excluída.");
    } catch {
      toast.error("Esta unidade possui lançamentos e não pode ser excluída. Desative-a em vez disso.");
    } finally {
      setConfirmDelete(null);
    }
  };

  return (
    <>
      <PageHeader
        title="Unidades"
        description="Cada unidade tem estoque, lançamentos e relatórios próprios."
        actions={
          <Button size="sm" onClick={startNew}>
            <Plus /> Nova unidade
          </Button>
        }
      />

      <Panel bodyClassName="p-0">
        {isPending ? (
          <div className="p-4">
            <TableSkeleton rows={6} cols={4} />
          </div>
        ) : units.length === 0 ? (
          <div className="p-4">
            <EmptyState title="Nenhuma unidade" description="Cadastre a primeira unidade para começar." />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table className="min-w-[720px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Unidade</TableHead>
                  <TableHead>Responsável</TableHead>
                  <TableHead>Telefone</TableHead>
                  <TableHead>Endereço</TableHead>
                  <TableHead>Situação</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {units.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell>
                      <p className="font-medium">{u.nome}</p>
                      {u.sigla && <p className="text-[11px] text-muted-foreground">{u.sigla}</p>}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{u.responsavel ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{u.telefone ?? "—"}</TableCell>
                    <TableCell className="max-w-[240px] truncate text-xs text-muted-foreground">
                      {u.endereco ?? "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={u.ativo ? "secondary" : "outline"}>
                        {u.ativo ? "Ativa" : "Inativa"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => startEdit(u)}>
                          Editar
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={`Excluir ${u.nome}`}
                          onClick={() => setConfirmDelete(u)}
                        >
                          <Trash2 className="text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Panel>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar unidade" : "Nova unidade"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            <Field label="Nome" htmlFor="u-nome" required>
              <Input
                id="u-nome"
                value={form.nome}
                onChange={(e) => setForm({ ...form, nome: e.target.value })}
                placeholder="Ex.: CRAS Centro"
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Sigla" htmlFor="u-sigla" hint="Usada no nome dos arquivos PDF.">
                <Input
                  id="u-sigla"
                  value={form.sigla}
                  onChange={(e) => setForm({ ...form, sigla: e.target.value })}
                  placeholder="CRAS-C"
                />
              </Field>
              <Field label="Telefone" htmlFor="u-tel">
                <Input
                  id="u-tel"
                  value={form.telefone}
                  onChange={(e) => setForm({ ...form, telefone: e.target.value })}
                  placeholder="(00) 0000-0000"
                />
              </Field>
            </div>
            <Field label="Responsável" htmlFor="u-resp">
              <Input
                id="u-resp"
                value={form.responsavel}
                onChange={(e) => setForm({ ...form, responsavel: e.target.value })}
                placeholder="Nome do responsável pela dispensa"
              />
            </Field>
            <Field label="Endereço" htmlFor="u-end">
              <Input
                id="u-end"
                value={form.endereco}
                onChange={(e) => setForm({ ...form, endereco: e.target.value })}
              />
            </Field>
            <Field label="Observação" htmlFor="u-obs">
              <Textarea
                id="u-obs"
                rows={2}
                value={form.observacao}
                onChange={(e) => setForm({ ...form, observacao: e.target.value })}
              />
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-4 accent-primary"
                checked={form.ativo}
                onChange={(e) => setForm({ ...form, ativo: e.target.checked })}
              />
              Unidade ativa (responsáveis só acessam unidades ativas)
            </label>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={saving}>
                {saving && <Loader2 className="animate-spin" />}
                Salvar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(confirmDelete)} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Excluir unidade</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Tem certeza que deseja excluir <strong>{confirmDelete?.nome}</strong>? Unidades com
            lançamentos não podem ser excluídas — nesse caso, desative a unidade.
          </p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmDelete(null)}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={doDelete}>
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
