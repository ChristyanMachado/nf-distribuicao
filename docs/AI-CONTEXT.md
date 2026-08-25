# AI Context — NF Distribuição

## Objetivo

Fonte de contexto compartilhada para pessoas e ferramentas de IA que trabalham no projeto. Antes de alterar código, ler também `docs/ARCHITECTURE.md`, `docs/HANDOFF.md` e `docs/COLABORACAO.md`.

O sistema organiza a distribuição de produtos e automatiza, futuramente, a emissão de NFP-e na Receita PR. A aplicação web e o Worker fiscal ainda estão integrados apenas conceitualmente.

## Estado validado em 25/08/2026

- A aplicação web já possui cadastros de emitentes, clientes e produtos; distribuição de múltiplos itens; preços por produto+cliente; tarefas; e relatórios de faturamento bruto, notas, ticket médio, rankings e gráfico.
- O Worker usa 1 Chromium + N `BrowserContext`s independentes, Async Playwright e concorrência isolada.
- Três fluxos concorrentes foram demonstrados ao vivo, concluindo o preenchimento em homologação. Em máquina sobrecarregada houve lentidão e uma falha isolada, sem invalidar o modelo de contextos.
- O fluxo de homologação foi reconhecido manualmente até Resumo, Emitir e os
  botões de XML/DANFE. Por padrão o Worker continua parando antes de emitir;
  um modo controlado, visível e limitado a uma tarefa pode chegar ao clique e
  aos downloads somente após confirmação humana.
- XML e DANFE são capturados por `expect_download()` e recebem nome próprio
  baseado na tarefa. A autorização é confirmada por `span.autorizada` e texto
  exato `AUTORIZADA` antes dos downloads; o estado rejeitado ainda precisa de
  reconhecimento específico.
- A emissão controlada pode ser ativada somente por
  `TESTAR_EMISSAO_HOMOLOGACAO=true`. Configuração e URL da Page são validadas,
  há confirmação humana e somente um cliente visível pode executar. Roteiro:
  `docs/TESTE-WORKER-HOMOLOGACAO.md`.
- `AMBIENTE_EMISSAO=teste` é o padrão. Não executar testes de preenchimento no ambiente fiscal normal sem uma decisão consciente.
- O smoke test de login/navegação não precisa mais de `CLIENTE_X_EMITENTE`.
  Esse valor só é exigido ao ativar `TESTAR_PREENCHIMENTO_COMPLETO=true`,
  pois é nesse modo que o Worker seleciona o emitente no formulário fiscal.
- Uma revisão de segurança foi aplicada no Web e no Worker. O Web possui uma
  trava provisória e fail-closed em produção, cabeçalhos de segurança,
  validação de entradas e deixou de ler/gravar segredos fiscais. Detalhes e
  bloqueios para produção estão em `docs/SECURITY.md`.
- A migração `0004_credencial_fora_do_web.sql` foi aplicada ao banco de teste.
  O emitente existente ainda não possui `credencial_referencia`; isso não
  impede o Web atual, mas deverá ser configurado antes da integração. A página
  `/emitentes` permite revisar e completar o cadastro existente.
- O produtor interno do contrato v1 existe em
  `web/src/server/contrato-tarefa.ts`, sempre gera homologação e não é uma
  Server Action pública. A migração `0005` adicionou o identificador NFP-e
  sem segredo; o emitente de teste ainda não tem esse valor configurado.

O resultado técnico detalhado e seletores reconhecidos estão em `docs/HANDOFF.md` e `worker/RECON.md`.

## Regras de domínio confirmadas na reunião de 22/08

1. Emitente e cliente/mercado têm relação flexível N:N. A escolha do emitente é feita por tarefa/distribuição; não criar uma regra permanente de um emitente por cliente.
2. O cliente precisa de nome curto de exibição e razão social/destinatário fiscal separados.
3. O preço padrão é por produto+cliente/mercado, e não por emitente. Uma promoção pode substituir o valor em uma distribuição. Hoje o sistema usa o último preço empregado como novo padrão desse par.
4. Relatórios operacionais mostram faturamento bruto, quantidade de notas, ticket médio, série diária e recortes por cliente/produto. Financeiro líquido, descontos e valores a pagar a produtores pertencem a módulo futuro.
5. Tarefas pendentes devem ser processadas automaticamente na janela noturna de 00:00 a 06:00. Uma simples verificação de horário quando o usuário abre o Worker não atende ao requisito.

