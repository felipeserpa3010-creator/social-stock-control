import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Loader2, Plus, Trash2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { unitsOptions, usersOptions, type AppRole } from "@/lib/queries";
import { adminDeleteUser, adminCreateUser, adminResetPassword, adminSetAccess, adminSetRole, adminSetUnit } from "@/lib/admin.functions";
import { EmptyState, PageHeader, Panel, TableSkeleton } from "@/components/ui-kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Field } from "@/components/ui-kit";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/usuarios")({
  head: () => ({
    meta: [
      { title: "Usuários — SEMADS" },
      {
        name: "description",
        content: "Cadastro e perfis de acesso dos usuários do controle de estoque.",
      },
      { property: "og:title", content: "Usuários — SEMADS" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
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
  const [deleting, setDeleting] = useState<{ id: string; nome: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["users"] });
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
        unit_id: form.role !== "visualizador"
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
    setBusy(userId);
    try {
      await adminSetRole({ data: { user_id: userId, role } });
      toast.success("Perfil atualizado.");
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível alterar o perfil.");
    } finally { setBusy(null); }
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

  const toggleActive = async (userId: string, ativo: boolean) => {
    setBusy(userId);
    try {
      await adminSetAccess({ data: { user_id: userId, ativo } });
      toast.success(ativo ? "Acesso liberado." : "Acesso bloqueado.");
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível atualizar.");
    } finally { setBusy(null); }
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
          <div className="divide-y divide-border">
            {users.map((u) => {
              const me = u.user_id === user?.id;
              const protectedUser = me || u.role === "admin";
              return (
                <div key={u.id} className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
                  <div className="min-w-0 space-y-2">
                    <p className="font-medium break-words">{u.nome}{me && <span className="ml-1 text-xs text-muted-foreground">(você)</span>}</p>
                    <p className="text-sm text-muted-foreground break-all">{u.email}</p>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="secondary">{u.role === "admin" ? "Administrador" : u.role === "visualizador" ? "Visualizador" : u.role === "controlador_estoque" ? "Controlador de estoque" : u.role === "responsavel" ? "Usuário de unidade" : "Perfil pendente"}</Badge>
                      <Badge variant={u.ativo ? "secondary" : "outline"}>{u.ativo ? "Liberado" : "Aguardando liberação / bloqueado"}</Badge>
                    </div>
                  </div>
                  <div className="min-w-0 space-y-3">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="Perfil de acesso" htmlFor={`role-${u.id}`}>
                        <select id={`role-${u.id}`} value={u.role ?? ""} disabled={protectedUser || busy === u.user_id}
                          onChange={(e) => void changeRole(u.user_id, e.target.value as AppRole)}
                          className="h-9 w-full min-w-0 rounded-md border border-input bg-background px-2 text-sm disabled:opacity-50">
                          <option value="" disabled>Definir perfil...</option>
                          {u.role === "admin" && <option value="admin">Administrador Principal</option>}
                          <option value="controlador_estoque">Controlador de estoque</option>
                          <option value="responsavel">Usuário de unidade</option>
                          <option value="visualizador">Visualizador (somente consulta)</option>
                        </select>
                      </Field>
                      <Field label="Unidade" htmlFor={`unit-${u.id}`}>
                        <select id={`unit-${u.id}`} value={u.unit_id ?? ""} disabled={protectedUser || u.role === "visualizador" || busy === u.user_id}
                          onChange={(e) => void adminSetUnit({ data: { user_id: u.user_id, unit_id: e.target.value || null } }).then(refresh).catch((err) => toast.error(err instanceof Error ? err.message : "Não foi possível alterar a unidade."))}
                          className="h-9 w-full min-w-0 rounded-md border border-input bg-background px-2 text-sm disabled:opacity-50">
                          <option value="">Selecione a unidade</option>
                          {units.map((unit) => <option key={unit.id} value={unit.id}>{unit.nome}</option>)}
                        </select>
                      </Field>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {!protectedUser && <Button size="sm" variant={u.ativo ? "outline" : "default"} disabled={busy === u.user_id} onClick={() => void toggleActive(u.user_id, !u.ativo)}><ShieldCheck />{u.ativo ? "Bloquear acesso" : "Liberar acesso"}</Button>}
                      <Button variant="outline" size="sm" onClick={() => setReset({ id: u.user_id, nome: u.nome })}><KeyRound />Senha</Button>
                      {!protectedUser && <Button variant="destructive" size="sm" disabled={busy === u.user_id} onClick={() => setDeleting({ id: u.user_id, nome: u.nome })}><Trash2 />Excluir usuário</Button>}
                    </div>
                  </div>
                </div>
              );
            })}
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
                  <option value="controlador_estoque">Controlador de estoque</option>
                  <option value="responsavel">Usuário de unidade</option>
                  <option value="visualizador">Visualizador (somente consulta)</option>
                </select>
              </Field>
              <Field
                label="Unidade"
                htmlFor="us-unit"
                required={form.role !== "visualizador"}
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

      <Dialog open={Boolean(deleting)} onOpenChange={(o) => { if (!o && !busy) setDeleting(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Excluir usuário</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Excluir a conta de <strong>{deleting?.nome}</strong>? Esta ação é definitiva. O histórico de movimentações será preservado.</p>
          <DialogFooter>
            <Button variant="ghost" disabled={Boolean(busy)} onClick={() => setDeleting(null)}>Cancelar</Button>
            <Button variant="destructive" disabled={Boolean(busy)} onClick={async () => {
              if (!deleting) return;
              setBusy(deleting.id);
              try {
                const result = await adminDeleteUser({ data: { user_id: deleting.id } });
                if (!result.ok) { toast.error(result.error); return; }
                toast.success("Usuário excluído.");
                setDeleting(null);
                refresh();
              } catch (err) { toast.error(err instanceof Error ? err.message : "Não foi possível excluir o usuário."); }
              finally { setBusy(null); }
            }}>{busy && <Loader2 className="animate-spin" />}Excluir usuário</Button>
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
