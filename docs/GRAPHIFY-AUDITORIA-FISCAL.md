# Mapa Graphify — Auditoria Fiscal e integração financeira

**Consulta realizada:** 06/09/2026  
**Ferramenta:** Graphify 0.9.50, extração local `--code-only` já existente no projeto.  
**Estado do índice:** `graphify-out/graph.json`, 1.445 nós, 3.379 relações e 119 comunidades, conforme o estado validado em `docs/GRAPHIFY.md`.

## Limite do mapa

O índice local deste repositório cobre o sistema atual `NF Distribuição`. O Auditor legado está em outro repositório (`F:\.Faculdade\Projetos Pessoais\Auditor`) e foi analisado diretamente, sem escrever ou gerar artefatos nele. Portanto, este mapa registra as relações do sistema atual e a ponte conceitual para o legado; não afirma que os símbolos Python do legado estejam no Graphify deste repositório.

## Consultas feitas

```powershell
.\.tools\graphify\Scripts\graphify.exe query "Auditoria Fiscal legado, notas, lotes, tarefas, notas emitidas, relatórios e integração financeira" --budget 1800
.\.tools\graphify\Scripts\graphify.exe query "como notas fiscais geradas pela distribuição chegam aos relatórios e quais dados financeiros já existem" --budget 1800
.\.tools\graphify\Scripts\graphify.exe explain "processarDistribuicao()"
.\.tools\graphify\Scripts\graphify.exe explain "calcularKpis()"
.\.tools\graphify\Scripts\graphify.exe explain "carregarRelatorio()"
.\.tools\graphify\Scripts\graphify.exe path "processarDistribuicao()" "notas" --undirected
```

O índice é auxiliar. Cada relação abaixo foi confrontada com o código/schema real.

## Relações relevantes

```text
DistribuicaoForm.handleSubmit
  → processarDistribuicao()
      → validações de UUID/data/número/quantidade
      → calcularFaturavel()
      → gerarContratoTarefaPendente()
      → lote + disponibilidades + distribuicoes
      → tarefas + tarefa_itens com snapshot/hash

tarefas + tarefa_itens
  → Worker / fila / emissão
      → fiscal.notas
          → chave, protocolo, status, valor, data e documentos
          → recuperação de documentos
          → cancelamento fiscal separado

carregarRelatorio()
  → tarefa_itens + tarefas + clientes + produtos
  → distribuicoes + disponibilidades + tarefas
  → calcularKpis() / rankings / série diária
  → RelatoriosView
```

## Nós Graphify importantes

| Nó | Arquivo | Papel |
|---|---|---|
| `processarDistribuicao()` | `web/src/app/distribuicao/actions.ts` | valida e grava a rodada fiscal |
| `gerarContratoTarefaPendente()` | `web/src/lib/contrato-tarefa.ts` | cria snapshot/hash do contrato do Worker |
| `calcularFaturavel()` | `web/src/lib/calculos.ts` | separa quantidade distribuída, troca e quantidade faturável |
| `tarefas` | `web/src/db/schema.ts` | estado e identidade da execução fiscal |
| `tarefaItens` | `web/src/db/schema.ts` | itens e valores congelados da tarefa |
| `notas` | `web/src/db/schema.ts` | documento fiscal e evidência de autorização |
| `calcularKpis()` | `web/src/lib/relatorios.ts` | bruto, notas e trocas; não é caixa |
| `calcularKpisOperacionais()` | `web/src/lib/relatorios.ts` | duração, estados e economia operacional |
| `carregarRelatorio()` | `web/src/app/relatorios/actions.ts` | consulta o período e compõe os dados do relatório |
| `agruparNotasPorDistribuicao()` | `web/src/lib/notas-visao.ts` | agrupa documentos sem perder ações individuais |

## Interpretação para o Financeiro

- `tarefa_itens.subtotal` e `tarefas.valor_total`: valor bruto/comprometido originado na distribuição;
- `notas.valor_total`: valor do documento fiscal persistido;
- `notas.status`: estado fiscal, não estado bancário;
- `data` da tarefa, `data_emissao` da nota e datas bancárias futuras: eventos diferentes;
- `relatorios.ts`: fonte de indicadores operacionais e brutos, não de lucro ou caixa;
- qualquer recebimento deve entrar por um domínio financeiro próprio.

## Manutenção do mapa

Não foi feita nova extração nesta análise porque não houve alteração estrutural no código, somente documentação. Após a primeira implementação do contrato Financeiro → Fiscal, executar novamente a extração incremental local e registrar aqui os novos nós/arestas relevantes. Nunca versionar `graphify-out/` inteiro sem revisão de segurança.

