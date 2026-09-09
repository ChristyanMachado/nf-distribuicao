# Arquitetura — NF Distribuição

## Visão geral

```text
Web Next.js → PostgreSQL/fila → Worker Playwright → Receita PR
        ↑         status/nota/metadados         ↓
        └────────── documentos (Supabase Storage privado) ┘
```

O Web é a interface operacional. O banco é a fonte de verdade e separa os
processos. O Worker é persistente e pode rodar em outra máquina/rede. Ele não
deve executar dentro de uma função Vercel.

## Web e domínio

O Web mantém emitentes, clientes, produtos, regras fiscais, preços,
distribuições, lotes, tarefas e notas. Cliente ↔ emitente é N:N e a seleção é
gravada na tarefa. O preço padrão é produto + cliente. Regras fiscais são
reutilizáveis, associadas ao produto e preservadas no item da tarefa.

Emitente aceita CPF ou CNPJ; inscrição estadual é opcional. Por compatibilidade
com o esquema aplicado, o documento continua persistido na coluna histórica
`emitentes.cnpj`. O Web guarda somente `credencial_referencia`: login e senha
fiscal são segredos operacionais do Worker e nunca entram no navegador ou neste
banco. Clientes, emitentes e produtos usam desativação lógica, preservando
tarefas, notas e auditoria; registros inativos deixam de aparecer nos novos
fluxos. Produtos ativos podem ser editados, mas tarefas existentes mantêm o
snapshot fiscal criado na confirmação da distribuição.

Server Actions de formulário devolvem falhas de validação esperadas para o
componente exibir junto ao formulário. Exceções internas são substituídas por
mensagem neutra, evitando tela técnica e vazamento acidental de banco.

Cada envio de distribuição cria um lote idempotente, numerado e usado também
como recorte do roteiro do motorista. A Server Action valida tamanho, UUIDs,
cadastros fiscais e relações antes de gravar tudo em transação.

### Rascunho de distribuição

O formulário pode preservar uma distribuição ainda não enviada somente no
`localStorage` do navegador. O rascunho não cria lote, tarefa, disponibilidade,
nota ou fila e, portanto, não é uma distribuição fiscal. Sua chave inclui um
identificador HMAC opaco da sessão administrativa, para que duas contas no
mesmo navegador não reutilizem por engano o mesmo conteúdo. O valor salvo
contém apenas ids de cadastro e valores operacionais preenchidos; nunca inclui
credenciais fiscais, documentos de login ou dados do Worker.

Na restauração, o Web trata o conteúdo local como não confiável: limita o
tamanho/estrutura e remove produtos, clientes ou relações emitente-cliente que
não estejam mais ativos para a sessão atual. O rascunho é apagado após o envio
confirmado ou descarte explícito. Como ele é local ao navegador, não promete
continuidade entre dispositivos; uma persistência remota futura exigirá modelo
de dono, RLS e uma migration própria.

Ao final da transação cada tarefa recebe, no mesmo comando:

- `contrato_versao=1`;
- `payload_worker` JSONB imutável;
- `payload_hash` SHA-256 da representação JSONB persistida.

Isso impede que uma mudança posterior de cadastro altere silenciosamente uma
tarefa fiscal já preparada.

## Worker fiscal

```text
1 Chromium
  ├─ BrowserContext tarefa A → Page A
  ├─ BrowserContext tarefa B → Page B
  └─ BrowserContext tarefa C → Page C
```

O Worker usa apenas Playwright Async. Cada contexto tem cookies, storage e
sessão próprios. `asyncio.gather()` isola resultados e um semáforo limita a
concorrência a no máximo 3 no modo atual.

Existem duas fontes:

- `arquivo`: demonstração/smoke local com JSON;
- `banco`: fila real por `worker/src/fonte_tarefas.py`.

No banco, `fiscal.reservar_tarefas_worker` usa `FOR UPDATE SKIP LOCKED`, muda a
tarefa para `PROCESSANDO` e devolve um token exclusivo. O Worker verifica o
hash antes do navegador, resolve a credencial apenas no ambiente protegido,
renova o lease e usa token fencing em todas as transições.

Fora da janela operacional, uma segunda reserva atômica seleciona com
`FOR UPDATE SKIP LOCKED` somente tarefas `PENDENTE` do lote mais antigo que já
tenha ao menos uma tarefa com `iniciado_em`. Isso permite concluir uma
distribuição iniciada mesmo após reinício, sem liberar um lote novo. A operação
usa os privilégios mínimos já concedidos e não toca o sistema de ponto.

### Modos da fonte banco

1. **Ensaio sem navegador:** reserva, valida e devolve a `PENDENTE`, limpando
   token/lease e restituindo a tentativa.
