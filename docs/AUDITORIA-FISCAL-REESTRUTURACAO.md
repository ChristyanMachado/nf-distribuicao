# Auditoria Fiscal e Financeiro — análise para reestruturação

**Data da análise:** 06/09/2026  
**Escopo:** entender o Auditor legado, confrontá-lo com o sistema atual de Distribuição/NF-e, pesquisar referências open source e definir a base para uma futura implementação.  
**Estado:** análise e documentação; nenhuma alteração funcional, migration, publicação ou escrita de dados foi feita.

## Conclusão executiva

O repositório legado `F:\.Faculdade\Projetos Pessoais\Auditor` chegou a um MVP operacional de acompanhamento de recebíveis: importa DANFE/relatórios em PDF e XML, aplica regras comerciais por cliente, calcula previsão e valor líquido, mostra lotes por cliente e tenta conciliar recebimentos OFX por valor, documento e data.

Ele ainda não é um sistema financeiro completo. Não possui razão contábil, contas bancárias, identificador de transação, pagamentos parciais, contas a pagar, despesas, custos, impostos provisionados, estornos, trilha de auditoria ou fechamento. A conciliação não está comprovada pelos dados locais: o banco de teste observado tinha 313 notas, 37 lotes e todas as 313 em `Pendente`.

O sistema atual mudou a fonte primária do domínio fiscal. A Distribuição cria lotes, tarefas e snapshots imutáveis; o Worker autoriza a nota; `fiscal.notas` guarda chave, protocolo, status, valor e documentos. Portanto:

- notas produzidas pelo fluxo atual devem ser a origem fiscal do Financeiro;
- autorização da nota não significa recebimento;
- valores de distribuição são valores brutos/comprometidos, não caixa disponível;
- PDF/XML devem servir para validação, recuperação e backfill controlado, não para duplicar notas já presentes no schema `fiscal`;
- regras comerciais do legado podem orientar o desenho, mas não devem continuar como código hardcoded por documento.

A direção registrada nas reuniões permanece válida: Financeiro em repositório próprio, com hub futuro e permissões próprias, podendo usar o mesmo projeto PostgreSQL sem compartilhar escrita irrestrita. Nesta etapa, a recomendação é construir primeiro um contrato de leitura entre Financeiro e Fiscal e só depois adicionar lançamentos financeiros.

## O que foi encontrado no Auditor legado

### Estrutura e fluxo

| Área | Evidência encontrada | Maturidade observada |
|---|---|---|
| Interface | `app.py` com abas Importar Dados, Auditoria/Recebimentos e Gerenciar Clientes | MVP funcional, mas concentrado em um arquivo |
| Domínio | `src/core/nota_fiscal.py` com `NotaFiscal` imutável | Modelo mínimo de nota, sem identidade fiscal completa |
| Importação | `parser.py`, `importador.py`: DANFE, relatório consolidado e XML | Vários formatos, validação irregular e sem registro de origem |
| Regras | `rules.py`: previsão, lote nominal e valor líquido por documento do cliente | Conceito útil; implementação frágil e hardcoded |
| Banco | SQLite local com `clientes` e `notas_fiscais` | Persistência suficiente para protótipo, insuficiente para multiusuário/auditoria |
| Conciliação | `auditor.py`: OFX positivo, match exato do lote e fallback FIFO de sete dias | Primeiro experimento de reconciliação; sem idempotência ou revisão humana |
| Testes | Não há suíte de testes no repositório legado | Comportamento depende de dados e ensaio manual |

### O que o legado pretendia resolver

1. Transformar documentos fiscais recebidos em registros estruturados.
2. Identificar clientes por documento e permitir nome operacional.
3. Aplicar acordos de prazo e descontos por cliente.
4. Agrupar notas em lotes de recebimento.
5. Conferir recebimentos bancários contra valores previstos.
6. Exibir rapidamente o que está pago, pendente ou atrasado.

Esses objetivos continuam relevantes, mas precisam ser separados em fatos diferentes: emissão fiscal, obrigação de recebimento, transação bancária, alocação do pagamento e saldo projetado.

### O que faz sentido preservar como conceito

- importação de OFX como uma das entradas de movimentação bancária;
- normalização de documento e identificação do cliente;
- previsão de recebimento baseada em regras versionadas;
- agrupamento por cliente, lote e período;
- match automático seguido de revisão para exceções;
- nome operacional separado da razão social;
- visão compacta de pendências e alertas.

