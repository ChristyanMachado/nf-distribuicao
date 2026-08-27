# AI Context — NF Distribuição

## Objetivo

Contexto autoritativo para pessoas e IAs. Antes de alterar código, ler também
`ARCHITECTURE.md`, `HANDOFF.md` e `COLABORACAO.md` e conferir o diff atual.

O sistema organiza a distribuição de produtos e automatiza, futuramente, a emissão de NFP-e na Receita PR. A aplicação web e o Worker fiscal ainda estão integrados apenas conceitualmente.

## Estado validado em 22/08/2026

- A aplicação web já possui cadastros de emitentes, clientes e produtos; distribuição de múltiplos itens; preços por produto+cliente; tarefas; e relatórios de faturamento bruto, notas, ticket médio, rankings e gráfico.
- O Worker usa 1 Chromium + N `BrowserContext`s independentes, Async Playwright e concorrência isolada.
- Três fluxos concorrentes foram demonstrados ao vivo, concluindo o preenchimento em homologação. Em máquina sobrecarregada houve lentidão e uma falha isolada, sem invalidar o modelo de contextos.
- O fluxo de homologação foi validado até depois de Transporte com uma e duas linhas de produto. Ele para antes da tela final/ação de emitir.
- `AMBIENTE_EMISSAO=teste` é o padrão. Não executar testes de preenchimento no ambiente fiscal normal sem uma decisão consciente.

O resultado técnico detalhado e seletores reconhecidos estão em `docs/HANDOFF.md` e `worker/RECON.md`.

## Regras de domínio confirmadas na reunião de 22/08

1. Emitente e cliente/mercado têm relação flexível N:N. A escolha do emitente é feita por tarefa/distribuição; não criar uma regra permanente de um emitente por cliente.
2. O cliente precisa de nome curto de exibição e razão social/destinatário fiscal separados.
3. O preço padrão é por produto+cliente/mercado, e não por emitente. Uma promoção pode substituir o valor em uma distribuição. Hoje o sistema usa o último preço empregado como novo padrão desse par.
4. Relatórios operacionais mostram faturamento bruto, quantidade de notas, ticket médio, série diária e recortes por cliente/produto. Financeiro líquido, descontos e valores a pagar a produtores pertencem a módulo futuro.
5. Tarefas pendentes devem ser processadas automaticamente na janela noturna de 00:00 a 06:00. Uma simples verificação de horário quando o usuário abre o Worker não atende ao requisito.

## Pontos técnicos abertos

- A migração `web/src/db/migrations/0001_emitente_por_tarefa.sql` foi aplicada ao banco de teste em 22/08. Ela preserva `clientes.emitente_id` como legado e cria `cliente_emitentes`, `distribuicoes.emitente_id` e `tarefas.emitente_id`.
- Após a aplicação: 1 emitente preservado, 2 relações cliente↔emitente criadas e nenhuma tarefa ou distribuição sem emitente. Os logins continuam em `fiscal.emitentes`.
- O cálculo de "perdido em trocas" agora exclui registros vinculados a tarefas canceladas. A consulta também passou a relacionar troca, tarefa e emitente; o comportamento foi coberto por teste unitário.
- Definir sem ambiguidade quais status entram no faturamento. Hoje a regra de código exclui somente `CANCELADA`; tarefas pendentes entram por serem valores já comprometidos na distribuição.
- Implementar agendador, estratégia de retries, fuso operacional e tratamento de tarefas fora da janela.
- Reconhecer resumo/validação final de homologação antes de implementar emissão, downloads e produção.

## Princípios imutáveis

- Não misturar Playwright Sync e Async.
- Não compartilhar `BrowserContext` entre tarefas.
- Falha de uma tarefa não pode cancelar as demais.
- Não expor credenciais ou dados fiscais reais.
- Não emitir de verdade sem testes e validação explícita.
- Testar e documentar cada alteração antes do commit.
- A autoria de commits é humana; IA é ferramenta de apoio.
