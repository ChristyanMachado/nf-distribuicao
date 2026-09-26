# Plano de domínio — entrega agora, faturamento depois

Status: **regra operacional confirmada; base inerte em homologação, fechamento não implementado**.

## Primeiro incremento técnico (26/09/2026)

`0024_faturamento_diferido_base` cria `clientes.modo_faturamento` e o snapshot
`distribuicoes.modo_faturamento`, ambos `IMEDIATO` por padrão, além de
`saldos_faturamento` com quantidade total e alocada em milésimos. Foi aplicado
somente em homologação. A tabela está vazia; não existe tela para alterar a
política nem função de fechar saldos. O Web falha fechado se encontrar um
mercado `DIFERIDO`, para que nenhuma entrega seja registrada sem caminho de
faturamento. Não aplicar ou habilitar em produção antes do fluxo integral.

O saldo é **um por linha física**, mas uma linha poderá alimentar muitos
fechamentos por meio de uma futura tabela de alocações. Portanto, a chave
primária `distribuicao_id` do saldo não limita a divisão por projetos. O saldo
total deverá ser exatamente a `quantidade_faturavel`, excluindo trocas.
Nenhum ajuste da quantidade alocada foi concedido ao papel Web de QA nesta
fase; a transação de fechamento precisará estabelecer uma escrita controlada.

O histórico foi conferido: `b8d5746` adicionou este plano, não o fluxo. O
commit `6380de8` habilitou vários emitentes para um mercado no mesmo lote, mas
continua gerando notas imediatas, sem saldo entre distribuições.

## Problema de negócio

Alguns mercados recebem os produtos normalmente, mas a NFP-e é emitida dias ou
semanas depois. Uma entrega pode ser faturada em partes e uma nota pode reunir
partes de entregas distintas. Projeto/destino (por exemplo, escola ou município)
é uma dimensão da destinação, não um produto artificial.

O modelo atual não representa isso: `processarDistribuicao` grava a quantidade
física e cria, na mesma transação, uma tarefa fiscal por lote + mercado +
emitente. `distribuicoes.emitente_id` é obrigatório; `tarefa_itens` não aponta
para a linha física de origem; cada tarefa possui um único `lote_id`. O roteiro
registra o planejado, mas ainda não confirma que a entrega ocorreu.

## Decisão de arquitetura proposta

Preservar o fluxo imediato atual e adicionar, no futuro, uma política explícita
de faturamento por mercado:

- **imediato**: permanece exatamente como hoje;
- **diferido/manual**: a distribuição registra a quantidade física e o saldo
  faturável, sem criar tarefa fiscal;
- **fechamento posterior**: o operador seleciona parcelas do saldo, projeto ou
  destino e emitente, confere o resumo e então cria a tarefa fiscal.

Uma tabela aditiva de alocações deverá ligar cada item fiscal às linhas de
distribuição de origem. Essa relação N:N permite uma entrega em várias notas e
uma nota com várias entregas sem perder rastreabilidade.

## Invariantes obrigatórias

1. A soma reservada/faturada de uma linha nunca ultrapassa sua
   `quantidade_faturavel`; toda conta usa milésimos.
2. Troca/reposição nunca entra no saldo faturável.
3. Fechamentos são idempotentes e executados sob transação e bloqueio das
   origens selecionadas.
4. Preço, regra fiscal, emitente e dados fiscais usados na emissão ficam em
   snapshot imutável.
5. Resultado fiscal incerto não devolve saldo automaticamente.
6. Cancelar uma nota não cancela a entrega. Reabrir saldo exige operação
   explícita, auditável e coerente com a regra fiscal.
7. Relatórios separam data da distribuição física da data da emissão fiscal.

## Decisões que ainda dependem do cliente

O vídeo do cliente e a confirmação do operador em 25/09/2026 resolveram:

1. O saldo torna-se disponível ao **registrar a distribuição no Web**; não
   depende de confirmação posterior do motorista. Isso representa uma decisão
   operacional, não prova física de entrega.
