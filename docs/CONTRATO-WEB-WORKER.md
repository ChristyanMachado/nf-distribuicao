# Contrato Web → Worker

## Fonte de verdade

O Web cria o contrato v1 e o persiste na própria tarefa:

- `contrato_versao = 1`;
- `payload_worker` JSONB;
- `payload_hash` SHA-256 do texto JSONB armazenado.

Os três campos são gravados juntos na transação da distribuição. O Worker não
reconstrói a tarefa a partir de cadastros mutáveis: lê e verifica o snapshot.

## Conteúdo do payload v1

O payload contém apenas dados necessários à homologação: IDs UUID da tarefa,
cliente e emitente; ambiente `teste`; referência de credencial; identificador
do emitente no NFP-e; nome do cliente/emitente; número do lote; destinatário;
itens, quantidades, preços e snapshot da regra fiscal; modalidade de frete.

Senha/login fiscal nunca entram no payload. A referência é resolvida no
ambiente protegido do Worker.

## Produção e idempotência

- `lotes_distribuicao.chave_idempotencia` impede duplo envio do formulário.
- Uma tarefa por lote + cliente + emitente agrega seus itens.
- `payload_worker` torna-se imutável depois de completo.
- O hash é verificado antes de abrir o navegador.
- Chave de acesso e relação nota/tarefa possuem unicidade no banco.

## Elegibilidade e reserva

Uma tarefa é elegível somente quando está `PENDENTE`, possui lote,
`contrato_versao=1`, payload e hash completos, não está reservada e respeita o
limite de tentativas.

`fiscal.reservar_tarefas_worker(worker_id, limite, lease_segundos)` usa bloqueio
de linha + `SKIP LOCKED`, marca `PROCESSANDO` e retorna:

- `tarefa_id`;
- `reserva_token` UUID exclusivo.

Lease permitido: 60–3600 segundos. Renovação e transições exigem Worker, token
e lease vigentes. `EXECUTE` de `PUBLIC` foi revogado; a implantação deve
conceder apenas ao papel dedicado do Worker.

Fora da janela, `FontePostgresTarefas.reservar_continuacao_lote` faz uma
reserva parametrizada e transacional, limitada ao lote mais antigo que já
possua tarefa iniciada. Seleção e mudança para `PROCESSANDO` usam o mesmo
bloqueio: o corte impede lotes novos sem deixar uma distribuição pela metade.

## Estados e transições

```text
PENDENTE
  └─ reserva → PROCESSANDO
       ├─ ensaio validado → PENDENTE
       ├─ contrato/hash/credencial inválido → AGUARDANDO_CONFERENCIA
       ├─ início do clique fiscal → EMITINDO
       ├─ XML cStat=100 → EMITIDA + nota
       └─ resultado incerto/lease perdido → AGUARDANDO_CONFERENCIA
```

No ensaio sem navegador, a devolução limpa lease/token e restitui a tentativa.
Mensagem de erro é sanitizada, limitada a 300 caracteres e não aceita quebra
de linha. Resultado incerto nunca ganha retry automático.

## APIs do adaptador Worker

`worker/src/fonte_tarefas.py` é responsável por:

- abrir pool async PostgreSQL com TLS obrigatório;
- reservar e carregar snapshots;
- verificar SHA-256 e validar o contrato;
- renovar lease;
- devolver ensaio a `PENDENTE`;
- marcar conferência/erro com token fencing;
- marcar `EMITINDO` imediatamente antes do clique;
- registrar nota e tarefa autorizada na mesma transação.

## Prova fiscal

Sucesso não depende apenas de texto na página. O XML baixado deve ser NF-e
bem-formada e conter chave de 44 dígitos, número, protocolo e `cStat=100`.
Esses metadados são persistidos sem expor o conteúdo em log. O PDF deve ter
assinatura `%PDF-`.

## Cancelamento de nota autorizada

`fiscal.cancelamentos_fiscais` é uma fila separada e mantém uma linha por nota.
A Web valida sessão, UUID, estado `AUTORIZADA`, chave com 44 dígitos e motivo de
1–255 caracteres antes de inserir. Recuperação e cancelamento ativos para a
mesma nota são mutuamente exclusivos.

O Worker reserva com `FOR UPDATE ... SKIP LOCKED`, token e lease; verifica o
mesmo snapshot/hash da emissão e reutiliza somente autenticação, navegação de
consulta, emitente e pesquisa por chave. Depois do clique em Confirmar, sucesso
exige reload e o texto `Evento registrado e vinculado a NF-e`. Só então nota e
fila mudam atomicamente para `CANCELADA`/`CONCLUIDO`. Interrupção a partir do
clique produz `AGUARDANDO_CONFERENCIA`; ela não é reenfileirada. Uma recusa
explícita do portal vira `ERRO` orientado, sem prazo legal fixo codificado.

A conclusão não modifica `fiscal.tarefas`: a tarefa continua registrando que a
emissão foi concluída, enquanto `fiscal.notas.status = CANCELADA` representa o
evento fiscal posterior. Número, chave, protocolo, lote e caminhos dos
documentos não são apagados. Essa independência evita falsificar o histórico
operacional e permite consultar a nota cancelada posteriormente.

## Estado de integração

O pipeline já está ligado ao `main.py` atrás de flags explícitas. Canal TLS e
reserva vazia foram confirmados no banco real de teste. Ainda faltam: criar a
primeira tarefa elegível, executar o round-trip completo em homologação,
Storage privado, scheduler e implantação com papel dedicado.
