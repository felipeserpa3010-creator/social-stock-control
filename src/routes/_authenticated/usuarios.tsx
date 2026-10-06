import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Loader2, Plus, Settings2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { unitsOptions, usersOptions, type AppRole } from "@/lib/queries";
import { adminCreateUser, adminResetPassword, adminSetAccess, adminSetRole, adminSetUnit, adminSetViewerUnits } from "@/lib/admin.functions";
import { EmptyState, PageHeader, Panel, TableSkeleton } from "@/components/ui-kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Field } from "@/components/ui-kit";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/usuarios")({
  head: () => ({
    meta: [
      { title: "Usuários — Controle de Estoque" },
      {
        name: "description",
        content: "Cadastro e perfis de acesso dos usuários do controle de estoque.",
      },
      { property: "og:title", content: "Usuários — Controle de Estoque" },
      {
        property: "og:description",
        content: "Gerencie quem acessa o sistema e a qual unidade cada responsável pertence.",
      },
    ],
  }),
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: data.user.id, _role: "admin" });
    if (isAdmin !== true) throw redirect({ to: "/dashboard" });
  },
  component: UsersPage,
});

function UsersPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: users = [], isPending } = useQuery(usersOptions(true));
  const { data: units = [] } = useQuery(unitsOptions(true));
  const { data: viewerAccessRows = [] } = useQuery({
    queryKey: ["viewer-unit-access"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("viewer_unit_access")
        .select("user_id, unit_id");
      if (error) throw new Error(error.message);
      return (data ?? []) as Array<{ user_id: string; unit_id: string }>;
    },
  });
  const accessMap = viewerAccessRows.reduce<Record<string, string[]>>((acc, row) => {
    (acc[row.user_id] ??= []).push(row.unit_id);
    return acc;
  }, {});
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    nome: "",
    email: "",
    senha: "",
    role: "responsavel" as AppRole,
    unit_id: "",
    viewer_unit_ids: [] as string[],
  });
  const [reset, setReset] = useState<{ id: string; nome: string } | null>(null);
  const [newPass, setNewPass] = useState("");
  const [viewerAccess, setViewerAccess] = useState<Record<string, string[]>>({});
  const [accessEditor, setAccessEditor] = useState<{ id: string; nome: string } | null>(null);
  const [accessSelection, setAccessSelection] = useState<string[]>([]);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["users"] });
    queryClient.invalidateQueries({ queryKey: ["viewer-unit-access"] });
  };

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const result = await adminCreateUser({ data: {
        nome: form.nome,
        email: form.email,
        senha: form.senha,
        role: form.role,
        unit_id: form.role === "responsavel"
          ? form.unit_id || null
          : units.find((u) => u.nome.trim().toLowerCase() === "gabinete semads")?.id ?? null,
        viewer_unit_ids: form.viewer_unit_ids,
      } });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Usuário criado.");
      setOpen(false);
      setForm({ nome: "", email: "", senha: "", role: "responsavel", unit_id: "", viewer_unit_ids: [] });
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível criar o usuário.");
    } finally {
      setSaving(false);
    }
  };

  const changeRole = async (userId: string, role: AppRole) => {
    try {
      await adminSetRole({ data: { user_id: userId, role } });
      toast.success("Perfil atualizado.");
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível alterar o perfil.");
    }
  };

  const doReset = async () => {
    if (!reset) return;
    try {
      const result = await adminResetPassword({ data: { user_id: reset.id, senha: newPass } });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`Nova senha definida para ${reset.nome}.`);
      setReset(null);
      setNewPass("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível redefinir a senha.");
    }
  };

  const saveViewerAccess = async () => {
    if (!accessEditor) return;
    try {
      await adminSetViewerUnits({ data: { user_id: accessEditor.id, unit_ids: accessSelection } });
      toast.success("Unidades autorizadas atualizadas.");
      setAccessEditor(null);
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível atualizar as unidades autorizadas.");
    }
  };

  const toggleActive = async (userId: string, ativo: boolean) => {
    try {
      await adminSetAccess({ data: { user_id: userId, ativo } });
      toast.success(ativo ? "Acesso liberado." : "Acesso bloqueado.");
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível atualizar.");
    }
  };

  return (
    <>
      <PageHeader
        title="Usuários"
        description="Somente o Administrador Principal cria usuários e define os perfis de acesso."
        actions={
          <Button size="sm" onClick={() => setOpen(true)}>
            <Plus /> Novo usuário
          </Button>
        }
      />

      <Panel bodyClassName="p-0">
        {isPending ? (
          <div className="p-4">
            <TableSkeleton rows={5} cols={5} />
          </div>
        ) : users.length === 0 ? (
          <div className="p-4">
            <EmptyState title="Nenhum usuário" description="Crie o primeiro usuário acima." />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table className="min-w-[860px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>E-mail</TableHead>
                  <TableHead>Perfil</TableHead>
                  <TableHead>Unidade / acesso</TableHead>
                  <TableHead>Acesso</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((u) => {
                  const me = u.user_id === user?.id;
                  const unit = units.find((x) => x.id === u.unit_id);
                  return (
                    <TableRow key={u.id}>
                      <TableCell className="font-medium">
                        {u.nome}
                        {me && <span className="ml-1 text-[11px] text-muted-foreground">(você)</span>}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{u.email}</TableCell>
                      <TableCell>
                        <Badge variant={u.role === "admin" ? "default" : "secondary"}>
                          {u.role === "admin" ? "Administrador" : u.role === "visualizador" ? "Depósito Central — Gabinete SEMADS" : u.role === "responsavel" ? "Responsável" : "Pendente"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {u.role === "visualizador"
                          ? (accessMap[u.user_id] ?? []).map((id) => units.find((x) => x.id === id)?.nome).filter(Boolean).join(", ") || "Nenhuma unidade autorizada"
                          : unit?.nome ?? "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant={u.ativo ? "secondary" : "outline"}>
                          {u.ativo ? "Liberado" : u.role ? "Desativado" : "Aguardando liberação"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex flex-wrap justify-end gap-1">
                          <select
                            value={u.role ?? "responsavel"}
                            disabled={me}
                            aria-label={`Perfil de ${u.nome}`}
                            onChange={(e) => changeRole(u.user_id, e.target.value as AppRole)}
                            className="h-8 rounded-md border border-input bg-background px-1.5 text-xs disabled:opacity-50"
                          >
                            <option value="responsavel">Responsável de unidade</option>
                          </select>
                          <select
                            value={u.unit_id ?? ""}
                            disabled={me || u.role === "admin"}
                            aria-label={`Unidade de ${u.nome}`}
                            onChange={(e) => void adminSetUnit({ data: { user_id: u.user_id, unit_id: e.target.value || null } }).then(refresh).catch((err) => toast.error(err instanceof Error ? err.message : "Não foi possível alterar a unidade."))}
                            className="h-8 rounded-md border border-input bg-background px-1.5 text-xs disabled:opacity-50"
                          >
                            <option value="">Sem unidade</option>
                            {units.map((unit) => <option key={unit.id} value={unit.id}>{unit.sigla ?? unit.nome}</option>)}
                          </select>
                          {u.role === "visualizador" && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setAccessEditor({ id: u.user_id, nome: u.nome });
                                setAccessSelection(accessMap[u.user_id] ?? []);
                              }}
                            >
                              <Settings2 /> Unidades
                            </Button>
                          )}
                          <Button variant="ghost" size="sm" onClick={() => setReset({ id: u.user_id, nome: u.nome })}>
                            <KeyRound /> Senha
                          </Button>
                          {!me && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => toggleActive(u.user_id, !u.ativo)}
                            >
                              {u.ativo ? "Bloquear" : "Liberar"}
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </Panel>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Novo usuário</DialogTitle>
          </DialogHeader>
          <form onSubmit={create} className="space-y-4">
            <Field label="Nome completo" htmlFor="us-nome" required>
              <Input
                id="us-nome"
                value={form.nome}
                onChange={(e) => setForm({ ...form, nome: e.target.value })}
              />
            </Field>
            <Field label="E-mail" htmlFor="us-email" required hint="Será usado para entrar no sistema.">
              <Input
                id="us-email"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </Field>
            <Field label="Senha inicial" htmlFor="us-senha" required hint="Mínimo de 8 caracteres.">
              <Input
                id="us-senha"
                type="password"
                value={form.senha}
                onChange={(e) => setForm({ ...form, senha: e.target.value })}
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Perfil" htmlFor="us-role" required>
                <select
                  id="us-role"
                  value={form.role}
                  onChange={(e) => {
                    const role = e.target.value as AppRole;
                    setForm({
                      ...form,
                      role,
                      unit_id: role === "visualizador"
                        ? units.find((u) => u.nome.trim().toLowerCase() === "gabinete semads")?.id ?? ""
                        : "",
                      viewer_unit_ids: role === "visualizador" ? form.viewer_unit_ids : [],
                    });
                  }}
                  className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                >
                  <option value="responsavel">Responsável de unidade</option>
                  <option value="visualizador">Depósito Central — Gabinete SEMADS</option>
                </select>
              </Field>
              <Field
                label="Unidade"
                htmlFor="us-unit"
                required={form.role === "responsavel"}
                hint="Responsáveis só veem a própria unidade."
              >
                <select
                  id="us-unit"
                  value={form.unit_id}
                  disabled={form.role === "visualizador"}
                  onChange={(e) => setForm({ ...form, unit_id: e.target.value })}
                  className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm disabled:opacity-50"
                >
                  <option value="">{form.role === "visualizador" ? "Gabinete SEMADS" : "Selecione..."}</option>
                  {units.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.nome}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={saving}>
                {saving && <Loader2 className="animate-spin" />}
                Criar usuário
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(accessEditor)} onOpenChange={(o) => !o && setAccessEditor(null)}>
        <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Unidades autorizadas — {accessEditor?.nome}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            O usuário do Gabinete SEMADS opera o Depósito Central, envia materiais por Recibo de Produtos e visualiza o estoque de todas as unidades.
          </p>
          <div className="grid max-h-72 gap-2 overflow-y-auto rounded-md border p-3">
            {units.filter((u) => u.nome.trim().toLowerCase() !== "gabinete semads").map((u) => (
              <label key={u.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={accessSelection.includes(u.id)}
                  onChange={(e) => setAccessSelection(e.target.checked
                    ? [...accessSelection, u.id]
                    : accessSelection.filter((id) => id !== u.id)
                  )}
                />
                <span>{u.nome}</span>
              </label>
            ))}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAccessEditor(null)}>Cancelar</Button>
            <Button onClick={saveViewerAccess} disabled={!accessSelection.length}>Salvar unidades</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(reset)} onOpenChange={(o) => !o && setReset(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nova senha</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Defina uma nova senha para <strong>{reset?.nome}</strong>. Informe ao usuário.
          </p>
          <Field label="Nova senha" htmlFor="rs-senha" required hint="Mínimo de 8 caracteres.">
            <Input
              id="rs-senha"
              type="password"
              value={newPass}
              onChange={(e) => setNewPass(e.target.value)}
            />
          </Field>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setReset(null)}>
              Cancelar
            </Button>
            <Button onClick={doReset}>Redefinir senha</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
