# AI Context — NF Distribuição

## Objetivo

Contexto autoritativo para pessoas e IAs. Antes de alterar código, ler também
`ARCHITECTURE.md`, `HANDOFF.md` e `COLABORACAO.md` e conferir o diff atual.

O produto organiza distribuições diárias e automatiza NFP-e. O Web cadastra e
gera tarefas; o banco mantém snapshots imutáveis e a fila; o Worker reserva e
executa cada tarefa em um `BrowserContext` independente.

## Estado validado em 28/08/2026

- Web: cadastros, distribuição por lote, tarefas, notas, roteiro de entrega e
  relatórios operacionais; interface responsiva e fluxo diário reduzido.
- Worker: Playwright Async, 1 Browser + até 3 contextos isolados. Login,
  preenchimento, autorização em homologação e download de XML/DANFE já foram
  demonstrados ao vivo. Produção permanece bloqueada.
- A fonte de banco está ligada ao `main.py`. Com `FONTE_TAREFAS=banco` e as
  flags de integração, o modo seguro reserva, valida e devolve a tarefa a
  `PENDENTE`. Com `PROCESSAR_FILA_BANCO=true` e todas as travas de homologação,
  o código liga reserva → Playwright → `EMITINDO` → XML autorizado → `EMITIDA`.
  O modo seguro foi ensaiado com uma tarefa elegível real em 28/08: reservou,
  validou contrato/hash/credencial e devolveu a tarefa a `PENDENTE`. O ciclo
  fiscal conectado ainda não foi executado.
- XML só é aceito com estrutura NF-e, chave de 44 dígitos, número, protocolo e
  `cStat=100`. PDF precisa começar com `%PDF-`. Arquivos ficam locais e
  privados; o Storage remoto ainda não foi implementado.
- Migrações `0001` a `0009` estão aplicadas no banco de teste. `0008` adiciona
  idempotência do lote, snapshot `payload_worker` + SHA-256, token de reserva,
  protocolo e unicidades. `0009` corrige a ambiguidade do retorno
  `reserva_token`. `EXECUTE` público da função de reserva está revogado.
- Validação local: **150 testes Worker**, **75 testes Web**, TypeScript e build
  de produção passaram.
- Cadastros de emitente agora aceitam CPF ou CNPJ e IE opcional. A coluna
  física ainda se chama `cnpj` por compatibilidade; não criar migração apenas
  para renomeá-la durante o gate de integração.
- Clientes, emitentes e produtos podem ser desativados/reativados sem apagar histórico.
  A desativação é bloqueada enquanto houver tarefa operacional aberta.
- Produtos ativos podem ser editados no próprio cartão. Novas distribuições
  mostram somente produtos ativos; tarefas já criadas preservam seu snapshot.
- Erros esperados de formulário são mostrados na própria tela; falhas internas
  recebem mensagem genérica e não abrem a tela técnica do Next.js.
- Tarefas têm abas Pendentes, Concluídas e Canceladas e são agrupadas pelo lote
  de distribuição. Legado sem lote é consolidado por data, explicitamente sem
  inventar número de distribuição.
- A orquestração da fonte banco possui testes sem navegador para devolução segura
  a `PENDENTE`, credencial ausente, falha pré-emissão, incerteza pós-`EMITINDO`
  e registro de uma autorização confirmada com o token da reserva.
- A Home mostra um checklist fiscal calculado com as mesmas validações usadas
  no salvamento e leva diretamente ao cadastro pendente. A Distribuição não
  abre o formulário quando nenhum cliente/produto está pronto.
- O checklist usa uma única consulta agregada e foi validado visualmente em
  390×844; a Home respondeu em ~0,95 s no ensaio local após a otimização.
- Falhas temporárias do Web exibem recuperação neutra, sem detalhes técnicos e
  sem sugerir o reenvio cego de uma distribuição.
- O Worker local possui papel PostgreSQL exclusivo de menor privilégio,
  provisionado por comando explícito e salvo somente no `.env` ignorado. A
  auditoria confirmou todos os privilégios obrigatórios e nenhum excessivo.
- Asyncpg usa `statement_cache_size=0`, necessário para compatibilidade com o
  pooler transacional usado pelo banco. Verificadores retornam somente JSON
  sanitizado, sem traceback, host, usuário ou segredo.
