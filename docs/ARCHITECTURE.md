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

### Modos da fonte banco

1. **Ensaio sem navegador:** reserva, valida e devolve a `PENDENTE`, limpando
   token/lease e restituindo a tentativa.
2. **Homologação processada:** sob todas as flags explícitas, executa
   reserva → Playwright → `EMITINDO` → XML `cStat=100` → registro transacional
   de nota e tarefa `EMITIDA`.

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

- `AMBIENTE_EMISSAO=teste`;
- host HTTPS exato `homologacao.nfae.fazenda.pr.gov.br` revalidado no clique;
- `HEADLESS=false` para o ensaio humano;
- navegação, preenchimento e emissão exigem flags separadas;
- banco exige `TESTAR_INTEGRACAO_BANCO`, URL TLS e `WORKER_ID`;
- `PROCESSAR_FILA_BANCO` exige todas as travas anteriores;
- primeiro ensaio conectado usa concorrência 1; teto técnico atual é 3.

## Persistência e migrações

As migrações `0001`–`0013` estão ativas no banco de teste.
A `0014` permanece adiada por decisão explícita do responsável.
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
após a confirmação atômica no banco. Ainda faltam validar a recuperação ao vivo,
autorização por papéis/tenant, scheduler e alertas. Produção permanece bloqueada.

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
- Worker: container persistente em VM Linux (Oracle é candidata para o piloto,
  ainda não implantada), com a imagem oficial do Playwright fixada na mesma
  versão da biblioteca Python.

O container usa filesystem raiz somente leitura, capabilities removidas,
`no-new-privileges`, volumes separados para logs/downloads e healthcheck local
sem dados fiscais. A saída padrão do Docker tem rotação limitada para não
esgotar o disco da VM. O serviço audita o papel PostgreSQL antes de iniciar e só
aceita `WORKER_PERSISTENTE=true` quando está headless, sem Inspector ou pausa,
com fila processada, Storage, concorrência explícita e todas as travas de
homologação. Ele não amplia a autorização para produção.

O polling persistente reutiliza o mesmo contrato/reserva já testado e omite a
mensagem repetitiva de fila vazia. O processo opera 24 horas, porém separa os
trabalhos por política: limpeza, recuperação de upload e recuperação histórica
podem rodar em qualquer ciclo; a reserva de novas emissões só ocorre na janela
configurável no Web e persistida no banco, por padrão `00:00–06:00` em
`America/Sao_Paulo`. Fora dela, a
função retorna antes de reservar `fiscal.tarefas`. A base `tzdata` é fixada para
que essa decisão seja determinística no Windows, Linux e container. Execuções
manuais continuam explícitas e não herdam silenciosamente o agendamento do
serviço. Uma tarefa já reservada continua até o fim, mesmo depois do corte; a
VM nunca é desligada pela janela e lê alterações no ciclo seguinte. Manter uma
conexão/fila durável e alertas externos são melhorias
posteriores; o primeiro piloto pode operar com polling curto e supervisionado.

Consulte `DEPLOYMENT.md`, `SECURITY.md`, `CONTRATO-WEB-WORKER.md` e
`ROADMAP.md` para os gates operacionais.
