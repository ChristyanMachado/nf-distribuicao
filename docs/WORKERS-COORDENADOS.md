# Workers coordenados — decisão e validação

Decisão de 10/09/2026. Evolução incremental, inicialmente preparada em código;
não representa migração ou ativação da produção.

## O que foi reaproveitado

O Web continua criando snapshots imutáveis e tarefas idempotentes no Postgres.
`FontePostgresTarefas` continua usando `FOR UPDATE SKIP LOCKED`, token por reserva,
transições condicionais e lease de tarefa de 900 s, renovado a cada 120 s nas
emissões. Playwright permanece Async, com um Chromium e contextos independentes.
Janela operacional e retorno imediato à fila depois de sucesso são preservados.

O novo cadastro privado `fiscal.workers` associa um identificador a **um papel
Postgres exclusivo**. O administrador define prioridade e capacidade; o worker
não pode cadastrar máquinas ou elevar privilégios. `session_user` autentica o
papel e um UUID novo identifica cada processo. GUCs locais à transação carregam
essa identidade sem vazar entre conexões do pooler. Não há porta pública no PC.

## Escolha do executor e tempos

| Parâmetro | Decisão inicial |
| --- | --- |
| Prioridade | PC principal 10; segundo PC 20; VM 100 |
| Heartbeat | A cada 30 segundos, inclusive ocioso |
| Validade do executor | 120 segundos pelo relógio do Postgres |
| Falha temporária de heartbeat | Reconsulta a cada 5 segundos; suspende novas admissões locais |
| Perda prolongada de comunicação | Após 100 segundos sem confirmação, cancela o ciclo e encerra com falha |
| Lease de tarefa | 900 segundos; não encurtado silenciosamente |
| Ciclo aparentemente travado | Limite total configurável, padrão 1.200 segundos |
| Falhas consecutivas do ciclo | Três falhas encerram o executor para reinício supervisionado |
| Atualização Web | 10 segundos com tarefas; 30 segundos ocioso; pausa em aba oculta |

O menor número saudável recebe novas reservas. Um PC ocupado mantém preferência;
esta etapa não implementa distribuição de carga para a VM. A volta do PC não
retira tarefas da VM. Os gatilhos validam novamente admissão, capacidade,
credencial fiscal em uso em outra máquina e identidade no instante da escrita.
A checagem Python reduz tentativas inúteis, mas a proteção está no banco.

O prazo de 120 segundos libera **novas tarefas** para outro executor. Uma tarefa
interrompida só é classificada depois do seu lease de 900 segundos vencer. Se outra
máquina ainda tem uma reserva válida da mesma credencial fiscal, a nova sessão
aguarda; isso prioriza estabilidade do portal sobre retomada imediata.

## Fronteira fiscal

| Ponto da interrupção | Tratamento |
| --- | --- |
| PENDENTE | Pode ser reservada pelo executor preferido |
| PROCESSANDO coordenada, sem marco externo, lease vencido | Volta a PENDENTE; após três tentativas fica ERRO |
| EMITINDO ou marco externo presente | AGUARDANDO_CONFERENCIA; nunca retry automático |
| Reserva legada sem marcação confiável | Conferência, mesmo que o estado ainda seja PROCESSANDO |
| Autorização persistida como EMITIDA | Recupera documentos; não reabre emissão |
| Cancelamento confirmado no portal, persistência falhou | Conferência; não apresentar como falha certa antes do envio |

Na emissão, o gatilho grava `external_started_at` junto com `EMITINDO`, antes do
clique já protegido. No cancelamento, um callback grava o marco após validar o
botão, imediatamente antes de Confirmar. Se essa gravação falhar, não há clique.
Foi removida a seleção automática de cancelamentos PROCESSANDO vencidos: ela
era insegura porque o estado não dizia até onde o portal tinha avançado.

Uma marca externa significa **envio possível**, não prova de sucesso. Não existe
garantia de exactly-once oferecida pelo portal. Se o PC morrer entre a gravação
do marco e a resposta, conservar a incerteza é intencional. Mesmo se o processo
antigo retomar um clique atrasado, a tarefa marcada não será reemitida pelo backup.

Os tokens de reserva continuam necessários além do UUID do processo. Um processo
antigo não pode renovar/transicionar a tarefa de outra execução. Documentos de uma
nota já EMITIDA podem ser recuperados pelo mesmo worker após reboot; manifests e
downloads ficam na pasta compartilhada persistente entre releases. Se só o PC
indisponível guarda o XML, o backup não tem acesso mágico a esse arquivo: usar a
recuperação histórica existente, após conferir a autorização no banco/portal.

## Concorrência e segurança

Cada PC começa com capacidade 1. O limite local pode ser de 1 a 3 no modo
coordenado, mas também precisa caber no limite aprovado no cadastro do banco.
Não há autodetecção que aumente concorrência por CPU/RAM. A produção legada
continua limitada a 1. Testar 2/3 somente em homologação com medição de memória,
tempo, sessões e portal; o ensaio anterior com 2 falhou nos menus da Receita.
Dentro da máquina, tarefas que compartilham a mesma referência de credencial
usam uma trava de sessão e não fazem login simultâneo.

