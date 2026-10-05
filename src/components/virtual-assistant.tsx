import { useMemo, useState } from "react";
import { Bot, MessageCircle, Send, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { ASSISTANT_SOURCES, CONSERVATION_TIPS, FOOD_REFERENCES, SYSTEM_HELP } from "@/lib/assistant-data";

type Message = { from: "bot" | "user"; text: string };

const QUICK = [
  "Quantas laranjas dão aproximadamente 1 kg?",
  "Como conservar frutas e verduras?",
  "Como funciona o lançamento em massa?",
  "Como confirmar um Recibo de Produtos?",
  "Onde consultar os recibos de entrega?",
];

function normalize(value: string) {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function findFood(question: string) {
  const q = normalize(question);
  return [...FOOD_REFERENCES]
    .sort((a, b) => Math.max(...b.aliases.map((x) => x.length)) - Math.max(...a.aliases.map((x) => x.length)))
    .find((food) => food.aliases.some((alias) => q.includes(normalize(alias))));
}

function parseTargetGrams(question: string) {
  const q = normalize(question);
  const match =
    q.match(/(?:para|de|em|ate|atingir|chegar a)\s+(\d+(?:[.,]\d+)?)\s*(kg|quilo|quilos|g|grama|gramas)/) ??
    q.match(/(\d+(?:[.,]\d+)?)\s*(kg|quilo|quilos|g|grama|gramas)/);
  if (!match) return 1000;
  const rawValue = match[1];
  const rawUnit = match[2];
  if (!rawValue || !rawUnit) return 1000;
  const value = Number(rawValue.replace(",", "."));
  return rawUnit.startsWith("kg") || rawUnit.startsWith("quilo") ? value * 1000 : value;
}

function parseExplicitQuantity(question: string) {
  const q = normalize(question);
  const food = findFood(question);
  if (!food) return null;
  const primaryAlias = food.aliases[0];
  if (!primaryAlias) return null;
  const foodPosition = q.indexOf(normalize(primaryAlias));
  if (foodPosition < 0) return null;
  const beforeFood = q.slice(0, foodPosition);
  const match = beforeFood.match(/(\d+(?:[.,]\d+)?)\s*(?:unidades?|unid\.?|un\.?)?\s*$/);
  if (!match) return null;
  const rawQuantity = match[1];
  return rawQuantity ? Number(rawQuantity.replace(",", ".")) : null;
}

function weightAnswer(question: string) {
  const food = findFood(question);
  if (!food) return "Posso calcular a quantidade usando a base de referências cadastrada. Informe o alimento, por exemplo: “quantas bananas dão 1 kg?” ou “10 laranjas pesam quanto?”";

  const explicitQuantity = parseExplicitQuantity(question);
  if (explicitQuantity !== null) {
    const totalKg = (explicitQuantity * food.weightG) / 1000;
    return `Referência para ${food.name}: 1 ${food.unitLabel} ≈ ${food.weightG} g.\n\n${explicitQuantity} unidade(s) ≈ ${totalKg.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} kg.\n\nFonte dos dados: ${ASSISTANT_SOURCES.food}\n\n⚠️ Importante: esses valores são apenas médias de referência e não representam um cálculo exato. O peso pode variar conforme tamanho, variedade e estado do alimento.`;
  }

  const targetG = parseTargetGrams(question);
  const quantity = targetG / food.weightG;
  const rounded = Math.round(quantity);
  const targetLabel = targetG >= 1000 ? `${(targetG / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} kg` : `${targetG.toLocaleString("pt-BR")} g`;

  return `Para ${targetLabel} de ${food.name}, a referência é aproximadamente ${quantity.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} ${food.unitLabel}s — cerca de ${rounded} unidade(s) quando for necessário trabalhar com unidades inteiras.\n\nReferência: 1 ${food.unitLabel} ≈ ${food.weightG} g (${food.preparation}).\n\nFonte dos dados: ${ASSISTANT_SOURCES.food}\n\n⚠️ Importante: esses valores são apenas médias de referência e não representam um cálculo exato. O peso pode variar conforme tamanho, variedade e estado do alimento.`;
}

function conservationAnswer(question: string) {
  const q = normalize(question);
  const tip = CONSERVATION_TIPS.find((item) => item.keywords.some((keyword) => q.includes(normalize(keyword)))) ?? CONSERVATION_TIPS[0];
  if (!tip) return "Não encontrei uma orientação de conservação para este alimento.";
  return `${tip.title}\n\n${tip.text}\n\nFonte: ${ASSISTANT_SOURCES.conservation}`;
}

function systemAnswer(question: string) {
  const q = normalize(question);
  const help = SYSTEM_HELP.find((item) => item.keywords.some((keyword) => q.includes(normalize(keyword))));
  if (help) return `${help.title}\n\n${help.text}`;
  return "Posso ensinar as funções do sistema passo a passo: Painel, Estoque, Entrada, Saída, Média de consumo, Relatórios PDF, Produtos e categorias, Unidades, Usuários e Configurações. Diga o nome da tela que você quer aprender.";
}

function answer(question: string) {
  const q = normalize(question);
  const asksWeight = q.includes("peso") || q.includes("kg") || q.includes("quilo") || q.includes("quantas") || q.includes("quantidade") || Boolean(findFood(question) && (q.includes("unidade") || q.match(/\b\d+\b/)));
  const asksConservation = q.includes("conservar") || q.includes("conservacao") || q.includes("guardar") || q.includes("armazenar") || q.includes("geladeira") || q.includes("freezer") || q.includes("descongelar") || q.includes("higienizar") || q.includes("lavar");
  const asksSystem = q.includes("sistema") || q.includes("painel") || q.includes("estoque") || q.includes("entrada") || q.includes("saida") || q.includes("relatorio") || q.includes("produto") || q.includes("unidade") || q.includes("usuario") || q.includes("configuracao") || q.includes("recibo") || q.includes("lancamento") || q.includes("lote") || q.includes("recebimento") || q.includes("ceo") || q.includes("permissao") || q.includes("imprimir") || q.includes("senha");

  if (asksWeight && findFood(question)) return weightAnswer(question);
  if (asksConservation) return conservationAnswer(question);
  if (asksSystem) return systemAnswer(question);
  if (findFood(question)) return weightAnswer(question);

  return "Sou o Assistente Virtual do Controle de Estoque SEMADS. Posso explicar praticamente todas as funções do sistema, incluindo permissões, estoque, entradas, lançamento em massa, Recibos de Produtos, confirmação de recebimento, saídas, relatórios, usuários, unidades e recuperação de senha. Também informo pesos médios de alimentos e orientações de conservação. Escreva sua dúvida com suas próprias palavras.";
}

export function VirtualAssistant() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([
    { from: "bot", text: "Olá! Sou o Assistente Virtual do Controle de Estoque SEMADS. Posso explicar as funções do sistema, permissões, estoque, lançamentos, Recibos de Produtos, confirmação de recebimento, saídas, relatórios e usuários. Também posso informar pesos médios de alimentos e orientar sobre conservação." },
  ]);

  const suggestions = useMemo(() => QUICK.filter((item) => !messages.some((m) => m.text === item)), [messages]);

  function send(value = input) {
    const text = value.trim();
    if (!text) return;
    setMessages((current) => [...current, { from: "user", text }, { from: "bot", text: answer(text) }]);
    setInput("");
  }

  return (
    <>
      {open && (
        <div className="fixed bottom-20 right-4 z-50 flex w-[min(400px,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-2xl">
          <div className="flex items-center gap-3 bg-sidebar px-4 py-3 text-sidebar-foreground">
            <span className="grid size-9 place-items-center rounded-full bg-sidebar-primary/20"><Bot className="size-5" /></span>
            <div className="flex-1">
              <p className="font-semibold">Assistente Virtual</p>
              <p className="text-xs text-sidebar-foreground/60">Pesos · conservação · uso do sistema</p>
            </div>
            <button onClick={() => setOpen(false)} className="rounded-md p-1 hover:bg-sidebar-accent" aria-label="Fechar"><X className="size-5" /></button>
          </div>

          <div className="flex max-h-[58vh] min-h-[300px] flex-col gap-3 overflow-y-auto p-4">
            {messages.map((message, index) => (
              <div key={index} className={cn("whitespace-pre-line max-w-[90%] rounded-2xl px-3 py-2 text-sm", message.from === "user" ? "ml-auto bg-primary text-primary-foreground" : "mr-auto bg-muted text-foreground")}>
                {message.text}
              </div>
            ))}
            {messages.length === 1 && (
              <div className="mt-auto flex flex-wrap gap-2">
                {suggestions.map((item) => (
                  <button key={item} onClick={() => send(item)} className="rounded-full border border-border px-3 py-1.5 text-xs hover:bg-muted">{item}</button>
                ))}
              </div>
            )}
          </div>

          <form onSubmit={(e) => { e.preventDefault(); send(); }} className="flex gap-2 border-t border-border p-3">
            <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Digite sua pergunta..." className="min-w-0 flex-1 rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" />
            <button type="submit" className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground hover:opacity-90" aria-label="Enviar"><Send className="size-4" /></button>
          </form>
        </div>
      )}

      <button onClick={() => setOpen((value) => !value)} className="fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-full bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-lg transition-transform hover:scale-[1.02]" aria-label="Abrir Assistente Virtual">
        <MessageCircle className="size-5" />
        <span className="hidden sm:inline">Assistente Virtual</span>
      </button>
    </>
  );
}
