import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Loader2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { registerUser } from "@/lib/admin.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, Panel } from "@/components/ui-kit";
import { AuthLayout } from "@/components/auth-layout";

export const Route = createFileRoute("/cadastro")({
  head: () => ({
    meta: [
      { title: "Cadastro — Controle de Estoque" },
      { name: "description", content: "Solicite acesso ao sistema de controle de estoque." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: RegisterPage,
});

function RegisterPage() {
  const navigate = useNavigate();
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (senha !== confirmacao) {
      toast.error("As senhas não coincidem.");
      return;
    }
    setSubmitting(true);
    try {
      const result = await registerUser({ data: { nome, email, senha } });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Cadastro realizado. Aguarde a liberação do CEO.");
      navigate({ to: "/auth", replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível concluir o cadastro.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout
      title="Solicitar acesso"
      subtitle="Cadastre seus dados. O CEO irá analisar e liberar seu acesso ao sistema."
      footer={
        <p>
          Já possui cadastro?{" "}
          <Link to="/auth" className="font-semibold text-primary underline-offset-4 hover:underline">
            Voltar para o login
          </Link>
        </p>
      }
    >
      <Panel>
        <form onSubmit={submit} className="space-y-4">
          <Field label="Nome completo" htmlFor="cad-nome" required>
            <Input id="cad-nome" value={nome} onChange={(e) => setNome(e.target.value)} autoComplete="name" required />
          </Field>
          <Field label="E-mail" htmlFor="cad-email" required>
            <Input id="cad-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
          </Field>
          <Field label="Senha" htmlFor="cad-senha" required hint="Mínimo de 8 caracteres.">
            <Input id="cad-senha" type="password" value={senha} onChange={(e) => setSenha(e.target.value)} autoComplete="new-password" minLength={8} required />
          </Field>
          <Field label="Confirmar senha" htmlFor="cad-confirmacao" required>
            <Input id="cad-confirmacao" type="password" value={confirmacao} onChange={(e) => setConfirmacao(e.target.value)} autoComplete="new-password" minLength={8} required />
          </Field>
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? <Loader2 className="animate-spin" /> : <UserPlus />}
            Criar cadastro
          </Button>
        </form>
      </Panel>
    </AuthLayout>
  );
}
