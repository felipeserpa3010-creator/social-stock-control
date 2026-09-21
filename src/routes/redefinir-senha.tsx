import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { KeyRound, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, Panel } from "@/components/ui-kit";
import { AuthLayout } from "@/components/auth-layout";

export const Route = createFileRoute("/redefinir-senha")({
  head: () => ({
    meta: [
      { title: "Criar nova senha — Controle de Inventário" },
      {
        name: "description",
        content: "Defina uma nova senha para acessar o controle de inventário.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ResetPage,
});

function ResetPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [checking, setChecking] = useState(true);
  const [senha, setSenha] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setReady(Boolean(data.session));
      setChecking(false);
    });
    return () => {
      active = false;
    };
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (senha !== confirmar) {
      toast.error("As senhas não conferem.");
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.auth.updateUser({ password: senha });
    setSubmitting(false);
    if (error) {
      toast.error(
        error.message.toLowerCase().includes("same")
          ? "A nova senha precisa ser diferente da atual."
          : error.message,
      );
      return;
    }
    toast.success("Senha atualizada com sucesso.");
    navigate({ to: "/dashboard", replace: true });
  };

  if (checking) {
    return (
      <AuthLayout title="Criar nova senha">
        <p className="text-sm text-muted-foreground">Validando o link recebido...</p>
      </AuthLayout>
    );
  }

  if (!ready) {
    return (
      <AuthLayout
        title="Link inválido ou expirado"
        subtitle="Por segurança, a nova senha só pode ser criada a partir do link enviado por e-mail."
        footer={
          <Link
            to="/recuperar-senha"
            className="font-semibold text-primary underline-offset-4 hover:underline"
          >
            Solicitar um novo link
          </Link>
        }
      >
        <Panel>
          <p className="text-sm text-muted-foreground">
            Abra o e-mail mais recente que enviamos e toque em “Redefinir senha”. O link é válido
            por tempo limitado.
          </p>
        </Panel>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Criar nova senha" subtitle="Escolha uma senha com pelo menos 8 caracteres.">
      <Panel>
        <form onSubmit={submit} className="space-y-4">
          <Field label="Nova senha" htmlFor="senha" required>
            <Input
              id="senha"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
            />
          </Field>
          <Field label="Confirmar nova senha" htmlFor="confirmar" required>
            <Input
              id="confirmar"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={confirmar}
              onChange={(e) => setConfirmar(e.target.value)}
            />
          </Field>
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? <Loader2 className="animate-spin" /> : <KeyRound />}
            Salvar nova senha
          </Button>
        </form>
      </Panel>
    </AuthLayout>
  );
}