### O que não deve ser preservado como implementação

- valores monetários em `float`/`REAL`;
- regras de prazo e desconto embutidas em condicionais por CNPJ;
- nomes de lotes como chave de negócio;
- `status_pagamento` textual único para todos os casos;
- conciliação sem identificador da transação, hash do arquivo e idempotência;
- atualização direta de notas ao importar OFX;
- parsing de PDF como fonte fiscal quando já existe `fiscal.notas`;
- API externa de cadastro misturada com a transação de persistência;
- dados e caminhos relativos ao diretório de execução;
- qualquer cópia literal do código legado antes de resolver licença, testes e contrato.

## Limitações e riscos concretos observados

### Modelo monetário e fiscal

O legado usa `REAL`/`float`, inclusive para somas e descontos. Isso não é adequado para valores financeiros. O novo módulo deve usar `numeric`/decimal ou unidades inteiras de menor valor, com política explícita de arredondamento.

O campo chamado `valor_liquido` é calculado a partir de taxas comerciais presumidas. Ele não representa necessariamente valor líquido fiscal, valor recebido, margem ou lucro. A nova nomenclatura deve distinguir, no mínimo, valor bruto faturado, descontos/repasses previstos, valor a receber, valor recebido e custo.

### Regras comerciais

As regras estão ligadas ao documento do cliente e incluem percentuais fixos ou placeholders. Isso torna difícil revisar vigência, origem, aprovação e histórico. No futuro, uma regra deve ser entidade versionada, com vigência, unidade de cálculo, tipo de desconto/taxa, prioridade, evidência e aprovação.

### Importação e conciliação

O fluxo OFX considera somente transações positivas, extrai documentos do campo livre e tenta casar por valor/data. Não há conta bancária, `FITID`/identificador equivalente, hash do arquivo, controle de período importado, transação dividida, tarifa bancária, estorno, pagamento parcial ou baixa manual auditada.

O código mistura `ofxtools` no importador atual com `ofxparse` no `requirements.txt`, sinalizando que a dependência executada não está documentada de forma confiável. O match exato do lote também não incrementa a métrica de matches, e o resultado local observado não demonstra que a conciliação tenha baixado registros.

### Qualidade e segurança

Há parser que captura apenas a primeira página de PDF, placeholders quando o destinatário não é encontrado, tratamento amplo de exceções, impressão de dados em debug e consulta externa dentro do caminho de gravação. O XML usa campos mínimos e a chave da nota é derivada de documento/número/série, não da chave de acesso autorizada armazenada no sistema atual.

O repositório legado tem alterações locais não commitadas em `app.py`, `src/core/parser.py` e `src/core/rules.py`. Elas foram apenas lidas; não foram sobrescritas.

## O que o sistema atual já fornece

O schema `fiscal` já possui uma base melhor para a integração:

- `lotes_distribuicao`: unidade de uma rodada de distribuição;
- `disponibilidades`, `distribuicoes`: quantidade, troca, preço unitário e faturável;
- `tarefas`: cliente, emitente, lote, status, tentativas, timestamps e `valor_total`;
- `tarefa_itens`: snapshot de produto, regra fiscal, quantidade, preço e subtotal;
- `notas`: número, chave de acesso, protocolo, status, valor e data de emissão;
- filas separadas para recuperação de documentos e cancelamento fiscal;
- idempotência, hash de payload, lease/token e histórico de execução.

O relatório atual (`web/src/lib/relatorios.ts`) calcula valor bruto distribuído, quantidade de notas, ticket médio, trocas, rankings e duração operacional. A própria interface informa que custos, pagamentos, descontos e lucro ainda pertencem ao futuro financeiro.

### Contrato recomendado de leitura Fiscal → Financeiro

O Financeiro deve consumir uma visão/consulta contratual estável, ou uma API interna equivalente, contendo:

| Fato | Origem atual | Semântica para o Financeiro |
|---|---|---|
| distribuição/lote | `fiscal.lotes_distribuicao` | origem operacional; não é pagamento |
| item vendido | `fiscal.tarefa_itens` + tarefa | valor bruto contratado/registrado |
| nota autorizada | `fiscal.notas` | documento fiscal emitido; não é caixa |
| cancelamento | fila/estado da nota e evidência | evento que pode exigir reversão/ajuste financeiro |
| cliente/emitente | snapshots e cadastros fiscais | dimensões de análise, sem reescrever o passado |
| data | tarefa, emissão e lote | datas distintas; não colapsar em uma só |

