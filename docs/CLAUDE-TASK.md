# Ordem de continuidade para Claude — 27/08/2026

## Papel

Atue como revisor/implementador auxiliar. O Codex mantém a integração principal
e o responsável humano decide commits. Não presuma autoria, não faça push e não
altere arquitetura ou migrações aplicadas sem registrar e justificar.

## Antes de agir

1. Leia `AGENTS.md` quando disponível, `CLAUDE.MD`, `AI-CONTEXT.md`,
   `ARCHITECTURE.md`, `HANDOFF.md`, `COLABORACAO.md`, `SECURITY.md` e
   `CONTRATO-WEB-WORKER.md`.
2. Confira branch, `git status` e diff. Preserve alterações existentes.
3. Considere `0001`–`0009` já aplicadas no banco de teste; não reaplique às
   cegas. Em outro banco, rode primeiro a verificação pré-0008.
4. Se `graphify-out/graph.json` existir, use uma consulta focada para trabalho
   transversal ou de impacto incerto. Em correção pequena com arquivos já
   conhecidos, vá direto ao código, testes e diff. Siga `GRAPHIFY.md`, limite a
   saída e confirme toda conclusão no código real. Se o mapa não existir, ele é
   opcional: não bloqueie o trabalho nem peça credenciais para gerá-lo.

## Estado que deve ser preservado

- Playwright Async: 1 Browser + N `BrowserContext`s, máximo técnico atual 3.
- Produção fiscal bloqueada; somente host HTTPS exato de homologação.
- Fonte banco já ligada ao `main.py`; ensaio sem navegador devolve `PENDENTE`.
- Processamento completo só com todas as flags, visível e primeiro com uma
  tarefa. Resultado incerto exige conferência, nunca retry automático.
- Snapshot v1/payload/hash é imutável e gravado atomicamente.
- Credenciais não entram no Web, payload, Git, relatório ou logs.
- Emitente aceita CPF ou CNPJ, IE opcional e apenas referência de credencial.
  Não transforme essa referência em campos de login/senha no Web.
- Clientes, emitentes e produtos são desativados logicamente; não apague
  histórico em cascata. Tarefas possuem três visões e agrupamento por lote.
- As transições da orquestração banco já possuem testes diretos para sucesso,
  falha pré-emissão e resultado incerto pós-`EMITINDO`; preserve esses gates.

## Próxima tarefa prioritária

O código já concluiu a preparação técnica e a correção dos cadastros para o
primeiro round-trip. O responsável humano precisa completar o emitente e criar
uma distribuição nova. Não inicie Storage, scheduler ou reestruturação ampla
antes desse ensaio. Se receber o projeto enquanto ainda não houver uma tarefa
elegível, faça somente revisão focada e testes sem navegador:

1. revisar configuração e mensagens do fluxo `FONTE_TAREFAS=banco` com
   `PROCESSAR_FILA_BANCO=false`;
2. revisar o template e o auditor do papel dedicado, sem aplicar no banco;
3. confirmar que o checklist Web e os bloqueios antecipados continuam
   coerentes com as validações das Server Actions e preservam a consulta
   agregada de prontidão; não voltar a várias consultas na Home;
4. preservar o tratamento de erros dentro dos formulários e a desativação
   lógica; falhas internas nunca devem aparecer na interface;
5. adicionar apenas testes unitários/integrados sem navegador que cubram falhas
   reais encontradas;
6. atualizar `HANDOFF.md` se houver mudança material.

Não habilite modo estrito, hooks, watch, MCP ou backend semântico do Graphify.
Não envie nem versione o grafo inteiro; para handoff, prefira uma saída curta da
consulta junto dos arquivos reais e do diff.

Quando o responsável humano completar cliente/emitente e criar uma nova
distribuição, a ordem passa a ser: verificar prontidão; ensaio banco sem
navegador e retorno `PENDENTE`; somente depois, com autorização explícita,
homologação visível de uma tarefa.

## Validação e entrega

Rode Worker tests, Web tests, TypeScript, build e `git diff --check`. Não afirme
que o round-trip fiscal funciona sem o teste humano. Entregue um resumo curto
com: arquivos alterados, motivo, testes, riscos residuais e próximo passo.