2. **Fila fiscal processada:** sob as flags explícitas do ambiente contratado,
   executa em homologação ou no piloto de produção
   reserva → Playwright → `EMITINDO` → XML `cStat=100` → registro transacional
   de nota e tarefa `EMITIDA`.

O ambiente é parte do snapshot imutável. Web e Worker precisam concordar; a
Page também é revalidada contra o host oficial imediatamente antes de emitir
ou confirmar cancelamento. O piloto normal exige `MAX_CONCORRENCIA=1`. Ver
`PRODUCAO-FISCAL.md`.

Contrato/hash/credencial inválidos vão para `AGUARDANDO_CONFERENCIA`. Lease
vencido ou incerteza depois do clique fiscal não volta automaticamente à fila.

Falhas operacionais usam `codigo_erro` estruturado e mensagem sanitizada. O Web
traduz o código em causa e orientação para o usuário. Uma Server Action só
devolve `ERRO` a `PENDENTE` para a lista fechada de falhas comprovadamente
pré-emissão (`FALHA_AUTENTICACAO`, `FALHA_NAVEGACAO`,
`FALHA_PREENCHIMENTO`, `FALHA_TECNICA`). `AGUARDANDO_CONFERENCIA`, contrato
inválido e emitente divergente não possuem retry; exigem conferência ou nova
distribuição. Falha de preenchimento também recomenda nova distribuição quando
o cadastro mudou, mas permite retry após uma correção técnica do portal.

A tela separa estados em cinco visões: `PENDENTE`, processamento em andamento,
atenção (`ERRO`/`AGUARDANDO_CONFERENCIA`), concluídas e canceladas. Somente
`PENDENTE` e `ERRO` podem ser cancelados pelo usuário; estados de conferência
fiscal nunca são ocultados por essa ação.

## Travas fiscais

- `AMBIENTE_EMISSAO=teste|normal` persistido no contrato imutável;
- host HTTPS exato do ambiente revalidado no clique fiscal;
- homologação e produção são flags mutuamente exclusivas;
- produção exige fila do banco, modo automático e concorrência 1;
- ensaio humano continua visível; o serviço persistente continua headless;
- navegação, preenchimento e emissão exigem flags separadas;
- banco exige `TESTAR_INTEGRACAO_BANCO`, URL TLS e `WORKER_ID`;
- `PROCESSAR_FILA_BANCO` exige todas as travas anteriores;
- primeiro ensaio conectado usa concorrência 1; teto técnico atual é 3.

## Persistência e migrações

As migrações `0001`–`0013` estão ativas no banco de teste.
A `0014` permanece adiada por decisão explícita do responsável.
Ela também permanece fora do journal ativo do Drizzle, impedindo que uma
implantação fiscal posterior a execute por acidente.

### Cancelamento fiscal

O cancelamento não reutiliza a tarefa de emissão nem altera seu estado. A Web
cria uma linha única por nota em `fiscal.cancelamentos_fiscais`; o Worker usa o
snapshot imutável da tarefa apenas para resolver emitente e credencial, pesquisa
a chave já persistida e executa a ação no resultado da consulta. Recuperação e
cancelamento ativos para a mesma nota são mutuamente exclusivos.

O clique em Confirmar é uma fronteira irreversível. Somente a mensagem
`Evento registrado e vinculado a NF-e`, encontrada na resposta já exibida pela
SPA, permite a
transição atômica da fila para `CONCLUIDO` e da nota para `CANCELADA`. Ausência
de prova após o clique produz `AGUARDANDO_CONFERENCIA`, sem retry automático.
Erros explícitos do portal são exibidos de forma sanitizada; nenhum prazo legal
é codificado localmente. Antes do clique, o Worker lê a situação da única linha;
se já estiver `Cancelada`, reconcilia o resultado sem reenviar a operação.

A consulta exige a rota exata `/nfae/produtor/consulta`. Abrir o formulário de
cancelamento pode mudar legitimamente o caminho da SPA; nessa etapa, a defesa
revalida HTTPS, porta e host exato do ambiente e exige o formulário/botão
esperados. Falha antes de iniciar o clique é `ERRO` com código
`CANCELAMENTO_NAO_ENVIADO` e pode ser corrigida sem fingir incerteza. A partir
do início do clique, falha de transporte ou ausência da prova oficial continua
incerta e nunca volta à fila automaticamente.

Uma linha em `AGUARDANDO_CONFERENCIA` só pode voltar a `PENDENTE` por ação
explícita no Web: o operador declara que consultou a Receita e viu a nota como
Autorizada. Isso não substitui a defesa do Worker, que consulta novamente a
situação antes do efeito fiscal e não reenvia se já estiver Cancelada.
Destaques:

- `0001`: relação N:N e emitente por distribuição/tarefa;
- `0002`–`0006`: regras fiscais, lotes, credencial por referência,
  identificador NFP-e e numeração operacional;
- `0007`: tentativas, lease e reserva atômica;
- `0008`: idempotência, snapshot/hash, token de reserva, protocolo,
  unicidades e revogação de `EXECUTE` público;
- `0009`: correção do retorno `reserva_token` da função.
- `0010`: códigos de erro estruturados para orientação no Web;
- `0011`: lease e campos da limpeza física de documentos vencidos;
- `0012`: fila exclusiva e idempotente de recuperação por nota.
- `0013`: configuração operacional única da janela de novas emissões e
  `search_path` fixo na função de reserva.
- `0014`: remove acesso RPC anônimo das funções administrativas legadas do
  sistema de ponto, preservando usuários autenticados e a service role.

Tarefas antigas sem lote são inelegíveis deliberadamente; as observadas no
banco de teste já estão canceladas e permanecem apenas como histórico.

## Segurança

O Web possui sessão administrativa HMAC curta, bloqueio por inatividade,
proteção das Server Actions e cabeçalhos defensivos. É uma etapa inicial, não
uma solução multiusuário. Credenciais fiscais ficam no Worker e o Web guarda
somente uma referência. O banco do Worker deverá usar papel próprio com
privilégios mínimos; a URL do proprietário do Web não deve ir para a VM.

XML/DANFE são validados e salvos localmente com permissões restritas. Quando
`ARMAZENAR_DOCUMENTOS=true`, a autorização fiscal é registrada primeiro; em
seguida o Worker envia objetos imutáveis ao Supabase Storage e grava somente
os caminhos internos e a expiração. Caminhos usam UUID + SHA-256, sem nome de
cliente/emitente, e uma repetição só é aceita após comparar o conteúdo remoto.

O Web assina esses caminhos no servidor por cinco minutos. A chave secreta não
entra no bundle do navegador e o bucket permanece privado. Falha de upload não
reabre a emissão: a tarefa fica `EMITIDA`, com documentos pendentes. Antes de
enviar, o Worker grava em seu volume persistente um manifesto com tarefa,
token, caminhos locais e hashes. No ciclo seguinte, ele tenta recuperar esses
documentos antes de reservar qualquer tarefa nova; o manifesto só é removido
após a confirmação atômica no banco. A recuperação já foi validada ao vivo;
autorização multiempresa, alertas e uma prova formal de restauração continuam
pendentes. O piloto de produção só é liberado pelo checklist humano de
`PRODUCAO-FISCAL.md`.

Chaves atuais `sb_secret_` são enviadas ao Storage somente no cabeçalho
`apikey`; a compatibilidade com a `service_role` legada acrescenta o Bearer JWT.

### Retenção e limpeza de documentos

O binário XML/DANFE tem retenção operacional padrão de 30 dias; metadados da
nota nunca são removidos por essa política. A rotina opcional do Worker reserva
cada nota vencida usando `limpeza_reserva_token` e lease curto, com
`FOR UPDATE SKIP LOCKED`. Em seguida, exclui os dois objetos exclusivamente
pela Storage API e só então zera `pdf_path`, `xml_path` e expiração. Falha no
Storage ou no banco mantém/relibera a reserva sem apagar referências; uma nova
execução pode concluir de forma idempotente. A flag
`LIMPAR_DOCUMENTOS_EXPIRADOS` começa desabilitada e exige migration `0011`,
Storage privado, fonte banco e integração controlada.

### Recuperação histórica de documentos

A chave de acesso persistida em `fiscal.notas` é o identificador da consulta;
ela é extraída do XML autorizado, não do HTML. A recuperação é uma operação
idempotente e separada da tarefa de emissão: consultar nunca deve alterar
uma tarefa para `PENDENTE` nem executar `emitir()`.

O primeiro trecho já existe em `worker/src/flows/consulta.py` e `src/auth.py`:
abre somente a Consulta - TESTE por HTTPS e seleciona o emitente original pelo
`valor_select_nfpe`. A pesquisa por chave e a presença de um único resultado
com XML/DANFE foram validadas ao vivo. O gate local baixa primeiro o XML,
compara chave e número com a nota solicitada e só então permite o DANFE; uma
falha remove os artefatos daquela tentativa.

`fiscal.recuperacoes_documentos` mantém uma linha reutilizável por nota, com
estados `PENDENTE`, `PROCESSANDO`, `CONCLUIDA` e `ERRO`, lease e token próprios.
O Worker limpa primeiro o par vencido, reserva a recuperação com `SKIP LOCKED`,
usa o snapshot imutável da emissão para resolver emitente/credencial, consulta
pela chave, valida o XML antes do DANFE e envia o par ao Storage. O Web só volta
a assinar os dois caminhos após a conclusão atômica. Documentos recuperados
expiram em 7 dias; documentos da emissão original continuam em 30 dias.

