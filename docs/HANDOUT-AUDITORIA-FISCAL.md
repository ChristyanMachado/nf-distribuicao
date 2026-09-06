# Handout — Auditoria Fiscal / Financeiro

Use este arquivo como ponto de entrada antes de trabalhar no módulo.

## Regra principal

**Nota autorizada não é pagamento recebido.** O Fiscal informa o fato fiscal; o Financeiro precisa de uma transação bancária conciliada ou de um lançamento manual autorizado e auditado para reconhecer recebimento.

## O legado em uma frase

O projeto separado `F:\.Faculdade\Projetos Pessoais\Auditor` é um protótipo Streamlit de importação de PDF/XML + previsão comercial + conciliação OFX. Ele é fonte de conceitos e regras a validar, não uma base pronta para copiar.

## Reaproveitar

- importação bancária;
- previsão de recebimento versionada;
- agrupamento por cliente/lote/período;
- sugestões de conciliação com revisão de exceções;
- nome operacional separado da razão social;
- dashboards compactos com pendências acionáveis.

## Não reaproveitar sem reescrever

- `float`/`REAL` para dinheiro;
- regra por CNPJ hardcoded;
- `status_pagamento` único;
- baixa direta por match aproximado;
- PDF/XML como fonte primária das notas atuais;
- ausência de idempotência, trilha, parcela, estorno e pagamento parcial.

## Fonte atual dos fatos

- distribuição: `fiscal.lotes_distribuicao`, `disponibilidades`, `distribuicoes`;
- snapshot fiscal: `fiscal.tarefas`, `fiscal.tarefa_itens`;
- documento autorizado: `fiscal.notas`;
- operação e evidência: filas de recuperação/cancelamento e `fiscal.logs`;
- relatório atual: `web/src/lib/relatorios.ts` e `web/src/app/relatorios/actions.ts`.

## Próxima ação segura

Definir e testar o contrato somente leitura Fiscal → Financeiro. Depois criar o núcleo financeiro em repositório/schema próprio. Não criar migration no schema `fiscal`, não alterar o Worker e não importar os XML legados como novas notas sem reconciliação explícita.

## Documentos detalhados

- [Análise completa e proposta](AUDITORIA-FISCAL-REESTRUTURACAO.md)
- [Mapa Graphify e consultas](GRAPHIFY-AUDITORIA-FISCAL.md)
- [Arquitetura atual](ARCHITECTURE.md)
- [Estado e gates](HANDOFF.md)

