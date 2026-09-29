import { useMemo, useState } from "react";
import { Bot, MessageCircle, Send, X } from "lucide-react";
import { cn } from "@/lib/utils";

type Message = { from: "bot" | "user"; text: string };

const QUICK = [
  "Como uso o sistema?",
  "Como conservar frutas e verduras?",
  "Como calcular peso por quantidade?",
];

function answer(text: string) {
  const q = text.toLowerCase();

  if (q.includes("conservar") || q.includes("conservação") || q.includes("guardar") || q.includes("dispensa")) {
    return "Para conservar melhor os alimentos, mantenha a despensa limpa, seca, ventilada e protegida do sol. Separe alimentos de produtos de limpeza, mantenha embalagens fechadas e siga a validade e as orientações do fabricante. Para frutas e verduras, a forma de armazenamento depende do alimento; evite deixar produtos sensíveis ao calor em local inadequado.";
  }

  if (q.includes("peso") || q.includes("kg") || q.includes("quantidade") || q.includes("laranja") || q.includes("banana") || q.includes("maçã") || q.includes("tomate")) {
    return "Posso informar peso médio por quantidade. Para manter os números confiáveis, o sistema deve usar uma base de referência cadastrada (como TACO/UNICAMP ou FoodData Central) e, quando disponível, a média real pesadas pela unidade. Assim, posso calcular quantas unidades correspondem aproximadamente a 1 kg ou a outro peso solicitado.";
  }

  if (q.includes("como uso") || q.includes("usar") || q.includes("sistema") || q.includes("entrada") || q.includes("saída") || q.includes("relatório")) {
    return "Posso ensinar as funções do sistema passo a passo: Painel, Estoque, Entrada, Saída, Média de consumo, Relatórios PDF, Produtos, Unidades, Usuários e Configurações. Diga qual tela você quer aprender.";
  }

  return "Olá! Sou o Assistente Virtual. Posso informar pesos médios por quantidade, orientar sobre conservação dos alimentos e ensinar como usar as funções do sistema. Como posso ajudar?";
}

export function VirtualAssistant() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([
    { from: "bot", text: "Olá! Sou o Assistente Virtual. Posso ajudar com pesos médios, conservação dos alimentos e uso do sistema." },
  ]);

  const suggestions = useMemo(() => QUICK.filter((item) => !messages.some((m) => m.text === item)), []);

  function send(value = input) {
    const text = value.trim();
    if (!text) return;
    setMessages((current) => [...current, { from: "user", text }, { from: "bot", text: answer(text) }]);
    setInput("");
  }

  return (
    <>
      {open && (
        <div className="fixed bottom-20 right-4 z-50 flex w-[min(380px,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-2xl">
          <div className="flex items-center gap-3 bg-sidebar px-4 py-3 text-sidebar-foreground">
            <span className="grid size-9 place-items-center rounded-full bg-sidebar-primary/20"><Bot className="size-5" /></span>
            <div className="flex-1">
              <p className="font-semibold">Assistente Virtual</p>
              <p className="text-xs text-sidebar-foreground/60">Ajuda do sistema e alimentos</p>
            </div>
            <button onClick={() => setOpen(false)} className="rounded-md p-1 hover:bg-sidebar-accent" aria-label="Fechar"><X className="size-5" /></button>
          </div>

          <div className="flex max-h-[55vh] min-h-[280px] flex-col gap-3 overflow-y-auto p-4">
            {messages.map((message, index) => (
              <div key={index} className={cn("max-w-[88%] rounded-2xl px-3 py-2 text-sm", message.from === "user" ? "ml-auto bg-primary text-primary-foreground" : "mr-auto bg-muted text-foreground")}>
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