## Pontos técnicos abertos

- A migração `web/src/db/migrations/0001_emitente_por_tarefa.sql` foi aplicada ao banco de teste em 22/08. Ela preserva `clientes.emitente_id` como legado e cria `cliente_emitentes`, `distribuicoes.emitente_id` e `tarefas.emitente_id`.
- Após a aplicação: 1 emitente preservado, 2 relações cliente↔emitente criadas e nenhuma tarefa ou distribuição sem emitente. As colunas legadas de login continuam apenas no banco de teste, sem leitura/escrita pelo Web; devem ser removidas antes de produção.
- O cálculo de "perdido em trocas" agora exclui registros vinculados a tarefas canceladas. A consulta também passou a relacionar troca, tarefa e emitente; o comportamento foi coberto por teste unitário.
- Definir sem ambiguidade quais status entram no faturamento. Hoje a regra de código exclui somente `CANCELADA`; tarefas pendentes entram por serem valores já comprometidos na distribuição.
- Implementar agendador, estratégia de retries, fuso operacional e tratamento de tarefas fora da janela.
- Validar ao vivo a espera pela autorização já reconhecida e capturar o estado
  rejeitado, número, chave e totais do Resumo antes de retirar a conferência
  humana ou ligar a fila automática.
- Definir o contrato de uma tarefa entre a aplicação web e o Worker antes de
  qualquer integração: origem dos dados, campos fiscais, estados, reserva da
  tarefa, retorno de erro e armazenamento de PDF/XML.
- Topologia proposta para o piloto: Web no Vercel e Worker Playwright em VM
  Linux persistente. A Oracle Always Free será avaliada por prova de capacidade;
  não foi criada nem aprovada como infraestrutura definitiva.
- Regra fiscal é reutilizável e associada ao produto. A regra inicial comum
  reúne CFOP, ICMS, origem, benefício fiscal e parâmetros da operação. A
  referência é preservada no item da tarefa para não reinterpretar tarefas
  pendentes após mudança de cadastro.
- As migrações `0002` (regra fiscal) e `0003` (lotes de entrega) foram
  aplicadas ao banco de teste em 24/08: 1 regra criada, 5 lotes históricos e
  nenhuma referência pendente em produtos, itens ou disponibilidades.
- Cada confirmação de distribuição é um lote operacional. O roteiro do
  motorista usa esse lote, nunca apenas a data, para não misturar entregas de
  rodadas diferentes. Ele não exibe valores monetários.
- O contrato v1 agora rejeita UUIDs/formato/opções inválidas, `NaN`, infinito,
  valores excessivos e mais de 200 itens antes de abrir o navegador.
- O cadastro de mercados agora exige razão social, CNPJ válido, IE, CEP,
  número e emitente ativo; registros existentes podem ser corrigidos na
  própria página `/clientes`.
- Auditoria de prontidão do banco de teste em 25/08: 2/2 clientes ativos
  incompletos, 1/1 emitente sem referência/identificador NFP-e, 3/3 produtos
  completos e 8 tarefas pendentes. Não ligar polling enquanto esses registros
  e tarefas antigas não forem revisados.

## Princípios imutáveis

- Não misturar Playwright Sync e Async.
- Não compartilhar `BrowserContext` entre tarefas.
- Falha de uma tarefa não pode cancelar as demais.
- Não expor credenciais ou dados fiscais reais.
- Não emitir de verdade sem testes e validação explícita.
- Testar e documentar cada alteração antes do commit.
- Não publicar o Web usando apenas a proteção provisória; cumprir
  `docs/SECURITY.md` antes de dados reais/produção.
- A autoria de commits é humana; IA é ferramenta de apoio.