O contrato deve expor identificadores imutáveis, status, valores em decimal, datas, origem e versão. Deve rejeitar a inferência “nota autorizada = paga”. Uma baixa financeira só pode vir de uma transação bancária conciliada ou de um lançamento manual autorizado e auditado.

## Direção da nova arquitetura

### Separação de responsabilidades

```text
Fiscal/Distribuição
  └─ fatos fiscais e operacionais imutáveis
       ↓ contrato somente leitura
Financeiro
  ├─ contas bancárias e movimentos
  ├─ contas a receber/pagar
  ├─ conciliação e alocações
  ├─ razão contábil e períodos
  └─ dashboards e cenários
       ↓
Hub Graalyst / navegação integrada
```

O Financeiro pode compartilhar a instância PostgreSQL, mas deve possuir schema, migrations, papel e permissões próprios. A primeira integração deve ser leitura de fatos fiscais. Escritas no schema `fiscal` continuam pertencendo ao módulo Fiscal.

### Núcleos de domínio que faltam

1. **Plano de contas e dimensões:** conta, categoria, centro de custo, projeto, empresa/tenant e competência.
2. **Contas bancárias:** instituição, conta, moeda, saldo de abertura, saldo conciliado e última importação.
3. **Movimentos bancários:** arquivo/origem, identificador do banco, data de lançamento, data-valor, valor, descrição, crédito/débito, hash e estado de conciliação.
4. **Contas a receber:** obrigação derivada de nota/contrato, vencimentos, parcelas, descontos, juros, status e saldo aberto.
5. **Contas a pagar:** fornecedor, documento, competência, vencimento, parcelas, aprovações e saldo aberto.
6. **Liquidações:** pagamento, recebimento, tarifa, estorno, transferência e alocações parciais para uma ou várias obrigações.
7. **Razão de dupla entrada:** lançamentos balanceados, período, origem, reversão e fechamento.
8. **Auditoria:** quem, quando, antes/depois, motivo, origem e evidência; sem apagar histórico.
9. **Planejamento:** orçamento, reserva, compromissos futuros e cenários; separados do realizado.

### Indicador central para decisão

O dashboard deve mostrar “quanto posso disponibilizar” como uma composição explicável, não como um número mágico:

```text
caixa conciliado
+ recebimentos previstos ponderados por risco
- pagamentos vencidos e compromissos aprovados
- impostos/reservas obrigatórias configuradas
- margem de segurança escolhida
= valor potencialmente disponibilizável
```

Cada parcela precisa abrir o detalhe que a compõe. Se custos, impostos ou risco ainda não estiverem cadastrados, a tela deve mostrar “não calculado” ou “parcial”, nunca um lucro fictício.

### Tela de alto valor e poucos cliques

1. **Faixa de situação:** caixa conciliado, recebimentos próximos, pagamentos próximos, pendências de conciliação e valor potencialmente disponível.
2. **Fila de ação:** itens sem correspondência, vencidos, divergentes, duplicados e lançamentos aguardando aprovação.
3. **Calendário de caixa:** próximos 7/30/90 dias com entradas e saídas por confiança.
4. **Desempenho:** bruto faturado, recebido, aberto, prazo médio de recebimento, concentração por cliente, margem somente quando houver custo confiável.
5. **Drill-down:** cada KPI abre a lista filtrada e a trilha de origem em um clique.

## Referências open source avaliadas

