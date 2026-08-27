# Arquitetura — NF Distribuição

## Visão geral

```text
Web Next.js → PostgreSQL/fila → Worker Playwright → Receita PR
        ↑         status/nota/metadados         ↓
        └────────── documentos (Storage futuro) ┘
```

<<<<<<< HEAD
O Web é a interface operacional. O banco é a fonte de verdade e separa os
processos. O Worker é persistente e pode rodar em outra máquina/rede. Ele não
deve executar dentro de uma função Vercel.

## Web e domínio

O Web mantém emitentes, clientes, produtos, regras fiscais, preços,
distribuições, lotes, tarefas e notas. Cliente ↔ emitente é N:N e a seleção é
gravada na tarefa. O preço padrão é produto + cliente. Regras fiscais são
reutilizáveis, associadas ao produto e preservadas no item da tarefa.

Cada envio de distribuição cria um lote idempotente, numerado e usado também
como recorte do roteiro do motorista. A Server Action valida tamanho, UUIDs,
cadastros fiscais e relações antes de gravar tudo em transação.

Ao final da transação cada tarefa recebe, no mesmo comando:

- `contrato_versao=1`;
- `payload_worker` JSONB imutável;
- `payload_hash` SHA-256 da representação JSONB persistida.

Isso impede que uma mudança posterior de cadastro altere silenciosamente uma
tarefa fiscal já preparada.
=======
A aplicação web cadastra emitentes, clientes, produtos e distribuições. Ela gera tarefas de emissão; o Worker é responsável por executá-las no sistema fiscal. A integração automática entre as duas partes ainda não foi ligada: hoje o Worker recebe um JSON local de demonstração, com dados fiscais hardcoded.
>>>>>>> bb1f369fe5684487fbfe4bd6b69e53ede982c47d

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

<<<<<<< HEAD
### Modos da fonte banco
=======
`src/auth.py` e `src/flows/emissao.py` já usam API Async. No ambiente de
homologação, foi validado ao vivo o preenchimento até Transporte para um e
dois produtos; Resumo, Emitir e os botões XML/DANFE foram reconhecidos
manualmente. Por padrão o Worker para antes de **Emitir**. O ponto de entrada
possui uma exceção de teste explícita que exige homologação, navegador visível,
nova validação da URL imediatamente antes do clique. Vários clientes de teste
são permitidos até o teto de três contextos, com `MAX_CONCORRENCIA=3`.
>>>>>>> bb1f369fe5684487fbfe4bd6b69e53ede982c47d

1. **Ensaio sem navegador:** reserva, valida e devolve a `PENDENTE`, limpando
   token/lease e restituindo a tentativa.
2. **Homologação processada:** sob todas as flags explícitas, executa
   reserva → Playwright → `EMITINDO` → XML `cStat=100` → registro transacional
   de nota e tarefa `EMITIDA`.

<<<<<<< HEAD
Contrato/hash/credencial inválidos vão para `AGUARDANDO_CONFERENCIA`. Lease
vencido ou incerteza depois do clique fiscal não volta automaticamente à fila.
=======
A autorização possui confirmação confiável por classe + texto antes dos
downloads. Ainda faltam o estado de rejeição, cancelamento, envio seguro de
PDF/XML ao Storage e a integração real com a fila. A emissão controlada está
pronta no código, mas ainda depende da validação ao vivo desta espera.

### Fila e idempotência

`0007_fila_worker_lease.sql` oferece a função atômica
`fiscal.reservar_tarefas_worker`. Ela usa bloqueio de linha e `SKIP LOCKED`,
de modo que Workers concorrentes recebem tarefas distintas. Uma tarefa ganha
`PROCESSANDO`, identificador da instância, expiração do lease e uma tentativa.
O adaptador `worker/src/fonte_tarefas.py` projeta a tarefa reservada no
contrato v1, mas ainda não abre o navegador automaticamente.

Por segurança fiscal, lease expirado não torna a tarefa elegível de novo: uma
queda pode ocorrer após a autorização e antes do retorno ao banco. Esse caso
sempre exige consulta/conferência antes de qualquer reemissão.

Para testes, há três níveis deliberadamente separados:

- login: exige apenas `CLIENTE_X_LOGIN` e `CLIENTE_X_SENHA`;
- navegação: usa as mesmas credenciais e respeita `AMBIENTE_EMISSAO`;
- preenchimento completo: exige também `CLIENTE_X_EMITENTE`, pois seleciona
  o emitente na tela NFP-e. Continua parando antes de **Emitir**.
- emissão controlada de homologação: exige todas as etapas anteriores,
  `TESTAR_EMISSAO_HOMOLOGACAO=true`, navegador visível e validação do host da
  Page. Nunca aceita o ambiente `normal`; múltiplos clientes exigem execução
  limitada a três contextos simultâneos.
