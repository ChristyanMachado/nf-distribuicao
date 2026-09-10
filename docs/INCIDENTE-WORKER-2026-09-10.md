# Incidente e contingência local — 10/09/2026

## Evidências e autorização

SSH da VM 193.123.122.46 expirou na porta 22; causa da indisponibilidade ainda
não confirmada. Timeout não prova desligamento nem retomada pela Oracle.
Responsável sem acesso ao painel pediu execução local e autorizou explicitamente
as três tarefas reais do lote 7, com isolamento prévio da VM.

Antes da contingência: três tarefas PENDENTE, zero tentativas, nenhum início;
nenhuma tarefa PROCESSANDO/EMITINDO. Lote 6 tinha três tarefas CANCELADA antes
de emissão, não três notas canceladas. Janela consultada era 00–10h, alterada
às 05:18 locais; não permite inferir qual era a configuração durante a madrugada.
Não há prova de que as melhorias locais causaram a indisponibilidade: Web remoto
consultado ainda em 7e6c318; versão efetiva da VM inacessível não foi confirmada.

## Isolamento aplicado em produção

- Migration operacional `contingencia_local_isolar_login_worker_vm` aplicou
  somente `ALTER ROLE nf_worker_vm NOLOGIN`; senha e grants preservados.
- Busca de sessões para encerramento retornou zero; verificação posterior:
  login desabilitado, zero sessões VM, zero tarefas ativas e três pendentes.
- Não reabilitar automaticamente a VM durante a contingência. Para devolver
  operação à VM: encerrar execução local, conferir estados fiscais/filas e
  saúde da VM, e somente então restaurar `ALTER ROLE nf_worker_vm LOGIN`.
- Não houve alteração de snapshots, valores, fila por reenfileiramento,
  configuração Web, janela, schema do Ponto ou deploy.

## Executor local

`worker/scripts/executar_lote_local.py` é ferramenta avulsa supervisionada,
não substitui o serviço. Por padrão faz apenas leitura de três tarefas explícitas:
exige mesmo lote, PENDENTE, tentativa zero, hash íntegro e credencial compatível.
`--executar` habilita os efeitos reais já autorizados. Usa exclusivamente o papel
local, concorrência 1, fluxo fiscal existente e Storage privado. Cancelamentos,
limpeza, consulta histórica e serviço persistente ficam desligados.

Antes de cada reserva exige VM NOLOGIN/sem sessões e nenhuma tarefa ativa.
Reserva pela função existente dentro de transação: tarefa fora dos três IDs
autorizados causa rollback. Para na primeira falha, sem repetição automática.
Não altera os arquivos `.env`; logs e downloads em subpastas privadas ignoradas.
Falhas com resultado fiscal incerto mantêm o comportamento conservador existente.

279 testes existentes passaram após usar pasta temporária nova (a anterior tinha
erro de permissão); cinco testes de seleção passaram. Chromium local abriu sem
portal; pré-checagem real dos três snapshots/credenciais passou sem reserva.
Auditoria do papel local identificou ausência de permissões de configuração e
cancelamento: não ampliadas porque essas funções não participam da contingência.

## Resultado

Execução de 06:52:35 a 06:53:45 -03:00, encerrada com código zero. Consulta
independente ao banco confirmou três tarefas DOCUMENTOS_ARMAZENADOS, todas
com uma tentativa, três notas AUTORIZADA e ambos os caminhos XML/PDF presentes.
Logs confirmaram validação e armazenamento privado dos documentos. Não houve
repetição, cancelamento nem emissão fora do lote autorizado.

O bloqueio do login da VM permanece ativo e precisa constar de qualquer handoff.
O executor local terminou: não há serviço local agendado para próximos lotes.
Não considerar a confiabilidade da madrugada resolvida pela contingência:
recuperar acesso/diagnosticar VM e definir monitoramento externo são próximos passos.
