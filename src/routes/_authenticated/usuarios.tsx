import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { unitsOptions, setUserActive, usersOptions, type AppRole } from "@/lib/queries";
import { adminCreateUser, adminResetPassword, adminSetRole } from "@/lib/admin.functions";
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
      { title: "Usuários — Controle de Inventário" },
      {
        name: "description",
        content: "Cadastro e perfis de acesso dos usuários do controle de inventário.",
      },
      { property: "og:title", content: "Usuários — Controle de Inventário" },
      {
        property: "og:description",
        content: "Gerencie quem acessa o sistema e a qual unidade cada responsável pertence.",
      },
    ],
  }),
  component: UsersPage,
});

function UsersPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: users = [], isPending } = useQuery(usersOptions(true));
  const { data: units = [] } = useQuery(unitsOptions(true));
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    nome: "",
    email: "",
    senha: "",
    role: "responsavel" as AppRole,
    unit_id: "",
  });
  const [reset, setReset] = useState<{ id: string; nome: string } | null>(null);
  const [newPass, setNewPass] = useState("");

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["users"] });
  };

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await adminCreateUser({
        nome: form.nome,
        email: form.email,
        senha: form.senha,
        role: form.role,
        unit_id: form.role === "responsavel" ? form.unit_id || null : null,
      });
      toast.success("Usuário criado.");
      setOpen(false);
      setForm({ nome: "", email: "", senha: "", role: "responsavel", unit_id: "" });
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível criar o usuário.");
    } finally {
      setSaving(false);
    }
  };

  const changeRole = async (userId: string, role: AppRole) => {
    try {
      await adminSetRole({ user_id: userId, role });
      toast.success("Perfil atualizado.");
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível alterar o perfil.");
    }
  };

  const doReset = async () => {
    if (!reset) return;
    try {
      await adminResetPassword({ user_id: reset.id, senha: newPass });
      toast.success(`Nova senha definida para ${reset.nome}.`);
      setReset(null);
      setNewPass("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível redefinir a senha.");
    }
  };

  const toggleActive = async (userId: string, ativo: boolean) => {
    try {
      await setUserActive(userId, ativo);
      toast.success(ativo ? "Usuário reativado." : "Usuário desativado.");
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
                  <TableHead>Unidade</TableHead>
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
                          {u.role === "admin" ? "Administrador" : "Responsável"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{unit?.nome ?? "—"}</TableCell>
                      <TableCell>
                        <Badge variant={u.ativo ? "secondary" : "outline"}>
                          {u.ativo ? "Ativo" : "Desativado"}
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
                            <option value="admin">Administrador</option>
                            <option value="responsavel">Responsável</option>
                          </select>
                          <Button variant="ghost" size="sm" onClick={() => setReset({ id: u.user_id, nome: u.nome })}>
                            <KeyRound /> Senha
                          </Button>
                          {!me && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => toggleActive(u.user_id, !u.ativo)}
                            >
                              {u.ativo ? "Desativar" : "Ativar"}
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
                  onChange={(e) => setForm({ ...form, role: e.target.value as AppRole })}
                  className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                >
                  <option value="responsavel">Responsável de unidade</option>
                  <option value="admin">Administrador</option>
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
                  disabled={form.role === "admin"}
                  onChange={(e) => setForm({ ...form, unit_id: e.target.value })}
                  className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm disabled:opacity-50"
                >
                  <option value="">{form.role === "admin" ? "Todas as unidades" : "Selecione..."}</option>
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
