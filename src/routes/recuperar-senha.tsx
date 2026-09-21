import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Loader2, MailCheck, Send } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, Panel } from "@/components/ui-kit";
import { AuthLayout } from "@/components/auth-layout";

export const Route = createFileRoute("/recuperar-senha")({
  head: () => ({
    meta: [
      { title: "Recuperar senha — Controle de Inventário" },
      {
        name: "description",
        content: "Receba um link para criar uma nova senha de acesso ao controle de inventário.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: RecoverPage,
});

function RecoverPage() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/redefinir-senha`,
    });
    setSubmitting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setSent(true);
  };

  return (
    <AuthLayout
      title="Recuperar acesso"
      subtitle="Informe o e-mail cadastrado para receber o link de redefinição."
      footer={
        <Link to="/auth" className="font-semibold text-primary underline-offset-4 hover:underline">
          Voltar para o login
        </Link>
      }
    >
      {sent ? (
        <Panel>
          <div className="flex flex-col items-start gap-2">
            <MailCheck className="size-6 text-primary" />
            <p className="text-sm font-semibold">Verifique sua caixa de entrada</p>
            <p className="text-sm text-muted-foreground">
              Se existir um cadastro para <strong>{email}</strong>, enviaremos um link para criar uma
              nova senha. Confira também a pasta de spam.
            </p>
          </div>
        </Panel>
      ) : (
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
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? <Loader2 className="animate-spin" /> : <Send />}
              Enviar link de redefinição
            </Button>
          </form>
        </Panel>
      )}
    </AuthLayout>
  );
}