- O verificador Web de integração agora aplica dígitos verificadores a CPF/CNPJ,
  exige vínculo com emitente ativo e regra fiscal ativa, sem imprimir documentos.

## Estado observado no banco de teste em 28/08/2026

- 1 cliente ativo e fiscalmente completo, vinculado ao emitente;
- 1 emitente ativo e completo para a integração;
- 3 produtos ativos e fiscalmente completos;
- 10 tarefas antigas `CANCELADA`, todas sem lote;
- 6 lotes numerados;
- 1 tarefa `PENDENTE` elegível para o Worker;
- canal TLS, papel restrito, função de reserva e round-trip seguro confirmados;
  a tarefa voltou a `PENDENTE` sem emissão fiscal.

Não corrigir tarefas antigas à força. A tarefa elegível atual fica reservada
para o primeiro ciclo conectado de homologação, somente com autorização explícita.

## Contrato e estados

- Cada confirmação de distribuição cria um lote idempotente e numerado.
- Cada tarefa nova guarda `contrato_versao=1`, `payload_worker` imutável e
  `payload_hash`; os três campos são gravados atomicamente.
- A reserva retorna `tarefa_id` e um `reserva_token` único, com lease entre 60
  e 3600 segundos. Toda renovação/transição exige o token vigente.
- Ensaio seguro bem-sucedido: valida contrato/hash/credencial e devolve a
  tarefa a `PENDENTE`, limpando lease/token e restituindo a tentativa.
- Contrato, hash ou referência inválidos: `AGUARDANDO_CONFERENCIA`.
- Incerteza depois do clique fiscal ou lease vencido nunca entra novamente em
  retry automático; exige conferência humana para evitar nota duplicada.
- Autorização comprovada pelo XML registra nota e tarefa na mesma transação.

## Regras de domínio confirmadas

1. Emitente ↔ cliente é N:N; o emitente é escolhido por tarefa/distribuição.
2. Cliente tem nome curto operacional e razão social fiscal separados.
3. Preço padrão é por produto + cliente, podendo ser substituído no lote.
4. Regra fiscal é reutilizável e associada ao produto; o item guarda a
   referência usada, sem reinterpretar tarefas antigas.
5. Um lote representa uma distribuição e também delimita o relatório do
   motorista, que não contém valores monetários.
6. Relatórios atuais são operacionais. Financeiro líquido, auditoria, RH e
   autorização multiusuário pertencem às próximas fases.
7. O requisito futuro é processamento automático entre 00:00 e 06:00 em
   `America/Sao_Paulo`; ainda falta scheduler persistente.

## Próximo gate seguro

1. Completar o emitente no Web e manter login/senha fiscal somente no Worker.
2. Criar exatamente uma nova distribuição e rodar
   `npm run db:verify-integration`.
3. Executar o Worker com fonte banco, processamento desligado e concorrência 1;
   confirmar reserva, validação e retorno a `PENDENTE`.
4. Somente com autorização explícita, ativar o processamento completo em
   homologação, visível, com uma tarefa.
5. Conferir status, nota, chave/número/protocolo e arquivos locais.
6. Depois repetir com até 3 contextos e implementar Storage privado, scheduler,
   observabilidade e papel de banco dedicado com menor privilégio.

## Índice local de código

O Graphify 0.9.50 foi validado em 27/08/2026 como ferramenta auxiliar local,
com suporte SQL e extração `--code-only`. O mapa não é fonte de verdade, não é
versionado e não autoriza pular a leitura do código ou os testes. Regras e
comandos seguros estão em `GRAPHIFY.md`. O uso é seletivo: obrigatório quando
há impacto transversal ou incerto e dispensável em correções locais já
mapeadas, nas quais a consulta acrescentaria custo sem reduzir leitura.

## Princípios imutáveis

- Não misturar Playwright Sync e Async nem compartilhar `BrowserContext`.
- Não colocar segredos no código, Git, logs, documentos ou banco acessível ao
  Web; `.env` nunca é versionado.
- Não emitir em produção sem decisão e validação humana explícitas.
- Não repetir automaticamente uma tarefa fiscal de resultado incerto.
- Não afirmar que algo funciona sem teste proporcional ao risco.
- Toda mudança de arquitetura deve ser registrada.
- Commits usam a identidade do programador; IA é ferramenta de apoio.
