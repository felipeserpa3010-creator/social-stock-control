import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { bootstrapFirstAdmin } from "@/lib/admin.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, Panel } from "@/components/ui-kit";
import { AuthLayout } from "@/components/auth-layout";

export const Route = createFileRoute("/setup")({
  head: () => ({
    meta: [
      { title: "Configuração inicial — Controle de Estoque" },
      {
        name: "description",
        content: "Cadastro único do Administrador Principal do controle de estoque.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SetupPage,
});

function SetupPage() {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);
  const [blocked, setBlocked] = useState(false);
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const { getSystemStatus } = await import("@/lib/admin.functions");
        const status = await getSystemStatus();
        if (!active) return;
        setBlocked(status.hasAdmin);
      } catch {
        if (active) setBlocked(false);
      } finally {
        if (active) setChecking(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    // Read directly from the form so browser autofill is recognized even when
    // React state has not received an onChange event.
    const formData = new FormData(e.currentTarget);
    const nomeForm = String(formData.get("nome") ?? "").trim();
    const emailForm = String(formData.get("email") ?? "").trim().toLowerCase();
    const senhaForm = String(formData.get("senha") ?? "");
    const confirmarForm = String(formData.get("confirmar") ?? "");

    setNome(nomeForm);
    setEmail(emailForm);
    setSenha(senhaForm);
    setConfirmar(confirmarForm);

    if (!nomeForm) {
      toast.error("Informe o nome completo.");
      return;
    }
    if (!emailForm) {
      toast.error("Informe o e-mail de acesso.");
      return;
    }
    if (senhaForm.length < 8) {
      toast.error("A senha deve ter ao menos 8 caracteres.");
      return;
    }
    if (senhaForm !== confirmarForm) {
      toast.error("As senhas não conferem.");
      return;
    }

    setSubmitting(true);
    try {
      await bootstrapFirstAdmin({ nome: nomeForm, email: emailForm, senha: senhaForm });
      const { error } = await supabase.auth.signInWithPassword({
        email: emailForm,
        password: senhaForm,
      });
      if (error) throw error;
      toast.success("Administrador Principal criado com sucesso.");
      navigate({ to: "/dashboard", replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível concluir o cadastro.");
    } finally {
      setSubmitting(false);
    }
  };

  if (checking) {
    return (
      <AuthLayout title="Configuração inicial">
        <p className="text-sm text-muted-foreground">Verificando o sistema...</p>
      </AuthLayout>
    );
  }

  if (blocked) {
    return (
      <AuthLayout
        title="Sistema já configurado"
        subtitle="O cadastro público do Administrador Principal foi encerrado assim que o primeiro usuário existiu."
        footer={
          <Link to="/auth" className="font-semibold text-primary underline-offset-4 hover:underline">
            Ir para o login
          </Link>
        }
      >
        <Panel>
          <p className="text-sm text-muted-foreground">
            Novos usuários passam a ser criados apenas pelo Administrador Principal, dentro do
            sistema.
          </p>
        </Panel>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Cadastro do Administrador Principal"
      subtitle="Este é o único cadastro aberto. Ele cria o primeiro acesso e bloqueia novos cadastros públicos."
      footer={
        <Link to="/auth" className="font-semibold text-primary underline-offset-4 hover:underline">
          Já tenho acesso
        </Link>
      }
    >
      <Panel>
        <form onSubmit={submit} className="space-y-4">
          <Field label="Nome completo" htmlFor="nome" required>
            <Input
              id="nome"
              name="nome"
              required
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex.: Maria Aparecida Souza"
            />
          </Field>
          <Field label="E-mail de acesso" htmlFor="email" required>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@exemplo.org"
            />
          </Field>
          <Field label="Senha" htmlFor="senha" required hint="Mínimo de 8 caracteres.">
            <Input
              id="senha"
              name="senha"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
            />
          </Field>
          <Field label="Confirmar senha" htmlFor="confirmar" required>
            <Input
              id="confirmar"
              name="confirmar"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={confirmar}
              onChange={(e) => setConfirmar(e.target.value)}
            />
          </Field>
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? <Loader2 className="animate-spin" /> : <ShieldCheck />}
            Criar Administrador Principal
          </Button>
        </form>
      </Panel>
    </AuthLayout>
  );
}
