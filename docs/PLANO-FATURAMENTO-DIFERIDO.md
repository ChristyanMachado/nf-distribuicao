# Plano de domínio — entrega agora, faturamento depois

Status: **investigação concluída; não implementar sem confirmar as decisões abertas**.

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

1. Em qual evento o planejado passa a ser considerado efetivamente entregue?
2. O projeto/destino já é conhecido na distribuição ou apenas no fechamento?
3. Projeto/destino altera destinatário ou qualquer informação da NFP-e?
4. Qual preço e regra fiscal valem quando entregas antigas são fechadas?
5. O emitente é escolhido por parcela, projeto, fechamento ou nota?
6. Quais combinações de projeto, preço, emitente e período podem compartilhar
   uma mesma nota?

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
