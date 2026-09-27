import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { saveSettings, settingsOptions } from "@/lib/queries";
import { fileToLogoDataUrl } from "@/lib/logo";
import { Field, PageHeader, Panel } from "@/components/ui-kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated/configuracoes")({
  head: () => ({
    meta: [
      { title: "Configurações — Controle de Inventário" },
      { name: "description", content: "Nome da instituição, secretaria e logotipo usados nos relatórios." },
      { property: "og:title", content: "Configurações — Controle de Inventário" },
      { property: "og:description", content: "Dados institucionais exibidos nos relatórios PDF." },
    ],
  }),
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: data.user.id, _role: "admin" });
    if (isAdmin !== true) throw redirect({ to: "/dashboard" });
  },
  component: SettingsPage,
});

function SettingsPage() {
  const qc = useQueryClient();
  const { data: settings } = useQuery(settingsOptions());
  const [instituicao, setInstituicao] = useState("");
  const [secretaria, setSecretaria] = useState("");
  const [logo, setLogo] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!settings) return;
    setInstituicao(settings.nome_instituicao ?? "");
    setSecretaria(settings.nome_secretaria ?? "");
    setLogo(settings.logo_url ?? null);
  }, [settings]);

  const onSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await saveSettings({ nome_instituicao: instituicao.trim(), nome_secretaria: secretaria.trim(), logo_url: logo });
      await qc.invalidateQueries({ queryKey: ["settings"] });
      toast.success("Configurações salvas.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível salvar.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <PageHeader title="Configurações" description="Esses dados aparecem no cabeçalho dos relatórios PDF." />
      <Panel title="Dados institucionais">
        <form onSubmit={onSave} className="grid max-w-xl gap-4">
          <Field label="Nome da instituição" htmlFor="inst" required>
            <Input id="inst" value={instituicao} onChange={(e) => setInstituicao(e.target.value)} required />
          </Field>
          <Field label="Secretaria" htmlFor="sec">
            <Input id="sec" value={secretaria} onChange={(e) => setSecretaria(e.target.value)} />
          </Field>
          <Field label="Logotipo" htmlFor="logo" hint="PNG ou JPG. A imagem é reduzida automaticamente.">
            <Input
              id="logo"
              type="file"
              accept="image/*"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                try {
                  setLogo(await fileToLogoDataUrl(file));
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "Imagem inválida.");
                }
              }}
            />
          </Field>
          {logo && (
            <div className="flex items-center gap-3">
              <img src={logo} alt="Logotipo atual" className="h-16 w-auto rounded border border-border bg-card p-1" />
              <Button type="button" variant="outline" size="sm" onClick={() => setLogo(null)}>Remover</Button>
            </div>
          )}
          <div>
            <Button type="submit" disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button>
          </div>
        </form>
      </Panel>
    </>
  );
}