| Projeto | O que contribui | Por que não deve ser a base direta agora |
|---|---|---|
| [ERPNext](https://github.com/frappe/erpnext) | Amplitude de ERP; contabilidade, fluxo de caixa, relatórios, compras, estoque e operações conectadas. Serve de referência para plano de contas, razão, contas a pagar/receber, dimensões e aprovações. | É uma plataforma ERP completa sobre Frappe, com grande superfície operacional e outra arquitetura. Adotar o produto inteiro desviaria do fluxo Graalyst e exigiria avaliar a licença GPL-3.0 e a operação. |
| [LedgerSMB](https://github.com/ledgersmb/LedgerSMB) | Melhor referência conceitual para dupla entrada, PostgreSQL, faturamento, pagamentos, estoque e ERP para pequenas/médias empresas. | Aplicação web em Perl e monolítica para o contexto atual; o valor principal é o modelo contábil e a documentação, não copiar a aplicação. Licença GPLv2 exige análise antes de qualquer reutilização de código. |
| [Odoo](https://github.com/odoo/odoo/tree/19.0/addons/account) | Interface de produtividade, reconciliação bancária, contabilidade analítica, orçamento, ativos e multiempresa. | Ecossistema grande e modelo de extensão próprio. Usar como referência de UX e conceitos; verificar licença por componente antes de reutilizar código. |
| [Dolibarr](https://github.com/Dolibarr/dolibarr) | Modularidade, vendas, faturas, compras, estoque, projetos, contabilidade e foco em ativar somente o necessário. | PHP/monólito e domínio mais amplo que o necessário. Pode inspirar navegação modular, não substituir o módulo Fiscal atual. GPL-3+ deve ser respeitada em eventual reutilização. |
| [Akaunting](https://github.com/akaunting/akaunting) | Vocabulário simples de faturamento, despesas, pagamentos e pequenos negócios. | Menos adequado como referência de auditoria profunda, razão e integração fiscal; avaliar apenas fluxos de baixa complexidade. |
| [Firefly III](https://github.com/firefly-iii/firefly-iii) | Visibilidade de caixa, categorias, orçamentos, relatórios e linguagem de decisão financeira. | É gerenciador de finanças pessoais, não ERP fiscal/empresarial. Referência de UX e planejamento; AGPL-3.0 e domínio impedem assumir como base. |
| [Actual Budget](https://github.com/actualbudget/actual) | Planejamento de caixa, envelopes/orçamentos, reconciliação e experiência calma/local-first. | Focado em finanças pessoais e orçamento, não em emissão fiscal, contas empresariais ou razão corporativa. Útil para ideias de planejamento, não para o núcleo. |

### Recomendação de reaproveitamento

Não reaproveitar código open source nesta fase. Reaproveitar conceitos documentados:

- LedgerSMB e ERPNext para razão, dupla entrada, contas a receber/pagar e períodos;
- Odoo e Dolibarr para reconciliação e navegação modular de baixa fricção;
- Firefly III e Actual para linguagem de caixa disponível, cenários e orçamento.

Qualquer cópia futura exige inventário de licença, arquivo de origem, compatibilidade de dependências, revisão de segurança e decisão registrada.

## Plano de execução recomendado

### Fase 0 — contrato e decisões

- definir o contrato Fiscal → Financeiro;
- decidir empresa/tenant, moeda, regime de competência e política de arredondamento;
- separar realizado, previsto, comprometido e cenário;
- definir papéis, RLS, retenção e trilha de auditoria.

### Fase 1 — visão fiscal financeira somente leitura

- consumir notas, itens, lotes e clientes atuais;
- produzir bruto por período, aberto fiscal e distribuição por cliente/produto;
- deixar explícito que nenhum valor é recebido sem conciliação.

### Fase 2 — banco e conciliação

- importar OFX/CSV com hash e identificador de transação;
- suportar duplicidade, estorno, tarifa, transferência e pagamento parcial;
- sugerir matches, exigir confirmação nas exceções e registrar cada alocação.

### Fase 3 — contas a receber/pagar

- gerar recebíveis a partir de regras versionadas e aprovadas;
- cadastrar despesas/fornecedores e compromissos;
- exibir aging, vencimentos e risco de concentração.

### Fase 4 — razão e fechamento

- lançar dupla entrada balanceada;
- permitir reversão sem apagar fatos;
- fechar períodos e gerar trilha reproduzível.

### Fase 5 — dashboard de decisão

- caixa atual e projetado;
- valor potencialmente disponível com composição;
- cenários de investimento/operação;
- alertas acionáveis e drill-down em um clique.

## Critérios de aceite para a próxima etapa

- nenhum KPI financeiro chama valor fiscal de valor recebido;
- qualquer número exibido tem origem e período identificáveis;
- uma nota autorizada pode permanecer em aberto até existir liquidação;
- pagamentos parciais e estornos não quebram o saldo;
- uma importação bancária repetida é idempotente;
- alterações manuais exigem usuário, motivo e histórico;
- a consulta fiscal não altera snapshots nem filas do Worker;
- o painel mostra ausência de dados como ausência de cálculo, não como zero.

