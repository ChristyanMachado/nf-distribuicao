# Ordem de continuidade para Claude — 26/08/2026

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

## Estado que deve ser preservado

- Playwright Async: 1 Browser + N `BrowserContext`s, máximo técnico atual 3.
- Produção fiscal bloqueada; somente host HTTPS exato de homologação.
- Fonte banco já ligada ao `main.py`; ensaio sem navegador devolve `PENDENTE`.
- Processamento completo só com todas as flags, visível e primeiro com uma
  tarefa. Resultado incerto exige conferência, nunca retry automático.
- Snapshot v1/payload/hash é imutável e gravado atomicamente.
- Credenciais não entram no Web, payload, Git, relatório ou logs.

## Próxima tarefa prioritária

O código já concluiu a preparação técnica do primeiro round-trip. Não inicie
Storage, scheduler ou reestruturação ampla antes do ensaio humano. Se receber
o projeto enquanto ainda não houver uma tarefa elegível, faça somente revisão
focada e testes sem navegador:

1. revisar configuração e mensagens do fluxo `FONTE_TAREFAS=banco` com
   `PROCESSAR_FILA_BANCO=false`;
2. revisar o template e o auditor do papel dedicado, sem aplicar no banco;
3. confirmar que o checklist Web e os bloqueios antecipados continuam
   coerentes com as validações das Server Actions e preservam a consulta
   agregada de prontidão; não voltar a várias consultas na Home;
4. adicionar apenas testes unitários/integrados sem navegador que cubram falhas
   reais encontradas;
5. atualizar `HANDOFF.md` se houver mudança material.

Quando o responsável humano completar cliente/emitente e criar uma nova
distribuição, a ordem passa a ser: verificar prontidão; ensaio banco sem
navegador e retorno `PENDENTE`; somente depois, com autorização explícita,
homologação visível de uma tarefa.

## Validação e entrega

Rode Worker tests, Web tests, TypeScript, build e `git diff --check`. Não afirme
que o round-trip fiscal funciona sem o teste humano. Entregue um resumo curto
com: arquivos alterados, motivo, testes, riscos residuais e próximo passo.
