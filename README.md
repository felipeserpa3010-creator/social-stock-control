# Social Stock Control

Crie um aplicativo web completo, profissional, responsivo e pronto para produção chamado:

CONTROLE DE INVENTÁRIO — ASSISTÊNCIA SOCIAL

O sistema será utilizado pela Assistência Social para controlar o estoque das dispensas de várias unidades, registrar entradas e saídas, realizar conferências de estoque aproximado, calcular automaticamente a média de consumo mensal e gerar relatórios PDF profissionais para impressão e arquivamento.

O sistema deve funcionar muito bem em celular, tablet e computador.

1. AUTENTICAÇÃO

Utilizar Supabase Auth.

A primeira tela será uma tela de login contendo:

E-mail

Senha

Botão Entrar

Link “Esqueci minha senha”

Opção “Criar primeiro administrador” somente enquanto ainda não existir nenhum usuário.

PRIMEIRO CADASTRO

O primeiro cadastro do sistema será único.

Na primeira utilização, permitir criar:

Nome completo

E-mail

Senha

Confirmar senha

Esse primeiro usuário deverá ser automaticamente:

ADMINISTRADOR PRINCIPAL

Depois que o primeiro administrador for criado:

bloquear o cadastro público;

esconder a opção de criar administrador;

impedir novos cadastros pela tela de login;

somente o Administrador Principal poderá criar novos usuários dentro do sistema.

Essa regra deve ser implementada no backend/banco de dados e não somente na interface.

Não permitir que alguém consiga burlar a interface e criar outro administrador.

2. RECUPERAÇÃO DE SENHA

Na tela de login disponibilizar:

Esqueci minha senha

Fluxo:

Usuário informa o e-mail.

Sistema envia link de recuperação pelo Supabase Auth.

Usuário acessa o link.

Define nova senha.

Retorna para o login.

Mostrar mensagens claras de sucesso e erro.

3. PERFIS DE USUÁRIO

Criar pelo menos dois níveis:

ADMINISTRADOR PRINCIPAL

O primeiro usuário criado.

Pode:

acessar todas as unidades;

cadastrar unidades;

editar unidades;

desativar unidades;

cadastrar produtos;

editar produtos;

cadastrar categorias;

criar usuários;

editar usuários;

definir a unidade de cada usuário;

registrar entradas;

registrar saídas;

realizar conferências;

visualizar todos os estoques;

visualizar todos os históricos;

consultar médias de consumo;

gerar relatórios;

configurar dados da instituição;

cadastrar logo;

alterar permissões.

RESPONSÁVEL DA UNIDADE

Usuário criado pelo administrador.

Cada responsável poderá ser vinculado a uma unidade.

Pode:

acessar somente a unidade vinculada;

visualizar estoque;

registrar entradas;

registrar saídas;

realizar conferência;

visualizar histórico da própria unidade;

gerar relatório da própria unidade.

Não pode:

criar usuários;

criar unidades;

editar unidades;

acessar outras unidades;

alterar configurações administrativas.

Aplicar essa restrição também no banco através de Row Level Security (RLS).

4. UNIDADES

Criar uma tela:

UNIDADES

As unidades NÃO devem ficar fixas no código.

Devem ser cadastradas e armazenadas no Supabase.

Cadastrar inicialmente:

CRAS

CRAS Primavera

ILPI

Abrigo das Crianças

SCFV

CREAS

Mas o administrador poderá cadastrar quantas unidades quiser posteriormente.

CADASTRAR UNIDADE

Botão:

+ Cadastrar nova unidade

Campos:

Nome da unidade

Sigla

Responsável

Endereço

Telefone

Observação

Status

REGRA IMPORTANTE

Somente o nome da unidade é obrigatório.

Todos os outros campos são opcionais.

Exemplo válido:

Nome da unidade: CRAS Primavera

Pode deixar:

Sigla em branco;

Responsável em branco;

Endereço em branco;

Telefone em branco;

Observação em branco.

Não impedir o cadastro por causa dos campos opcionais.

Status deve ser automaticamente:

Ativa

O administrador poderá completar os campos depois.

5. GERENCIAMENTO DE UNIDADES

Na tela de unidades mostrar:

Unidade Responsável Última conferência Status Ações CRAS João 27/08/2026 Ativa Editar CRAS Primavera Maria 26/08/2026 Ativa Editar

Ações:

Editar

Desativar

Visualizar estoque

Visualizar histórico

Gerar relatório

DESATIVAR UNIDADE

Não excluir fisicamente.

Ao desativar:

preservar estoque;

preservar movimentações;

preservar conferências;

preservar relatórios/histórico;

impedir novas movimentações;

retirar das opções de novos cadastros;

