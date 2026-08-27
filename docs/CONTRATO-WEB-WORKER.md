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

## Estado de integração

O pipeline já está ligado ao `main.py` atrás de flags explícitas. Canal TLS e
reserva vazia foram confirmados no banco real de teste. Ainda faltam: criar a
primeira tarefa elegível, executar o round-trip completo em homologação,
Storage privado, scheduler e implantação com papel dedicado.
