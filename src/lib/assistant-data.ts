export type FoodReference = {
  aliases: string[];
  name: string;
  unitLabel: string;
  weightG: number;
  preparation: string;
  source: string;
};

export type ConservationTip = {
  keywords: string[];
  title: string;
  text: string;
};

export const FOOD_REFERENCES: FoodReference[] = [
  { aliases: ["banana", "banana prata"], name: "Banana-prata", unitLabel: "unidade média", weightG: 70, preparation: "crua", source: "Guia do Alimento — TACO 4ª ed. / NEPA-UNICAMP" },
  { aliases: ["laranja", "laranja pera", "laranja pêra"], name: "Laranja-pêra", unitLabel: "unidade média", weightG: 125, preparation: "crua", source: "Guia do Alimento — TACO 4ª ed. / NEPA-UNICAMP" },
  { aliases: ["maca", "maçã", "maca fuji", "maçã fuji"], name: "Maçã Fuji", unitLabel: "unidade média", weightG: 124, preparation: "com casca, crua", source: "Guia do Alimento — TACO 4ª ed. / NEPA-UNICAMP" },
  { aliases: ["tomate"], name: "Tomate", unitLabel: "unidade média", weightG: 89, preparation: "com semente, cru", source: "Guia do Alimento — TACO 4ª ed. / NEPA-UNICAMP" },
  { aliases: ["batata", "batata inglesa"], name: "Batata inglesa", unitLabel: "unidade média", weightG: 140, preparation: "cozida", source: "Guia do Alimento — TACO 4ª ed. / NEPA-UNICAMP" },
  { aliases: ["batata doce", "batata-doce"], name: "Batata-doce", unitLabel: "pedaço médio", weightG: 80, preparation: "cozida", source: "Guia do Alimento — TACO 4ª ed. / NEPA-UNICAMP" },
  { aliases: ["mamao", "mamão", "mamao formosa", "mamão formosa"], name: "Mamão Formosa", unitLabel: "fatia média", weightG: 152, preparation: "cru", source: "Guia do Alimento — TACO 4ª ed. / NEPA-UNICAMP" },
  { aliases: ["abacaxi"], name: "Abacaxi", unitLabel: "fatia média", weightG: 95, preparation: "cru", source: "Guia do Alimento — TACO 4ª ed. / NEPA-UNICAMP" },
  { aliases: ["melancia"], name: "Melancia", unitLabel: "fatia média", weightG: 211, preparation: "crua", source: "Guia do Alimento — TACO 4ª ed. / NEPA-UNICAMP" },
  { aliases: ["melao", "melão"], name: "Melão", unitLabel: "fatia média", weightG: 156, preparation: "cru", source: "Guia do Alimento — TACO 4ª ed. / NEPA-UNICAMP" },
  { aliases: ["manga", "manga tommy", "manga tommy atkins"], name: "Manga Tommy Atkins", unitLabel: "unidade pequena", weightG: 136, preparation: "crua", source: "Guia do Alimento — TACO 4ª ed. / NEPA-UNICAMP" },
  { aliases: ["uva", "uva italia", "uva itália"], name: "Uva Itália", unitLabel: "10 bagos", weightG: 65, preparation: "crua", source: "Guia do Alimento — TACO 4ª ed. / NEPA-UNICAMP" },
  { aliases: ["morango"], name: "Morango", unitLabel: "6 unidades médias", weightG: 91, preparation: "cru", source: "Guia do Alimento — TACO 4ª ed. / NEPA-UNICAMP" },
  { aliases: ["cenoura"], name: "Cenoura", unitLabel: "unidade média", weightG: 80, preparation: "crua", source: "Guia do Alimento — TACO 4ª ed. / NEPA-UNICAMP" },
  { aliases: ["beterraba"], name: "Beterraba", unitLabel: "unidade média", weightG: 112, preparation: "crua", source: "Guia do Alimento — TACO 4ª ed. / NEPA-UNICAMP" },
  { aliases: ["cebola"], name: "Cebola", unitLabel: "unidade média", weightG: 69, preparation: "crua", source: "Guia do Alimento — TACO 4ª ed. / NEPA-UNICAMP" },
  { aliases: ["pimentao", "pimentão"], name: "Pimentão vermelho", unitLabel: "unidade média", weightG: 117, preparation: "cru", source: "Guia do Alimento — TACO 4ª ed. / NEPA-UNICAMP" },
  { aliases: ["chuchu"], name: "Chuchu", unitLabel: "porção de referência", weightG: 73.5, preparation: "cozido", source: "Guia do Alimento — TACO 4ª ed. / NEPA-UNICAMP" },
  { aliases: ["pepino"], name: "Pepino", unitLabel: "porção de referência", weightG: 41, preparation: "cru", source: "Guia do Alimento — TACO 4ª ed. / NEPA-UNICAMP" },
  { aliases: ["quiabo"], name: "Quiabo", unitLabel: "6 unidades", weightG: 60.7, preparation: "cru", source: "Guia do Alimento — TACO 4ª ed. / NEPA-UNICAMP" },
];