permitir consultar os dados antigos.

Mostrar confirmação antes de desativar.

6. CATEGORIAS

Cadastrar inicialmente:

Produtos de limpeza

Verduras e hortaliças

Alimentos

Fraldas

Higiene pessoal

Outros

O administrador poderá criar novas categorias.

7. PRODUTOS

Criar tela:

PRODUTOS

Campos:

Nome do produto — obrigatório

Categoria — obrigatória

Unidade de medida — obrigatória

Estoque mínimo — opcional

Estoque máximo — opcional

Observação — opcional

Ativo/Inativo

UNIDADES DE MEDIDA

Disponibilizar:

Kg

Unidade

Pacote

Caixa

Litro

Fardo

Pote

Saco

Outro

Exemplos:

Arroz → Kg

Feijão → Kg

Detergente → Unidade

Sabão em pó → Pacote

Leite → Caixa

Fralda M → Pacote

A unidade de medida deverá aparecer automaticamente em estoque, movimentações, conferências e relatórios.

8. ESTOQUE

Criar tela:

ESTOQUE

Primeiro selecionar a unidade.

Exemplo:

CRAS

Mostrar:

Categoria Produto Medida Estoque aproximado Mínimo Status Alimentos Arroz Kg 25 10 Normal Alimentos Feijão Kg 15 8 Normal Limpeza Detergente Unidade 5 10 Baixo Fraldas Fralda M Pacote 0 5 Zerado

Status:

🟢 Normal

🟠 Estoque baixo

🔴 Estoque zerado

Permitir:

pesquisar produto;

filtrar categoria;

ordenar;

visualizar estoque;

visualizar última movimentação;

visualizar última conferência.

9. ESTOQUE APROXIMADO

O sistema deve trabalhar com quantidade aproximada.

Não exigir que o funcionário pese ou conte exatamente cada item.

Exemplos:

Arroz: aproximadamente 25 Kg

Detergente: aproximadamente 20 unidades

Fralda M: aproximadamente 15 pacotes

Na interface utilizar o termo:

Estoque aproximado

10. ENTRADA

Criar tela:

ENTRADA DE ESTOQUE

Campos:

Unidade

Produto

Quantidade

Unidade de medida automática

Data

Responsável

Observação

Ao salvar:

estoque atual + entrada = novo estoque.

Registrar a movimentação no histórico.

11. SAÍDA

Criar tela:

SAÍDA DE ESTOQUE

Campos:

Unidade

Produto

Quantidade

Unidade de medida automática

Data

Responsável

Observação

Ao salvar:

estoque atual - saída = novo estoque.

Não permitir estoque negativo normalmente.

Registrar toda saída no histórico.

12. CONFERÊNCIA

Criar tela:

CONFERÊNCIA DE ESTOQUE

Fluxo:

Selecionar unidade.

Informar data.

Mostrar todos os produtos da unidade.

Informar quantidade aproximada encontrada.

Finalizar conferência.

Tabela:

Categoria Produto Medida Estoque registrado Estoque conferido Diferença

Ao finalizar:

salvar a conferência;

salvar a data;

salvar o usuário responsável;

atualizar o estoque;

guardar histórico;

não apagar conferências anteriores.

Permitir consultar conferências anteriores.

13. ÚLTIMA CONFERÊNCIA

Cada unidade deve possuir:

Data da última conferência

Exemplo:

CRAS — 27/08/2026

CRAS Primavera — 26/08/2026

ILPI — 25/08/2026

Essa informação deverá aparecer no dashboard e nos relatórios.

14. HISTÓRICO

Criar:

HISTÓRICO DE MOVIMENTAÇÕES

Filtros:

Unidade

Produto

Categoria

Entrada

Saída

Conferência

Período

Responsável

Mostrar:

Data

Unidade

Produto

Tipo

Quantidade

Unidade de medida

Responsável

Observação

Não apagar movimentações antigas.

Para correções, criar movimentação de ajuste mantendo a rastreabilidade.

15. MÉDIA DE CONSUMO MENSAL

O sistema deve calcular automaticamente a média de consumo de cada produto utilizando as saídas registradas.

O usuário não deverá fazer cálculos manualmente.

Exemplo:

Maio: 20

Junho: 16

Julho: 18

Média mensal:

18

Respeitar a unidade de medida.

Exemplos:

Arroz → 18 Kg/mês

Detergente → 14 unidades/mês

Fralda M → 22 pacotes/mês

Criar tela:

MÉDIA DE CONSUMO

Filtros:

Unidade

Categoria

Produto

Período

Mostrar:

Produto

Unidade de medida

Consumo

Média mensal

Permitir escolher o período usado no cálculo.

Se não houver dados suficientes:

