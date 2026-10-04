import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Item = {
  nome: string;
  quantidade: number | null;
  unidade: string | null;
};

const SYSTEM_PROMPT = `
Você é a IA de visão do sistema Controle de Estoque da Assistência Social.
Analise a foto enviada e extraia SOMENTE produtos e suas quantidades.
Ignore preços, valores em reais, códigos, descontos, subtotais e totais financeiros.
Aceite listas, notas, recibos, tabelas e fotos de documentos.
Se a quantidade não estiver legível, use null.
Não invente produtos ou quantidades.
Normalize unidades para: Kg, Unidade, Pacote, Caixa, Litro, Fardo, Pote, Saco ou Outro.
Responda SOMENTE JSON válido neste formato:
{"itens":[{"nome":"Arroz","quantidade":25,"unidade":"Kg"}]}
`;

function cleanJson(text: string): { itens: Item[] } {
  const stripped = text.replace(/^```json\s*/i, "").replace(/\s*```$/i, "").trim();
  const parsed = JSON.parse(stripped);
  if (!Array.isArray(parsed.itens)) return { itens: [] };
  return {
    itens: parsed.itens.map((item: Record<string, unknown>) => ({
      nome: typeof item.nome === "string" ? item.nome.trim() : "",
      quantidade:
        typeof item.quantidade === "number" && Number.isFinite(item.quantidade)
          ? item.quantidade
          : null,
      unidade: typeof item.unidade === "string" ? item.unidade : null,
    })).filter((item: Item) => item.nome),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { image } = await req.json();
    if (typeof image !== "string" || !image.startsWith("data:image/")) {
      return new Response(JSON.stringify({ error: "Imagem inválida." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({
        error: "A IA da Lovable ainda não está habilitada neste projeto. Ative o conector de IA da Lovable e publique novamente.",
      }), {
        status: 503,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3.8-flash",
        messages: [{
          role: "user",
          content: [
            { type: "text", text: SYSTEM_PROMPT },
            { type: "image_url", image_url: { url: image } },
          ],
        }],
        temperature: 0,
      }),
    });

    if (!response.ok) {
      const details = await response.text();
      console.error("Lovable AI error:", response.status, details);
      return new Response(JSON.stringify({
        error: "A IA não conseguiu analisar a imagem. Tente uma foto mais nítida.",
      }), {
        status: response.status === 429 ? 429 : 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const text = data?.choices?.[0]?.message?.content;
    if (typeof text !== "string") throw new Error("Resposta da IA sem conteúdo.");

    const result = cleanJson(text);
    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error(error);
    return new Response(JSON.stringify({
      error: "Não foi possível analisar a imagem.",
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