export const CONSERVATION_TIPS: ConservationTip[] = [
  {
    keywords: ["geral", "alimento", "comida", "guardar", "armazenar", "conservacao", "conservação"],
    title: "Conservação geral",
    text: "Guarde cada alimento conforme o rótulo e as condições indicadas pelo fabricante. Mantenha a despensa limpa, seca e ventilada, e não armazene alimentos junto com produtos de limpeza.",
  },
  {
    keywords: ["fruta", "frutas", "verdura", "verduras", "legume", "legumes", "folha", "folhas"],
    title: "Frutas, verduras e legumes",
    text: "Retire sujeiras visíveis em água corrente. Para sanitização, use somente produto próprio para alimentos e regularizado, seguindo exatamente a diluição e o tempo indicados no rótulo. Separe alimentos crus dos preparados e mantenha os perecíveis nas condições de temperatura recomendadas.",
  },
  {
    keywords: ["geladeira", "refrigerador", "refrigeracao", "refrigeração"],
    title: "Geladeira",
    text: "A Anvisa orienta manter a geladeira abaixo de 5 °C. Alimentos preparados devem ser guardados em recipientes limpos e fechados. Na geladeira, mantenha separados alimentos crus e preparados.",
  },
  {
    keywords: ["freezer", "congelar", "congelado", "descongelar", "descongelamento"],
    title: "Congelamento e descongelamento",
    text: "Não descongele alimentos sobre a bancada. Faça o descongelamento sob refrigeração, abaixo de 5 °C, ou no micro-ondas quando o alimento for imediatamente submetido ao cozimento.",
  },
  {
    keywords: ["cozido", "cozidos", "sobra", "sobras", "preparado", "preparados"],
    title: "Comida preparada e sobras",
    text: "A Anvisa informa que alimentos preparados e refrigerados devem ser consumidos em até cinco dias, desde que mantidos adequadamente. Alimentos quentes devem ser mantidos acima de 60 °C quando estiverem sendo conservados para serviço.",
  },
];

export type SystemHelp = {
  keywords: string[];
  title: string;
  text: string;
};

export const SYSTEM_HELP: SystemHelp[] = [
  { keywords: ["painel", "dashboard", "inicio", "início"], title: "Painel", text: "O Painel mostra um resumo do sistema. Use-o para acompanhar rapidamente a situação geral e acessar as áreas principais." },
  { keywords: ["estoque"], title: "Estoque", text: "Em Estoque você consulta os produtos da unidade, pesquisa por nome ou categoria e filtra por situação: normal, abaixo do mínimo ou zerado. Também é possível exportar a lista para CSV." },
  { keywords: ["entrada", "recebimento", "doação", "doacao"], title: "Entrada", text: "Em Entrada você registra recebimentos, doações e outros materiais que entram na unidade. Essa função é restrita ao administrador." },
  { keywords: ["saída", "saida", "dispensa", "consumo"], title: "Saída", text: "Em Saída você registra dispensas, atendimentos e consumos que reduzem o estoque da unidade." },
  { keywords: ["media", "média", "consumo"], title: "Média de consumo", text: "Use Média de consumo para analisar o histórico de consumo e apoiar o planejamento de reposição." },
  { keywords: ["relatorio", "relatório", "pdf"], title: "Relatórios PDF", text: "Em Relatórios PDF você gera relatórios do sistema para consulta ou impressão." },
  { keywords: ["produto", "produtos", "categoria", "categorias"], title: "Produtos e categorias", text: "Em Produtos e categorias o administrador cadastra, edita, ativa ou desativa produtos e organiza suas categorias." },
  { keywords: ["unidade", "unidades"], title: "Unidades", text: "Em Unidades o administrador gerencia as unidades atendidas pelo sistema e seus dados cadastrais." },
  { keywords: ["usuario", "usuário", "usuários", "usuarios", "permissao", "permissão"], title: "Usuários", text: "Em Usuários o administrador gerencia os acessos e perfis. O sistema possui permissões diferentes para administrador, responsável pela unidade e visualizador." },
  { keywords: ["configuracao", "configuração", "configurações", "configuracoes", "logo"], title: "Configurações", text: "Em Configurações o administrador ajusta os dados institucionais e a identidade visual do sistema." },
];

export const ASSISTANT_SOURCES = {
  food: "Pesos de referência: Guia do Alimento, com dados da TACO 4ª edição (NEPA/UNICAMP).",
  conservation: "Conservação: orientações da Anvisa sobre segurança e armazenamento de alimentos.",
};