“Dados insuficientes para calcular a média.”

Nunca inventar valores.

16. DASHBOARD

Criar dashboard profissional.

Cards:

Total de produtos

Produtos em estoque baixo

Produtos zerados

Total de unidades

Entradas no mês

Saídas no mês

Filtro:

Todas as unidades

ou uma unidade específica.

Mostrar também:

ÚLTIMAS CONFERÊNCIAS

Unidade Data CRAS 27/08/2026 CRAS Primavera 26/08/2026 ILPI 25/08/2026

17. RELATÓRIOS

Criar menu:

RELATÓRIOS

Permitir gerar:

Inventário atual

Inventário por unidade

Histórico de conferências

Entradas

Saídas

Média de consumo mensal

Produtos abaixo do estoque mínimo

Permitir selecionar:

Unidade

Categoria

Período

Data da conferência

18. RELATÓRIO PDF DE INVENTÁRIO

Esse é um dos pontos mais importantes do sistema.

Criar PDF profissional em tamanho:

A4

O relatório deve ter aparência institucional, elegante, limpa e adequada para:

impressão;

arquivamento;

pasta física;

conferência administrativa.

CABEÇALHO

Mostrar:

Logo da instituição, se cadastrada.

Nome da Secretaria/Instituição.

INVENTÁRIO DE ESTOQUE

Unidade: CRAS

Data da última conferência: 27/08/2026

19. TABELA DO PDF

Por padrão, NÃO mostrar média mensal.

Tabela:

Categoria Produto Unidade de medida Estoque aproximado Alimentos Arroz Kg 25 Alimentos Feijão Kg 15 Alimentos Leite Caixa 20 Limpeza Detergente Unidade 30 Limpeza Sabão em pó Pacote 12 Fraldas Fralda M Pacote 18

A unidade de medida deve aparecer claramente.

20. MÉDIA MENSAL NO PDF

A média mensal deve ficar oculta por padrão.

Na tela de geração do relatório criar:

☐ Incluir média de consumo mensal

Se não marcar:

PDF somente com estoque.

Se marcar:

adicionar coluna:

Média de consumo mensal

Exemplo:

Categoria Produto Medida Estoque aproximado Média mensal Alimentos Arroz Kg 25 18 Limpeza Detergente Unidade 30 14

A média deve ser calculada automaticamente pelo sistema.

21. ASSINATURA NO PDF

Não colocar declaração.

Não colocar texto de declaração.

Colocar somente:

RESPONSÁVEL PELA CONFERÊNCIA

Nome: __________________________________________

Assinatura: ______________________________________

Data: //________

Deixar bastante espaço para assinatura manual.

22. RODAPÉ

No rodapé:

Unidade

Data da conferência

Página X de Y

Exemplo:

CRAS | Conferência: 27/08/2026 | Página 1 de 2

Se houver várias páginas, repetir o cabeçalho da tabela em todas as páginas.

23. NOME DO ARQUIVO PDF

Gerar automaticamente:

Inventario_CRAS_27-08-2026.pdf

Inventario_CRAS_Primavera_27-08-2026.pdf

Inventario_ILPI_27-08-2026.pdf

Inventario_Abrigo_das_Criancas_27-08-2026.pdf

Inventario_SCFV_27-08-2026.pdf

Inventario_CREAS_27-08-2026.pdf

24. HISTÓRICO DE CONFERÊNCIAS

Criar:

HISTÓRICO DE CONFERÊNCIAS

Mostrar:

Unidade Data Responsável Ações CRAS 27/08/2026 João Ver relatório ILPI 26/08/2026 Maria Ver relatório

Permitir gerar novamente o relatório.

Não apagar automaticamente conferências antigas.

25. CONFIGURAÇÕES

Somente Administrador Principal.

Permitir configurar:

Nome da instituição;

Nome da Secretaria;

Logo;

informações do cabeçalho do PDF;

unidades;

categorias;

produtos;

usuários.

26. USUÁRIOS

Criar tela:

USUÁRIOS

Administrador poderá:

criar usuário;

editar usuário;

ativar;

desativar;

definir unidade;

alterar perfil.

Cadastro:

Nome

E-mail

Unidade

Perfil

Status

Não exigir campos desnecessários.

27. BANCO DE DADOS

Utilizar Supabase.

Criar tabelas:

profiles

id

user_id

nome

email

role

unit_id

ativo

created_at

updated_at

units

id

nome

sigla

responsavel

endereco

telefone

observacao

ativo

created_at

updated_at

Somente nome deve ser obrigatório.

categories

id

nome

ativo

created_at

products

id

nome

category_id

unidade_medida

estoque_minimo

estoque_maximo

observacao

ativo

created_at

