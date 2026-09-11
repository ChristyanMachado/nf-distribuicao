# Contingência local — lote 9 — 11/09/2026

O responsável solicitou emissão imediata pela versão anterior, antes de continuar
a evolução dos executores, reaproveitando os logins já configurados.

## Preparação e limites

- Pacote existente em `dist/graalyst-worker-local`: todos os arquivos Python
  comparados com a revisão `dda2227` usando os filtros de texto do Git; nenhuma
  divergência. Código coordenado em desenvolvimento não participou da execução.
- Reutilizados o Python 3.13.7/dependências da `.venv` e o arquivo privado
  `worker/.env`, por referência absoluta. Não copiar, imprimir ou redigitar segredos.
- Banco confirmou VM NOLOGIN, zero sessões da VM, zero emissões/cancelamentos/
  recuperações ativas e ausência da migration coordenada em produção.
- Único lote pendente: 9, quatro tarefas PENDENTE, tentativa zero. Pré-checagem
  confirmou hashes dos snapshots e correspondência das credenciais, sem reserva.
- Verificação das pastas anteriores não encontrou manifestos de upload pendente.
- Execução limitada aos quatro IDs consultados, com trava global, concorrência 1,
  parada na primeira falha e sem retry. Sem cancelamentos, limpeza, recuperação
  histórica, serviço persistente ou alteração da janela operacional.

## Resultado confirmado

O processo terminou com código zero. Logs locais de 06:10:34 a 06:12:21 -03:00
registram quatro autorizações e associação de documentos. Consulta independente
ao banco confirmou:

- quatro tarefas `DOCUMENTOS_ARMAZENADOS`;
- quatro notas `AUTORIZADA`;
- quatro pares PDF/XML presentes;
- uma tentativa por tarefa.

O processo local encerrou e não deixou agendamento. O responsável pode imprimir
pela página Notas, lote 9; impressão física não foi executada nem verificada.
Há aproximadamente 15 segundos de diferença absoluta entre os timestamps dos
logs locais e os do banco nesta execução; preservar ambos e não misturar relógios
ao investigar eventos. Nenhum número histórico foi corrigido artificialmente.

## Continuidade

A VM continua isolada; a contingência não restaura sua disponibilidade noturna.
Não reabilitar o papel remoto sem um handoff explícito e verificação de saúde.
A configuração privada e o código anterior foram preservados. A revisão dos
executores coordenados continua separada, sem promoção fiscal automática.