As funções elevadas têm schema privado, `search_path` fixo, checagem de
`session_user` e EXECUTE público revogado. A única função pública de leitura
retorna o booleano não sensível do gate para compatibilidade dos workers legados;
ela não dá acesso à fila nem ao cadastro. Tabelas novas têm RLS; o worker só lê
seu cadastro e não o modifica. Gatilhos também restringem escrita de notas à
reserva/autorização/recuperação correspondente. A view administrativa expõe
somente metadados operacionais e não é concedida a anon/authenticated.

Permissões fiscais do worker continuam amplas o suficiente para executar os
fluxos existentes: ele lê snapshots e usa a chave privada de Storage. PCs com
essas credenciais são parte do perímetro de confiança; administrador local pode
acessá-las. ACL de conta dedicada reduz exposição a usuários comuns, mas não
substitui proteção física, atualização do Windows e rotação quando uma máquina
sai de uso. Não foi criada autenticação fiscal por usuário nem um broker de
Storage com escopo menor nesta etapa.

## Corte e reversão

1. Revisar/testar/registrar uma versão de código. Construir o pacote com commit
   limpo. Pacote `-dirty` é apenas prévia e não é instalável no servidor.
2. Aplicar somente `0016_workers_coordenados.sql` pelo fluxo Drizzle já existente,
   mantendo 0014 excluída. A migration começa com gate OFF.
3. Cadastrar identidades com `web/scripts/provisionar-executor.sql.template`,
   uma senha/papel por máquina. Não reutilizar `nf_worker_vm` ou o papel do Web.
4. Se o Web usar papel próprio, conceder apenas SELECT em `fiscal.worker_status`
   a esse papel. Não conceder a anon/authenticated.
5. Instalar PC/VM em manutenção. Confirmar versão e heartbeat. Confirmar que não
   há manifests pendentes do worker antigo nem operações fiscais em andamento.
6. Parar os processos antigos, impedir novos logins dos papéis antigos e conferir
   sessões. Executar o corte protegido em `ativar-workers-coordenados.sql`.
7. Liberar o principal com Resume; depois o backup. Criar trabalho exclusivamente
   pelo fluxo Web habitual, já conferido pelo operador.

Não ativar o gate com worker legado executando. Migração preparada não muda
`nf_worker_vm`, que continua NOLOGIN pelo incidente anterior. Para voltar ao
código anterior: drenar/parar todos os coordenados e conferir pendências antes
de desativar o gate e reabilitar **um único** legado. Não apagar colunas, notas,
histórico ou marcas externas; rollback de código não desfaz efeitos fiscais.

## Evidência e limites

Testes Python cobrem callback antes do clique, falha de posse sem clique,
identidade por contexto/transação, parada antes/durante trabalho, espera de backup,
manutenção, perda de heartbeat, sanitização e pacote rejeitado por corrupção ou
caminho inseguro. O Web tem testes de projeção, mensagens e atualização ociosa.

Uma versão inicial de `web/scripts/testar-workers-rollback.sql` foi executada com
a migration na mesma transação de homologação e exercitou gatilhos e funções reais: cadastro inexistente,
segunda partida recusada, token/owner, marco externo, nota sob reserva própria,
recuperação pré-envio, conferência pós-envio, cancelamento incerto, prioridade,
failover por vencimento e boot antigo recusado. Tudo é desfeito por ROLLBACK.
Esse ensaio usa SET ROLE e a identidade autenticada administrativa cadastrada
deliberadamente como fixture. Não comprova duas conexões autenticadas concorrentes.

Em 11/09, a revisão independente identificou que aquele roteiro não reproduzia
a ordem real da autorização: a fonte muda para EMITIDA e limpa o lease antes do
INSERT da nota. A migration foi corrigida para essa ordem, para o estado final
DOCUMENTOS_ARMAZENADOS (incluindo upload após reboot/idempotência e contagem) e
para rejeitar estados terminais reabertos, lease NULL, troca de token e limpeza
tomada antes do vencimento. O roteiro SQL foi ampliado para esses casos.
Uma tentativa foi recusada pela revisão automática por limite de uso. Após nova
checagem somente de leitura do QA vazio, a repetição pelo mesmo mecanismo foi
autorizada e **o roteiro ampliado passou integralmente**, com ROLLBACK. O resultado
foi `rollback_tests_passed=true`, com dois registros fictícios durante o teste.
Checagem posterior confirmou zero tarefas/notas e nenhum papel/tabela persistido.
310 testes Python, 150 Web, TypeScript e o parser Windows passaram localmente; ainda não
é autorização de promover a versão coordenada. A versão anterior foi usada
separadamente na contingência legítima do lote 9, nunca como teste da coordenação.

Ainda obrigatórios antes da promoção: instalação Windows limpa com dependências,
reboot sem login, simulação de perda de rede/energia com segundo executor,
atualização/rollback com tarefa em curso e verificação visual do painel com dados.
Docker local não iniciou; a consulta ao pacote de Postgres local foi bloqueada
pela revisão automática de permissões após atingir o limite de uso. A alternativa
segura disponível foi testar transações de rollback no projeto QA já autorizado.
Nenhuma produção fiscal foi executada para testar esta mudança.

Referências técnicas consultadas: [bloqueios do PostgreSQL](https://www.postgresql.org/docs/current/explicit-locking.html),
[identidade da sessão](https://www.postgresql.org/docs/current/functions-info.html),
[configuração do Agendador do Windows](https://learn.microsoft.com/en-us/powershell/module/scheduledtasks/new-scheduledtasksettingsset).
