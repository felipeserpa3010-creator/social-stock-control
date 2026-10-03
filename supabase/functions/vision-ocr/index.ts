const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const stockSchema = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          produto: { type: "string" },
          quantidade: { type: "number" },
          unidade: { type: "string" },
        },
        required: ["produto", "quantidade", "unidade"],
        additionalProperties: false,
      },
    },
  },
  required: ["items"],
  additionalProperties: false,
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Usuário não autenticado." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const imageDataUrl = body?.image_data_url;

    if (typeof imageDataUrl !== "string" || !imageDataUrl.startsWith("data:image/")) {
      return new Response(JSON.stringify({ error: "Imagem inválida." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (imageDataUrl.length > 12_000_000) {
      return new Response(JSON.stringify({ error: "Imagem muito grande. Envie uma foto menor." }), {
        status: 413,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
    const openaiKey = Deno.env.get("OPENAI_API_KEY");

    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error("Configuração do Supabase não encontrada.");
    }
    if (!openaiKey) {
      return new Response(JSON.stringify({
        error: "A API de visão ainda não foi configurada. Adicione OPENAI_API_KEY nos secrets da função vision-ocr.",
      }), {
        status: 503,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.57.2");
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Sessão inválida ou expirada." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: isAdmin, error: adminError } = await supabase.rpc("is_admin");
    if (adminError || !isAdmin) {
      return new Response(JSON.stringify({ error: "Somente o CEO/administrador pode usar o lançamento por documento." }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const prompt = `
Você é um leitor de documentos de estoque para uma secretaria de assistência social.

Analise a imagem inteira com atenção, especialmente tabelas e cotações. Extraia TODOS os produtos/itens realmente listados no documento, mesmo que sejam muitos.

Para cada item:
- produto: use somente o nome principal do produto, curto e claro, sem marca, sabor, código, peso embutido ou descrição comercial. Exemplos: "CEBOLA II KG" -> "CEBOLA"; "SALSICHA HOT DOG BOVINA KG" -> "SALSICHA"; "TOMATE ANAPOLIS KG" -> "TOMATE"; "LINGUIÇA CALABRESA SADIA KG" -> "LINGUIÇA"; "TEMPERO ARISCO 1KG COMPLETO" -> "TEMPERO"; "SUCO DA FRUTA 200ML ABACAXI" -> "SUCO"; "LIMÃO KG" -> "LIMÃO"; "REPOLHO VERDE KG" -> "REPOLHO".
- quantidade: use a quantidade da coluna de quantidade, nunca o preço unitário e nunca o valor total. Preserve casas decimais quando existirem.
- unidade: identifique a unidade impressa (kg, g, unidade, pacote, caixa, fardo, saco, litro, ml, pote, frasco, lata, dúzia, pc ou outro).
- Ignore preço, valor total, subtotal, desconto, código, CNPJ, CPF, data, endereço, impostos e cabeçalhos.
- Não invente itens. Se uma linha estiver ilegível, tente pela imagem, mas só retorne o item se houver evidência suficiente.
- Em tabelas, percorra todas as linhas de cima até baixo e não pare depois dos primeiros itens.
- Se a mesma mercadoria aparecer em linhas distintas, mantenha as linhas distintas.

Retorne somente o JSON solicitado pelo schema.
`;

    const openaiResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openaiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-6-luna",
        input: [{
          role: "user",
          content: [
            { type: "input_text", text: prompt },
            { type: "input_image", image_url: imageDataUrl, detail: "high" },
          ],
        }],
        text: {
          format: {
            type: "json_schema",
            name: "stock_document",
            strict: true,
            schema: stockSchema,
          },
        },
        max_output_tokens: 4000,
      }),
    });

    const openaiJson = await openaiResponse.json();
    if (!openaiResponse.ok) {
      console.error("OpenAI vision error:", openaiJson);
      throw new Error(openaiJson?.error?.message || "A API de visão não conseguiu analisar a imagem.");
    }

    const outputText = openaiJson?.output_text;
    if (typeof outputText !== "string" || !outputText.trim()) {
      throw new Error("A API de visão não retornou itens legíveis.");
    }

    let parsed;
    try {
      parsed = JSON.parse(outputText);
    } catch {
      throw new Error("A API de visão retornou uma resposta inválida.");
    }

    const items = Array.isArray(parsed?.items)
      ? parsed.items
          .filter((item) =>
            item &&
            typeof item.produto === "string" &&
            item.produto.trim().length >= 2 &&
            typeof item.quantidade === "number" &&
            Number.isFinite(item.quantidade) &&
            item.quantidade > 0 &&
            typeof item.unidade === "string" &&
            item.unidade.trim().length > 0
          )
          .map((item) => ({
            produto: item.produto.trim(),
            quantidade: item.quantidade,
            unidade: item.unidade.trim().toLowerCase(),
          }))
      : [];

    return new Response(JSON.stringify({
      items,
      source: "openai-vision",
      model: openaiJson.model ?? "gpt-6-luna",
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("vision-ocr error:", error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : "Não foi possível analisar o documento.",
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
