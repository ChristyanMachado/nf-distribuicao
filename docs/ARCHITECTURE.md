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

As migrações `0001`–`0009` estão ativas no banco de teste. Destaques:

- `0001`: relação N:N e emitente por distribuição/tarefa;
- `0002`–`0006`: regras fiscais, lotes, credencial por referência,
  identificador NFP-e e numeração operacional;
- `0007`: tentativas, lease e reserva atômica;
- `0008`: idempotência, snapshot/hash, token de reserva, protocolo,
  unicidades e revogação de `EXECUTE` público;
- `0009`: correção do retorno `reserva_token` da função.

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

## Implantação proposta

- Web: Vercel, com raiz do projeto em `web/` e preflight de variáveis antes do
  build;
- PostgreSQL/Storage: serviço gerenciado;
- Worker: container persistente em VM Linux (Oracle é candidata para o piloto,
  ainda não implantada), com a imagem oficial do Playwright fixada na mesma
  versão da biblioteca Python.

O container usa filesystem raiz somente leitura, capabilities removidas,
`no-new-privileges`, volumes separados para logs/downloads e healthcheck local
sem dados fiscais. O serviço audita o papel PostgreSQL antes de iniciar e só
aceita `WORKER_PERSISTENTE=true` quando está headless, sem Inspector ou pausa,
com fila processada, Storage, concorrência explícita e todas as travas de
homologação. Ele não amplia a autorização para produção.

O polling persistente reutiliza o mesmo contrato/reserva já testado e omite a
mensagem repetitiva de fila vazia. Manter uma conexão/fila durável e o
scheduler noturno continuam melhorias posteriores; o primeiro piloto pode
operar com polling curto e supervisionado.

Consulte `DEPLOYMENT.md`, `SECURITY.md`, `CONTRATO-WEB-WORKER.md` e
`ROADMAP.md` para os gates operacionais.
