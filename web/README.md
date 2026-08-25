# Sistema Web — Distribuição & Notas Fiscais

Next.js + TypeScript + Tailwind + Drizzle ORM, rodando sobre o mesmo projeto
Supabase do sistema de ponto eletrônico (schema Postgres separado: `fiscal`).

## Rodando localmente

```bash
npm install
cp .env.example .env.local   # preencher DATABASE_URL
npm run db:generate          # gera as migrations a partir de src/db/schema.ts
npm run db:migrate           # aplica no Supabase
npm run dev
```

## Sem banco configurado ainda?

A regra de negócio central (cálculo de faturável e geração de tarefas) não
depende de banco nem de login no sistema fiscal:

```bash
npm test              # testes unitários do domínio Web
npm run demo:calculo  # demonstração isolada
```

## Estrutura

```
src/
├── db/
│   ├── schema.ts       # emitentes, clientes, regras fiscais, produtos, preços,
│   │                      distribuição, tarefas, notas e logs
│   └── index.ts
├── lib/
│   ├── calculos.ts       # RF09/RF11 — quantidade faturável, agrupamento em tarefas
│   ├── calculos.test.ts  # 11 testes
│   ├── relatorios.ts     # KPIs, ranking por cliente/produto, série diária
│   └── relatorios.test.ts # 12 testes
├── components/          # Card, Stamp (carimbo de status), Label, PrimaryButton, ícones
└── app/
    ├── emitentes/        # quem faz login no sistema fiscal (RF02)
    ├── clientes/         # destinatário da nota — CEP/número/IE (RF01/RF03)
    ├── produtos/         # RF04
    ├── distribuicao/     # núcleo do MVP: multi-produto, seleção de clientes,
    │                       preço aprendido por cliente (RF06-RF11)
    ├── tarefas/          # accordion com itens + cancelamento (RF11/RF23)
    ├── notas/            # download/compartilhamento (RF20/RF21)
    └── relatorios/        # faturamento, ranking cliente/produto, gráfico —
                             usa dados já salvos na distribuição, sem PDF
```

## Modelo de dados — pontos importantes

- **Login pertence ao emitente**, não ao cliente — é o emitente quem
  autentica no sistema fiscal.
- **Emitente e cliente têm relação N:N**. O cadastro define os emitentes
  habilitados para atender o cliente e a distribuição registra qual deles foi
  escolhido na tarefa. Aplicar as migrações `0001_emitente_por_tarefa.sql` e
  `0002_regras_fiscais_reutilizaveis.sql` antes de usar esse fluxo em banco
  existente.
- **Regra fiscal é reutilizável:** CFOP, ICMS, origem, benefício e parâmetros
  de operação são cadastrados uma vez em `regras_fiscais`. O produto recebe a
  regra padrão automaticamente quando só há uma ativa; a tarefa preserva a
  referência escolhida no momento da distribuição.
- **Preço é por produto + cliente**, não só por produto — a tabela
  `precos_cliente` aprende sozinha: toda vez que uma distribuição é
  processada, o preço usado vira o padrão daquele par pra próxima vez.
- **Distribuição suporta múltiplos produtos** numa mesma sessão, com
  seleção de quais clientes participam daquela rodada específica.

## Design

Direção visual ancorada no domínio: papel quente + tinta de carimbo fiscal
+ números em monoespaçada (como um recibo real). Mobile-first — barra de
navegação inferior no celular, sticky action bar nos formulários longos,
alvos de toque ≥44px. Ver `src/app/globals.css` para os tokens.

## Relatórios

Insight da reunião de 15/08: os dados que o financeiro futuro vai precisar
(data, valor por nota, cliente, produto) já existem em `tarefaItens` desde
a distribuição — não precisa esperar o PDF nem o módulo Fiscal+Financeiro
pra ter faturamento, ranking de clientes/produtos e valor perdido em
trocas. A tela busca só o intervalo de datas selecionado (chips: Hoje/7
dias/30 dias/Este mês), agrega em `lib/relatorios.ts` (puro, testado) e
mostra KPIs + gráfico + rankings num único scroll, sem navegação extra.
Trocas ligadas a tarefa cancelada não entram no indicador "Perdido em trocas".

## O que falta

- RLS policies no Supabase (hoje o acesso é só via `DATABASE_URL` direta)
- Autenticação do sistema web (Supabase Auth)
- Consumo das tarefas PENDENTE pelo worker + atualização de status em tempo real
