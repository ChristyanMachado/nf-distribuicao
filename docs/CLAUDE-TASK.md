# Ordem de continuidade para Claude — 04/09/2026

## Papel

Atue como revisor/implementador auxiliar. O Codex mantém a integração principal
e o responsável humano decide commits. Não presuma autoria, não faça push e não
altere arquitetura ou migrações aplicadas sem registrar e justificar.

## Antes de agir

1. Leia `AGENTS.md` quando disponível, `CLAUDE.MD`, `AI-CONTEXT.md`,
   `ARCHITECTURE.md`, `HANDOFF.md`, `COLABORACAO.md`, `SECURITY.md` e
   `CONTRATO-WEB-WORKER.md`.
2. Confira branch, `git status` e diff. Preserve alterações existentes.
3. Considere `0001`–`0012` já aplicadas no banco de teste; não reaplique às
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
  histórico em cascata. Tarefas possuem cinco visões e agrupamento por lote.
- As transições da orquestração banco já possuem testes diretos para sucesso,
  falha pré-emissão e resultado incerto pós-`EMITINDO`; preserve esses gates.

## Próxima tarefa prioritária

Revise e ajude a validar o circuito conectado de recuperação já implementado:
`/notas` → `fiscal.recuperacoes_documentos` → Worker Consulta - TESTE → XML
validado → DANFE → Storage → botões Web. A fila tem lease/token próprios, uma
linha por nota e não pode atualizar nem reabrir a tarefa de emissão. Documentos
originais duram 30 dias; recuperados duram exatamente 7 dias.

As migrations `0011` e `0012` foram aplicadas no banco de teste em 02/09 pelo
migrator oficial do runtime. O papel `nf_worker_local` foi reprovisionado e a
auditoria passou sem privilégios ausentes ou excessivos. O teste humano de
ponta a ponta também passou com duas notas recuperadas em execuções separadas.
O próximo trabalho principal é o container/VM e o polimento mobile restante.
O serviço já separa recuperação/limpeza 24h de novas emissões, que só são
reservadas na janela configurável padrão `00:00–06:00` em
`America/Sao_Paulo`. Não substitua essa política por cron que desligue o
serviço: o botão de recuperação deve continuar atendido fora da madrugada.

Ao orientar o deploy:

1. raiz Vercel deve ser `web/`; segredos apenas no painel e Preview isolado;
2. Worker não expõe porta e usa uma identidade PostgreSQL exclusiva;
3. auditar papel/canal antes de `docker compose up`;
4. confirmar ausência de tarefa involuntária, pois o serviço reserva ao subir;
5. começar com concorrência 1 e nunca trocar `AMBIENTE_EMISSAO` para normal.

O round-trip conectado está comprovado em homologação. As 000010 e 000011 foram
autorizadas com pausa humana; a 000012 foi autorizada automaticamente depois de
o Worker passar a aguardar a tela-resumo do último produto. Não substitua essa
espera por `sleep` nem remova a validação do domínio de homologação.

1. revisar a recuperação, especialmente idempotência, corrida limpeza/fila,
   validação do XML antes do DANFE e assinatura server-only;
2. não ativar sem teste humano; nunca pedir chaves ou credenciais no chat;
3. preservar a recuperação de upload interrompido sem reemitir nota e o teste
   de até 3 tarefas simultâneas com isolamento por contexto;
4. confirmar que o checklist Web e os bloqueios antecipados continuam
   coerentes com as validações das Server Actions e preservam a consulta
   agregada de prontidão; não voltar a várias consultas na Home;
5. preservar o tratamento de erros dentro dos formulários e a desativação
   lógica; falhas internas nunca devem aparecer na interface;
6. adicionar apenas testes unitários/integrados sem navegador que cubram falhas
   reais encontradas;
7. atualizar `HANDOFF.md` se houver mudança material.

Não habilite modo estrito, hooks, watch, MCP ou backend semântico do Graphify.
Não envie nem versione o grafo inteiro; para handoff, prefira uma saída curta da
consulta junto dos arquivos reais e do diff.

Preserve `ACESSO_PORTAL_NEGADO` como defesa e o modo opcional
`PAUSAR_ANTES_TRANSPORTE` apenas para diagnóstico visível e sempre em conjunto
com `INSPECIONAR=true`. O fluxo normal deve
permanecer sem Inspector e sincronizado por evidências da interface.

## Validação e entrega

Rode Worker tests, Web tests, TypeScript, build e `git diff --check`. Não afirme
que o round-trip fiscal funciona sem o teste humano. Entregue um resumo curto
com: arquivos alterados, motivo, testes, riscos residuais e próximo passo.
