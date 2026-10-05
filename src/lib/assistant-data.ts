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
  {
    keywords: ["painel", "dashboard", "inicio", "início"],
    title: "Painel",
    text: "O Painel é a visão geral do sistema. O CEO acompanha estoque, lançamentos e recibos pendentes. Os demais perfis veem somente o que sua permissão permite."
  },
  {
    keywords: ["estoque", "quantidade", "saldo", "zerado", "quase acabando", "baixo", "disponivel", "disponível"],
    title: "Estoque",
    text: "A página Estoque é exclusiva para consulta do estoque. Pesquise produtos e veja estoque aproximado, unidade de medida e situação: Disponível, Quase acabando ou Zerado. As entradas lançadas pelo CEO não entram no saldo da unidade enquanto estiverem pendentes de recebimento."
  },
  {
    keywords: ["entrada", "lancar entrada", "lançar entrada", "receber mercadoria"],
    title: "Entrada",
    text: "Entrada é uma operação exclusiva do CEO. O usuário comum da unidade não possui permissão para dar entrada. O CEO pode lançar mercadorias para qualquer unidade."
  },
  {
    keywords: ["lancamento em massa", "lançamento em massa", "massa", "varios produtos", "vários produtos", "documento", "recibo de produtos"],
    title: "Lançamento em massa",
    text: "O CEO pode lançar vários produtos de uma vez. O texto pode ser livre, por exemplo: '4 kg de cebola', 'cebola 4kg', '3 pacotes de arroz' ou 'tomate - 5'. O sistema identifica produto, quantidade e unidade, permite revisar, editar ou excluir itens e só grava depois da confirmação do CEO. Depois é criado um Recibo de Produtos para a unidade."
  },
  {
    keywords: ["confirmar recebimento", "recebimento", "confirmacao", "confirmação", "receber lote", "lote"],
    title: "Confirmar recebimento",
    text: "Depois que o CEO envia um Recibo de Produtos, ele fica pendente para a unidade de destino. O responsável da unidade pode consultar e imprimir o recibo e depois clicar em 'Confirmar recebimento'. A confirmação é do recibo inteiro. Só depois da confirmação as quantidades entram no estoque da unidade."
  },
  {
    keywords: ["recibo", "recibos", "recibo de entrega", "consultar recibo", "numero do recibo", "número do recibo"],
    title: "Recibos",
    text: "A opção Recibos, no menu lateral, permite consultar os Recibos de Produtos e as entregas das unidades. Os recibos são numerados em sequência, começando por 001, e podem ser consultados e impressos. É possível pesquisar por número, unidade ou produto."
  },
  {
    keywords: ["saida", "saída", "retirada", "dispensa", "consumo"],
    title: "Saída",
    text: "Usuários responsáveis pelas unidades podem registrar somente saídas da própria unidade. Eles não podem registrar entradas. A saída reduz a quantidade disponível no estoque."
  },
  {
    keywords: ["media", "média", "consumo", "planejamento"],
    title: "Média de consumo",
    text: "A Média de consumo ajuda a acompanhar o consumo dos produtos e apoiar o planejamento de reposição."
  },
  {
    keywords: ["relatorio", "relatório", "pdf", "relatorios", "relatórios"],
    title: "Relatórios PDF",
    text: "Os Relatórios PDF apresentam os dados do estoque para consulta e impressão, com a identidade visual do SEMADS. O relatório de estoque pode apresentar unidade, período, estoque aproximado, situação, gráficos e média mensal. O sistema não usa uma categoria ou 'responsável pela conferência' no relatório."
  },
  {
    keywords: ["produto", "produtos", "categoria", "categorias", "cadastrar produto"],
    title: "Produtos e categorias",
    text: "O CEO administra os produtos. No lançamento em massa, produtos que ainda não existem podem ser cadastrados automaticamente somente depois da confirmação final do lançamento. O produto recebe sua unidade de medida, como kg, pacote, unidade ou litro."
  },
  {
    keywords: ["unidade", "unidades", "unidade de destino", "gabinete", "conselho tutelar"],
    title: "Unidades",
    text: "O sistema trabalha com unidades atendidas pelo Depósito SEMADS. O CEO consegue administrar as unidades. Cada responsável de unidade vê e movimenta somente a própria unidade. O Gabinete SEMADS atua como visualizador, com acesso a quantidades e relatórios."
  },
  {
    keywords: ["usuario", "usuário", "usuários", "usuarios", "permissao", "permissão", "cadastro", "aprovar usuario", "aprovar usuário"],
    title: "Usuários e permissões",
    text: "O CEO é o único administrador e controla os cadastros e permissões. Responsável de unidade pode consultar o estoque da própria unidade, registrar saídas e confirmar recebimentos. O Gabinete SEMADS é visualizador. Usuários comuns não registram entradas."
  },
  {
    keywords: ["ceo", "administrador", "admin", "dono", "principal"],
    title: "CEO / Administrador Principal",
    text: "O CEO é o único administrador do sistema. Ele pode cadastrar e autorizar usuários, cadastrar produtos, registrar entradas para qualquer unidade, fazer lançamentos em massa, acompanhar os recibos e excluir recibos ou produtos de recibos que ainda estejam pendentes."
  },
  {
    keywords: ["excluir recibo", "apagar recibo", "excluir produto", "apagar produto"],
    title: "Exclusão de recibos",
    text: "Somente o CEO pode excluir um Recibo de Produtos que ainda esteja pendente. Ele pode excluir o recibo inteiro ou somente um produto dentro dele. Um recibo excluído antes da confirmação não entra no estoque da unidade."
  },
  {
    keywords: ["imprimir", "impressao", "impressão", "pdf recibo", "consultar"],
    title: "Imprimir recibo",
    text: "Na tela de recebimento ou na página Recibos, use 'Imprimir' para abrir o Recibo de Produtos em formato pronto para impressão. O documento mostra SEMADS, número do recibo, unidade de destino, data e produtos com quantidades e unidades de medida."
  },
  {
    keywords: ["assistente", "ajuda", "como usar", "como funciona"],
    title: "Assistente Virtual",
    text: "O Assistente Virtual pode explicar as funções do sistema, orientar sobre lançamentos, estoque, saídas, recibos, confirmação de recebimento, relatórios, usuários e permissões. Também pode informar pesos médios de alimentos e orientar sobre conservação."
  },
  {
    keywords: ["senha", "recuperar senha", "esqueci senha", "redefinir senha"],
    title: "Recuperação de senha",
    text: "Quando disponível na tela de autenticação, use a opção de recuperação de senha para receber as instruções de redefinição. Cada usuário deve usar seu próprio acesso."
  },
  {
    keywords: ["historico", "histórico", "conferencia", "conferência"],
    title: "Sobre histórico e conferência",
    text: "O fluxo atual do sistema foi simplificado para trabalhar com estoque, lançamentos, saídas, recibos, recebimento e relatórios. Não é necessário usar uma etapa separada de 'Conferência' para o recibo: a unidade confirma o recebimento diretamente."
  },
];

export const ASSISTANT_SOURCES = {
  food: "Pesos de referência: Guia do Alimento, com dados da TACO 4ª edição (NEPA/UNICAMP).",
  conservation: "Conservação: orientações da Anvisa sobre segurança e armazenamento de alimentos.",
};