2. Projeto pode ser atribuído no **fechamento posterior**. Partes do mesmo
   produto/entrega podem ir para projetos diferentes, inclusive fechados em
   dias distintos. Não criar produtos artificiais para representar projetos.
3. Projeto não muda o destinatário fiscal; ele determina **notas separadas**.
   O fechamento pode selecionar só alguns produtos/quantidades elegíveis.
4. O preço da entrega original é a sugestão inicial, mas o operador pode
   conferir e alterá-lo antes de confirmar o fechamento. O valor efetivamente
   usado deve ficar no snapshot fiscal sem reescrever a entrega.
5. O operador escolhe o emitente no fechamento. A distribuição física não
   deve criar tarefa fiscal para mercados com política diferida/manual.
6. A política deve ser configurável por mercado, não codificada pelo nome
   "Cooperativa". Mercados imediatos continuam no fluxo atual.

Invariantes de agrupamento para o desenho técnico: uma nota tem um único
destinatário e emitente; projeto diferente gera nota diferente. O operador
fecha quantidades explícitas; nenhuma parcela pode aparecer em duas notas.
Preço diferente para o mesmo produto no mesmo fechamento deve continuar
rastreável por parcela/snapshot, sem fusão silenciosa.

Pontos a validar em homologação antes de produção: como exibir a regra fiscal
de um produto alterada entre entrega e fechamento; como a Receita reage a duas
linhas do mesmo produto com preços diferentes; qual evento operacional indica
que o usuário pode marcar uma entrega registrada como não realizada. Não
inventar reversão automática de saldo nem prazo fiscal.

## Acoplamentos de código identificados

- `distribuicoes.emitente_id` é obrigatório hoje, embora o emitente diferido
  só seja escolhido no fechamento. A migração precisará representar ambos os
  casos sem afetar linhas imediatas existentes.
- `processarDistribuicao` hoje cria `tarefa_itens` e `tarefas` no mesmo lote.
  Para mercado diferido, deve salvar a linha física e o saldo faturável sem
  criar tarefa; para mercado imediato, não alterar a semântica atual.
- `reservar_tarefas_worker` e o índice da fila exigem `lote_id IS NOT NULL`;
  `gerarContratoTarefaPendente` faz `INNER JOIN` com lote. Fechamentos de
  múltiplas distribuições exigem uma origem fiscal própria (`fechamento_id`)
  nesses contratos e na reserva, sem inventar um lote de entrega artificial.
- Notas, Tarefas, relatórios e impressão hoje agrupam por `lote_id`; devem
  separar entrega física de fechamento fiscal para não duplicar indicadores.
- Alocação por origem precisa de bloqueio transacional e idempotência. Mesmo
  se houver falha fiscal incerta, não devolver saldo automaticamente.

## Sequência futura

1. Confirmar as decisões acima com exemplos reais do cliente.
2. Criar migration somente aditiva para política por mercado, snapshot da
   política e livro de saldos/alocações.
3. Criar fechamento manual com preview, idempotência e travas de concorrência.
4. Gerar o contrato fiscal somente depois da confirmação do fechamento.
5. Adaptar Notas, Tarefas, relatórios e impressão automática para múltiplas
   origens.
6. Validar em homologação cenários integral, parcial, múltiplas entregas,
   concorrência, falha incerta, cancelamento e reemissão.

## Referências conceituais

- Odoo documenta faturamento pela quantidade entregue, mantendo quantidades
  entregues e faturadas separadas e admitindo atendimento parcial:
  <https://www.odoo.com/documentation/master/applications/sales/sales/invoicing/invoicing_policy.html>
- ERPNext separa entrega e faturamento e mantém saldos parcialmente atendidos:
  <https://docs.frappe.io/erpnext/selling>

Esses produtos servem apenas como evidência do domínio. O NF Distribuição não
deve copiar seus módulos nem absorver Estoque ou Financeiro.