>>>>>>> bb1f369fe5684487fbfe4bd6b69e53ede982c47d

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

<<<<<<< HEAD
As 8 tarefas antigas sem lote são inelegíveis deliberadamente.
=======
### Regra fiscal reutilizável

`regras_fiscais` concentra a tributação e os parâmetros operacionais comuns:
CFOP, ICMS, origem, benefício fiscal, natureza/tipo/finalidade, presença e
frete. Cada produto aponta para uma regra; o primeiro cadastro recebe a
regra ativa automaticamente quando só houver uma. `tarefa_itens` guarda a
referência usada na distribuição, preservando o contexto fiscal da tarefa.

As regras devem ser tratadas como imutáveis: para uma tributação futura,
criar outra regra e associá-la aos próximos produtos, nunca editar a regra de
uma tarefa já preparada.

### Lotes e roteiro de entrega

Cada ação concluída em Distribuição cria um `lotes_distribuicao`. As
disponibilidades e distribuições originadas naquela ação pertencem ao mesmo
lote. A página `/entregas` usa o lote para montar uma folha de motorista por
cliente, com endereço, produtos, quantidades e trocas, mas sem preço ou total
monetário. Como o motorista já conhece as rotas, o roteiro usa o CEP (e,
quando presente, o número) do cadastro existente; não cria campos extras de
endereço. O lote mais recente é aberto por padrão e pode ser impresso.

Cada lote recebe também um número operacional sequencial, visível como
`Distribuição 000001`. Novas tarefas guardam o `lote_id`, evitando que duas
rodadas do mesmo cliente no mesmo dia sejam fundidas. Esse número segue no
contrato Web → Worker e compõe os nomes de XML/DANFE, junto com o nome do
emissor. A migração `0006` está aplicada e conferida no banco de teste.

## Agendamento futuro
>>>>>>> bb1f369fe5684487fbfe4bd6b69e53ede982c47d

## Segurança

<<<<<<< HEAD
O Web possui sessão administrativa HMAC curta, bloqueio por inatividade,
proteção das Server Actions e cabeçalhos defensivos. É uma etapa inicial, não
uma solução multiusuário. Credenciais fiscais ficam no Worker e o Web guarda
somente uma referência. O banco do Worker deverá usar papel próprio com
privilégios mínimos; a URL do proprietário do Web não deve ir para a VM.

XML/DANFE são validados e salvos localmente com permissões restritas. Ainda
faltam Storage privado com URL assinada, política de retenção, autorização por
papéis/tenant, scheduler e alertas. Produção permanece bloqueada.

## Implantação proposta

- Web: Vercel ou serviço equivalente;
- PostgreSQL/Storage: serviço gerenciado;
- Worker: VM Linux persistente (Oracle é candidata para o piloto, ainda não
  implantada), com Chromium, scheduler, supervisão e diretório privado.

Consulte `DEPLOYMENT.md`, `SECURITY.md`, `CONTRATO-WEB-WORKER.md` e
`ROADMAP.md` para os gates operacionais.
=======
O plano de entrega detalhado e a ordem segura das fases estão em
`docs/ROADMAP.md`.

## Implantação proposta

O Web deverá rodar no Vercel para atender celular/tablet. O Worker fiscal não
deve rodar dentro da requisição do Web: ele precisa de um processo persistente
com navegador, agendamento e recuperação de falhas. A proposta inicial é uma
VM Linux (Oracle Cloud Always Free para o piloto, após prova de capacidade),
que consulta/reserva tarefas no banco. Detalhes e limites conhecidos em
`docs/DEPLOYMENT.md`.

## Segurança e operação

- Não colocar credenciais no código, logs, documentos ou commits.
- Não versionar `.env`.
- O Web guarda somente `emitentes.credencial_referencia`; login/senha fiscal
  são resolvidos no ambiente protegido do Worker. Colunas antigas permanecem
  apenas para migração do banco de teste e não são projetadas por Server Actions.
- Em produção, o Web fecha o acesso sem Basic Auth provisório configurado.
  Autenticação individual, autorização, menor privilégio e RLS ainda são
  requisitos anteriores à comercialização; ver `docs/SECURITY.md`.
- PDF/XML serão privados e entregues por URLs HTTPS assinadas e temporárias.
- Dados fiscais reais e emissão em produção exigem conferência humana até a fase de validação estar concluída.
- `INSPECIONAR`/`page.pause()` não pode bloquear execução headless.
- PDFs/XMLs e logs deverão retornar ao armazenamento da aplicação após a integração com o Worker.
>>>>>>> bb1f369fe5684487fbfe4bd6b69e53ede982c47d
