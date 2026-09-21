import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, LogIn } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { getSystemStatus } from "@/lib/admin.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, Panel } from "@/components/ui-kit";
import { AuthLayout } from "@/components/auth-layout";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Entrar — Controle de Inventário" },
      {
        name: "description",
        content: "Acesso restrito ao controle de estoque das dispensas da Assistência Social.",
      },
      { property: "og:title", content: "Entrar — Controle de Inventário" },
      {
        property: "og:description",
        content: "Acesso restrito aos usuários cadastrados do sistema.",
      },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [hasAdmin, setHasAdmin] = useState(true);

  useEffect(() => {
    let active = true;
    void getSystemStatus()
      .then((status) => active && setHasAdmin(status.hasAdmin))
      .catch(() => active && setHasAdmin(true));
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!loading && session) navigate({ to: "/dashboard", replace: true });
  }, [loading, session, navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password: senha,
    });
    setSubmitting(false);
    if (error) {
      toast.error(
        error.message.toLowerCase().includes("invalid login credentials")
          ? "E-mail ou senha incorretos."
          : error.message,
      );
      return;
    }
    navigate({ to: "/dashboard", replace: true });
  };

  return (
    <AuthLayout
      title="Entrar no sistema"
      subtitle="Use as credenciais fornecidas pelo Administrador Principal."
      footer={
        !hasAdmin ? (
          <p>
            Nenhum usuário cadastrado ainda.{" "}
            <Link to="/setup" className="font-semibold text-primary underline-offset-4 hover:underline">
              Cadastrar o Administrador Principal
            </Link>
          </p>
        ) : (
          <p>
            Esqueceu a senha?{" "}
            <Link
              to="/recuperar-senha"
              className="font-semibold text-primary underline-offset-4 hover:underline"
            >
              Recuperar acesso
            </Link>
          </p>
        )
      }
    >
      <Panel>
        <form onSubmit={submit} className="space-y-4">
          <Field label="E-mail" htmlFor="email" required>
            <Input
              id="email"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="nome@exemplo.org"
            />
          </Field>
          <Field label="Senha" htmlFor="senha" required>
            <Input
              id="senha"
              type="password"
              autoComplete="current-password"
              required
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              placeholder="••••••••"
            />
          </Field>
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? <Loader2 className="animate-spin" /> : <LogIn />}
            Entrar
          </Button>
        </form>
      </Panel>
    </AuthLayout>
  );
}
