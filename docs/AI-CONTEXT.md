# AI Context — NF Distribuição

## Objetivo

Contexto autoritativo para pessoas e IAs. Antes de alterar código, ler também
`ARCHITECTURE.md`, `HANDOFF.md` e `COLABORACAO.md` e conferir o diff atual.

O produto organiza distribuições diárias e automatiza NFP-e. O Web cadastra e
gera tarefas; o banco mantém snapshots imutáveis e a fila; o Worker reserva e
executa cada tarefa em um `BrowserContext` independente.

## Estado validado em 29/08/2026

- A marca confirmada do produto é **Graalyst**. O ícone oficial foi aplicado
  ao login e à navegação do Web; não confundir com nomes de emitentes presentes
  em dados ou testes históricos.

- Web: cadastros, distribuição por lote, tarefas, notas, roteiro de entrega e
  relatórios operacionais; interface responsiva e fluxo diário reduzido.
- Worker: Playwright Async, 1 Browser + até 3 contextos isolados. Login,
  preenchimento, autorização em homologação e download de XML/DANFE já foram
  demonstrados ao vivo. Produção permanece bloqueada.
- A fonte de banco está ligada ao `main.py`. Com `FONTE_TAREFAS=banco` e as
  flags de integração, o modo seguro reserva, valida e devolve a tarefa a
  `PENDENTE`. Com `PROCESSAR_FILA_BANCO=true` e todas as travas de homologação,
  o código liga reserva → Playwright → `EMITINDO` → XML autorizado → `EMITIDA`.
  O modo seguro foi ensaiado com tarefa real. O ciclo conectado completo foi
  comprovado nas distribuições 000010–000012: banco → reserva → Playwright →
  `EMITINDO` → autorização → XML/DANFE → nota e tarefa `EMITIDA`.
- XML só é aceito com estrutura NF-e, chave de 44 dígitos, número, protocolo e
  `cStat=100`. PDF precisa começar com `%PDF-`. O upload privado está
  implementado, configurado e validado ao vivo: o primeiro XML/DANFE chegou ao
  bucket privado, a nota ficou disponível no Web e o PDF foi baixado com sucesso.
- Migrações `0001` a `0010` estão aplicadas no banco de teste. `0008` adiciona
  idempotência do lote, snapshot `payload_worker` + SHA-256, token de reserva,
  protocolo e unicidades. `0009` corrige a ambiguidade do retorno
  `reserva_token`. `EXECUTE` público da função de reserva está revogado.
- `0010` adiciona `codigo_erro`: o Worker registra uma causa sanitizada por
  etapa e o Web mostra “o que aconteceu” + “o que fazer”. O botão **Tentar
  novamente** aparece somente para falhas pré-emissão permitidas por lista
  fechada; resultado fiscal incerto nunca volta à fila.
- Validação local: **180 testes Worker**, **93 testes Web**, 3 testes do
  preflight de deploy, TypeScript e build de produção passaram.
- O bucket `documentos-fiscais` foi conferido somente por metadados: existe, é
  privado, limita tamanho e aceita PDF/XML. O papel `nf_worker_local` ganhou
  UPDATE apenas de `pdf_path`, `xml_path` e expiração; a auditoria continua sem
  privilégios obrigatórios ausentes ou excessivos.
- O Worker envia XML/DANFE em paralelo para caminhos `notas/<tarefa>/<tipo>-<sha256>`.
  Não usa upsert: conflito só é idempotente se o conteúdo remoto for idêntico.
  O Web gera URLs assinadas de 5 minutos exclusivamente no servidor.
- Cadastros de emitente agora aceitam CPF ou CNPJ e IE opcional. A coluna
  física ainda se chama `cnpj` por compatibilidade; não criar migração apenas
  para renomeá-la durante o gate de integração.
- Clientes, emitentes e produtos podem ser desativados/reativados sem apagar histórico.
  A desativação é bloqueada enquanto houver tarefa operacional aberta.
- Produtos ativos podem ser editados no próprio cartão. Novas distribuições
  mostram somente produtos ativos; tarefas já criadas preservam seu snapshot.
- Erros esperados de formulário são mostrados na própria tela; falhas internas
  recebem mensagem genérica e não abrem a tela técnica do Next.js.
- Tarefas têm abas Pendentes, Em andamento, Atenção, Concluídas e Canceladas.
  `ERRO`/`AGUARDANDO_CONFERENCIA` não inflam Pendentes; erros pré-emissão podem
  ser movidos para Canceladas, mas incerteza fiscal continua protegida.
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
- O primeiro deploy Vercel revelou uma regressão exclusiva da autenticação
  ativa: o CSS escondia `.app-shell`, ancestral do próprio formulário. A regra
  agora oculta somente navegação lateral/cabeçalho/barra inferior e possui teste.
- Autenticação de transição por Supabase Auth foi adicionada atrás de
  `APP_AUTH_PROVIDER=supabase`. Ela reutiliza usuários do projeto compartilhado,
  mas só cria a sessão curta da aplicação depois de confirmar no próprio token
  do usuário que `public.perfis` contém `papel=gerente` e `ativo=true`. O login
  administrativo permanece como fallback até a chave publicável ser configurada.
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
- 5 produtos ativos passam nas validações estruturais. As distribuições
  000010–000012 usaram 3 produtos reais, localizados e preenchidos no portal;
- 14 tarefas `CANCELADA` e 3 tarefas `EMITIDA` visíveis no Web;
- 12 lotes numerados e 0 tarefas `PENDENTE` após o ensaio;
- canal TLS, papel restrito e função de reserva confirmados; no ensaio seguro,
  a tarefa voltou a `PENDENTE` sem emissão fiscal.
- Duas execuções com pausa manual atravessaram Transporte e foram autorizadas.
  A investigação mostrou uma corrida: depois do segundo Avançar do ICMS, a SPA
  podia manter o botão antigo visível por alguns milissegundos.
- O Worker agora aguarda a tela-resumo pelo botão `Adicionar Produto` antes de
  localizar o Avançar para Transporte. A 000012 validou essa sincronização sem
  Inspector nem espera fixa: produtos em 4,61 s, autorização confirmada e XML/
  DANFE salvos; o processo inteiro levou cerca de 18 s.
- `ACESSO_PORTAL_NEGADO` permanece como defesa caso o portal realmente negue o
  módulo; o Web não oferece retry automático para esse código.

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

1. No Vercel, adicionar `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` e então mudar
   `APP_AUTH_PROVIDER` para `supabase`; redefinir a senha do usuário gerente no
   painel sem enviá-la ao chat e validar login/logout. O fallback atual continua
   ativo enquanto essa variável não for trocada.
2. Construir a imagem do Worker em uma máquina com Docker e executar primeiro
   as auditorias sem consumir a fila. Docker não está instalado nesta máquina,
   portanto o container ainda não foi validado em runtime.
3. Criar a VM do piloto, fornecer uma identidade PostgreSQL própria e iniciar o
   serviço somente quando não houver tarefa involuntária elegível.
4. Repetir o fluxo conectado com até 3 tarefas/contextos simultâneos, medindo
   CPU/RAM, isolamento e tempo, e depois implementar scheduler/alertas.
5. Implementar recuperação de upload interrompido sem reemissão e manter
   produção bloqueada até autenticação/autorização definitiva, backup,
   retenção, recuperação e piloto humano aprovado.

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