### Estado da tarefa versus estado fiscal da nota

`fiscal.tarefas.status` descreve a execução da emissão e permanece como
histórico operacional. `fiscal.notas.status` descreve a situação fiscal do
documento depois de emitido. Portanto, cancelar uma nota não desfaz a tarefa:
o Worker atualiza somente `notas.status = CANCELADA` e conclui a linha de
`cancelamentos_fiscais`, atomicamente e apenas após a prova oficial no portal.

O Web usa essa separação em `/notas`: a visão principal contém estados fiscais
não cancelados e a aba `Canceladas` contém somente `notas.status = CANCELADA`,
preservando lote, tarefa original, chave, protocolo, número e referências dos
documentos. Os relatórios atuais continuam operacionais e medem o trabalho da
tarefa/distribuição; o futuro módulo financeiro deverá consultar também o
estado da nota para excluir efeitos fiscais cancelados de cálculos financeiros.

### Integridade de campos numéricos mascarados

Quantidade e valor unitário não são preenchidos por atribuição textual bruta.
A máscara da SPA podia interpretar o `.0` de floats inteiros como outro dígito.
O Worker usa representação decimal brasileira, eventos equivalentes à
digitação humana e valida o `input_value()` após o blur. A etapa fiscal não
avança quando o número observado diverge do snapshot da tarefa.

## Implantação proposta

- Web: Vercel, com raiz do projeto em `web/` e preflight de variáveis antes do
  build;
- PostgreSQL/Storage: serviço gerenciado;
- Worker: container persistente em VM Linux (Oracle implantada no piloto,
  conforme histórico do HANDOFF), com a imagem oficial do Playwright fixada na mesma
  versão da biblioteca Python.

O container usa filesystem raiz somente leitura, capabilities removidas,
`no-new-privileges`, volumes separados para logs/downloads e healthcheck local
sem dados fiscais. A saída padrão do Docker tem rotação limitada para não
esgotar o disco da VM. O serviço audita o papel PostgreSQL antes de iniciar e só
aceita `WORKER_PERSISTENTE=true` quando está headless, sem Inspector ou pausa,
com fila processada, Storage, concorrência explícita e todas as travas do
ambiente fiscal escolhido. Em produção, a solicitação humana no Web continua
sendo a origem obrigatória do trabalho.

O polling persistente reutiliza o mesmo contrato/reserva já testado e omite a
mensagem repetitiva de fila vazia. O processo opera 24 horas, porém separa os
trabalhos por política: limpeza, recuperação de upload e recuperação histórica
podem rodar em qualquer ciclo; a reserva de novas emissões só ocorre na janela
configurável no Web e persistida no banco, por padrão `00:00–06:00` em
`America/Sao_Paulo`. Fora dela, somente um lote já iniciado pode fornecer sua
próxima tarefa; lotes inteiramente novos permanecem bloqueados. A base `tzdata` é fixada para
que essa decisão seja determinística no Windows, Linux e container. Execuções
manuais continuam explícitas e não herdam silenciosamente o agendamento do
serviço. Todas as tarefas pendentes do lote iniciado continuam em sequência,
mesmo depois do corte; a
VM nunca é desligada pela janela e lê alterações no ciclo seguinte. Manter uma
conexão/fila durável e alertas externos são melhorias
posteriores; o primeiro piloto pode operar com polling curto e supervisionado.

O serviço solicita explicitamente `sinalizar_trabalho_concluido=True`: o retorno
interno 2 indica emissão concluída e dispara outro ciclo imediatamente, com nova
verificação da janela e reserva normal ou de continuação. Retorno 0 indica ciclo sem emissão e
mantém polling; 1 mantém backoff. Execuções avulsas preservam códigos 0/1.
Cada tarefa continua usando contexto independente e as falhas não são
reenfileiradas automaticamente por essa otimização.

Consulte `DEPLOYMENT.md`, `SECURITY.md`, `CONTRATO-WEB-WORKER.md` e
`ROADMAP.md` para os gates operacionais.

### Destino fiscal dentro de uma distribuição

A unidade operacional usada para montar uma nota é o par `cliente + emitente`,
chamado na interface de destino fiscal. Um lote pode conter mais de um destino
para o mesmo cliente, desde que os emitentes sejam diferentes. Cada par gera
uma tarefa fiscal independente; produtos diferentes destinados ao mesmo par no
mesmo lote são agrupados na mesma tarefa. A relação precisa existir em
`cliente_emitentes`, e cliente e emitente devem estar ativos e completos.