updated_at

stock

id

unit_id

product_id

quantidade

updated_at

stock_movements

id

unit_id

product_id

tipo

quantidade

data

user_id

observacao

created_at

stock_checks

id

unit_id

data_conferencia

user_id

created_at

stock_check_items

id

stock_check_id

product_id

quantidade_registrada

quantidade_conferida

diferenca

settings

id

nome_instituicao

nome_secretaria

logo_url

updated_at

Criar relacionamentos, chaves estrangeiras, índices e constraints adequados.

28. SEGURANÇA

Implementar RLS no Supabase.

Administrador:

Acesso total.

Responsável:

Somente sua unidade.

A segurança deve existir no backend/banco.

Não confiar somente no frontend.

Impedir que um usuário altere manualmente o ID da unidade para acessar dados de outra unidade.

29. MENU PRINCIPAL

Criar menu:

Dashboard

Unidades

Produtos

Estoque

Entrada

Saída

Conferência

Média de Consumo

Relatórios

Histórico

Usuários

Configurações

No celular, utilizar menu lateral recolhível.

30. DESIGN

Criar interface:

moderna;

limpa;

profissional;

institucional;

fácil de utilizar;

excelente no celular;

excelente no computador.

Utilizar cards, tabelas responsivas, filtros, busca e botões claros.

O sistema deve parecer um sistema administrativo profissional de uma Secretaria de Assistência Social, e não um aplicativo genérico de vendas.

31. PRODUTOS INICIAIS PARA DEMONSTRAÇÃO

Criar inicialmente:

Arroz

Feijão

Açúcar

Café

Leite

Macarrão

Detergente

Água sanitária

Desinfetante

Sabão em pó

Papel higiênico

Fralda M

Fralda G

Alface

Tomate

Cebola

Categorias:

Produtos de limpeza

Verduras e hortaliças

Alimentos

Fraldas

Higiene pessoal

Outros

Os dados de demonstração devem ser identificados como dados de exemplo e não devem ser confundidos com dados reais.

32. FLUXO PRINCIPAL

O sistema deve funcionar assim:

Primeiro acesso

Criar primeiro administrador.

Depois

Administrador entra no sistema.

Cadastra as unidades necessárias.

Cadastra produtos.

Cria usuários e vincula cada usuário à sua unidade.

Durante o mês

Funcionários registram entradas e saídas.

Na conferência

Responsável abre:

Conferência de Estoque

Seleciona a unidade.

Informa as quantidades aproximadas encontradas.

Finaliza.

O sistema salva:

estoque;

data;

responsável;

conferência;

histórico.

Depois

Administrador ou responsável gera:

Relatório PDF

Escolhe se deseja ou não:

Incluir média de consumo mensal

Baixa o PDF.

Imprime.

Responsável assina.

Documento é arquivado.

33. TESTES OBRIGATÓRIOS

Antes de finalizar, testar:

Primeiro cadastro.

Bloqueio do cadastro público após primeiro usuário.

Login.

Logout.

Recuperação de senha.

Criação de usuários pelo administrador.

Restrição de acesso por unidade.

Cadastro de unidade somente com nome.

Cadastro de unidade com todos os campos.

Edição de unidade.

Desativação de unidade.

Cadastro de produto.

Entrada.

Saída.

Atualização automática do estoque.

Bloqueio de estoque negativo.

Conferência.

Atualização após conferência.

Histórico.

Média mensal.

Relatório sem média.

Relatório com média.

Unidade de medida no relatório.

Data da última conferência.

Espaço para assinatura.

Paginação do PDF.

Nome automático do PDF.

Download do PDF.

Impressão.

Funcionamento em celular.

Funcionamento em computador.

RLS e segurança do banco.

Corrigir todos os erros encontrados.

34. REGRA FINAL DE IMPLEMENTAÇÃO

Não criar somente telas estáticas.

Criar o aplicativo realmente funcional, conectado ao Supabase, com:

autenticação;

banco de dados;

RLS;

usuários;

unidades;

produtos;

categorias;

estoque;

entradas;

saídas;

conferências;

histórico;

cálculo automático de média;

relatórios;

geração de PDF;

download;

impressão;

assinatura;

responsividade.

O sistema deve estar preparado para crescer futuramente com novas unidades, categorias e produtos sem precisar alterar o código.

Prioridades:

1. Segurança

2. Controle correto do estoque por unidade

3. Facilidade de uso

4. Conferência de estoque aproximado

5. Cálculo automático da média mensal

6. Relatório PDF profissional para arquivamento

7. Histórico e rastreabilidade

8. Funcionamento perfeito no celular e computador

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/6e14c899-a5f3-44ff-a840-a429271fd54b).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
