import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Camera, Check, ImageIcon, Loader2, Upload, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/ia-visao")({
  component: IaVisaoPage,
});

type Item = {
  nome: string;
  quantidade: number | null;
  unidade: string | null;
};

function IaVisaoPage() {
  const [image, setImage] = useState<string | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleFile = (file?: File) => {
    if (!file) return;
    setError("");
    setItems([]);
    const reader = new FileReader();
    reader.onload = () => setImage(String(reader.result));
    reader.readAsDataURL(file);
  };

  const analyze = async () => {
    if (!image) return;
    setLoading(true);
    setError("");
    try {
      const { data, error: invokeError } = await supabase.functions.invoke(
        "analyze-inventory-image",
        { body: { image } },
      );
      if (invokeError) throw invokeError;
      if (!data?.itens) throw new Error("Resposta inválida da IA.");
      setItems(data.itens);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Erro ao analisar a imagem.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-background p-4 md:p-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">IA de Visão</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Tire uma foto ou envie uma imagem da lista/nota. A IA identifica os produtos e as quantidades.
          </p>
        </div>

        <div className="rounded-xl border bg-card p-5 shadow-sm">
          <label className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-8 text-center transition hover:bg-muted/40">
            <Camera className="h-10 w-10 text-primary" />
            <span className="font-semibold">Tirar foto ou escolher imagem</span>
            <span className="text-sm text-muted-foreground">JPG, PNG ou WEBP</span>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => handleFile(e.target.files?.[0])}
            />
          </label>

          {image && (
            <div className="mt-5 space-y-4">
              <div className="relative overflow-hidden rounded-lg border">
                <img src={image} alt="Documento para análise" className="max-h-[420px] w-full object-contain" />
                <button
                  type="button"
                  onClick={() => { setImage(null); setItems([]); }}
                  className="absolute right-2 top-2 rounded-full bg-background/90 p-2 shadow"
                  aria-label="Remover imagem"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <button
                type="button"
                onClick={analyze}
                disabled={loading}
                className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-3 font-semibold text-primary-foreground disabled:opacity-60"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageIcon className="h-4 w-4" />}
                {loading ? "Analisando imagem..." : "Analisar com IA"}
              </button>
            </div>
          )}
        </div>

        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
            {error}
          </div>
        )}

        {items.length > 0 && (
          <div className="rounded-xl border bg-card p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <Check className="h-5 w-5 text-primary" />
              <div>
                <h2 className="font-semibold">Produtos identificados</h2>
                <p className="text-xs text-muted-foreground">
                  Confira os dados antes de lançar no estoque.
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="px-3 py-2">Produto</th>
                    <th className="px-3 py-2">Quantidade</th>
                    <th className="px-3 py-2">Unidade</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, index) => (
                    <tr key={`${item.nome}-${index}`} className="border-b last:border-0">
                      <td className="px-3 py-3 font-medium">{item.nome}</td>
                      <td className="px-3 py-3">{item.quantidade ?? "Não identificada"}</td>
                      <td className="px-3 py-3">{item.unidade ?? "Não identificada"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          A leitura da IA é uma estimativa. Sempre confira os produtos e quantidades antes de confirmar uma movimentação.
        </p>
      </div>
    </main>
  );
}
