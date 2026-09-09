# Validação da continuação da lapidação — 09/09/2026

## Avaliação geral: compartilhar com ressalvas

Complementa `AUDITORIA-LAPIDACAO-2026-09-09.md`; os estados abaixo substituem
pendências daquela primeira rodada, sem apagar seu histórico. Revisão orientada
pela skill validate-data do Data Analytics: denominadores, população, comparação,
viés de seleção e força das conclusões foram conferidos separadamente da aparência.

## Metodologia e conferência dos cálculos

Fontes: código `web/src/lib/relatorios.ts`, consultas de
`web/src/app/relatorios/actions.ts`, registros remotos consultados somente para
leitura nesta revisão e relatório local renderizado. Recorte histórico disponível
até 09/09/2026; filtros diários do produto usam America/Sao_Paulo.

| Notas por lote | Lotes elegíveis | Segundos somados | Média/lote | Média/nota |
|---|---:|---:|---:|---:|
| 1 | 2 | 140 | 70 | 70 |
| 3 | 1 | 184 | 184 | 61,33 |

Conferência independente: 59 + 81 + 184 = 324 s; 324/5 = 64,8 s por nota;
324/15 = 21,6 s por linha de item. A interface arredonda segundos. Cobertura:
3 de 4 lotes; o lote de 4.902 s com tentativas adicionais não entra na velocidade.
Isso é seleção de execuções elegíveis, não tempo global incluindo retrabalho.

337 − 184 = 153 s (45,4%) é saldo exploratório contra um teste manual de três
notas, não economia comprovada. Mesma quantidade de notas não controla linhas,
preparação, operador ou condição do portal. Não há amostra suficiente para estimar
custo fixo ou efeito causal da sequência. Não há lote elegível de cinco notas no
recorte consultado; limpeza histórica impede usar essa ausência para negar o relato.

Tempo medido: primeira tarefa iniciada até última autorização registrada. Não
inclui preparação, fila inicial ou armazenamento posterior. Média/nota é tempo
amortizado do lote, não duração isolada nem custo marginal. Linha não é unidade
física. Datas inválidas, lotes incompletos, reprocessamentos e duração acima de
24 h são excluídos; tarefas canceladas antes de emitir podem reduzir o tamanho
considerado. O teste sintético de cinco notas valida cálculo, não desempenho real.

Próxima medição: registrar preparação, envio, reserva, autorização, documentos e
tentativas separadamente; coletar manual/sistema com notas e linhas equivalentes
em dias distintos; mostrar cobertura, mediana/dispersão e retrabalho. Só comparar
economia com cronômetros equivalentes e referência versionada, preservando perdas.

## Problemas encontrados e resolvidos localmente

1. Alto: relatório falhava no banco com 42804 por combinar status texto e enum.
   Cast explícito nas duas consultas resolveu a navegação; testes conferem SQL.
   Não afirmar que produção apresentava isso: revisões locais não estavam publicadas.
2. Alto: destino exclusivamente de troca precisava validação de vínculo/atividade.
   Agora validado sem exigir dados fiscais de quem não gera nota. Dez testes de
   ação com banco simulado; isso não prova rollback real nem elimina toda corrida.
3. Médio: falha de armazenamento local podia interromper fluxo ou confundir sucesso
   remoto com falha. Leitura/gravação/remoção protegidas com aviso separado.
4. Médio: disponibilidade inválida derrubava preview; agora mostra erro local e
   preserva validação estrita no servidor. Quantidades têm nomes acessíveis.
5. Alto, interpretação: tabela por escala usa tempos observados; Home distingue
   ausência de amostra e saldo negativo. Taxa de tarefas finais não promete ausência
   de incidentes ou sucesso na primeira tentativa.

## Cancelamento e causa

Leitura confirmou 5 notas autorizadas e 1 cancelada. Cancelamento fiscal posterior
não desfaz conclusão técnica da emissão. Estado ERRO também não comprova defeito
do código: pode decorrer de dado ou serviço externo. Manter causa desconhecida até
confirmação; registrar categoria operacional/técnica/externa, evidência, autoria e
data separadas do estado fiscal. Relato do usuário não deve virar atribuição
automática nem alteração retroativa. Histórico não foi modificado.

## UX e verificação

Melhor relação utilidade/cliques: resumo já existente com produto, unidade,
quantidade faturável, preço, subtotal e total; aviso de preço excepcional, sem modal
extra. Aceite adicional somente quando há sobra, invalidado se o conteúdo mudar.

Navegador local com dados: seleção, busca vazia, adição, sobra, aceite, edição,
quantidade negativa, troca integral, restauração/descarte de rascunho de QA.
Viewport móvel 390×844; relatório sem transbordamento da página, escalas e período
sem amostra conferidos. Notas ativas/canceladas e navegação de cadastros/tarefas
conferidas. Nenhum envio, cancelamento, recuperação ou compartilhamento executado.
143 testes Web em 26 arquivos e build de produção aprovados. Não houve alteração
de Worker, migration ou publicação. Aparelho físico, login real, sucesso pós-envio,
impressão e rollback isolado ainda não estão validados nesta unidade.

## Plugins e ferramentas: utilidade observada

- Supabase: consultas reais e inspeção de permissões; fonte dos registros, não
  substituto de benchmark humano. Sem escrita remota.
- Vercel: conexão confirmada; último deployment de produção listado READY em
  `7e6c31851d618fdda7dc541497a1b01dbb0a4c86`. Distingue publicação de teste local.
  Orientações React reforçaram autorização nas ações e armazenamento defensivo.
- Data Analytics: instalação e ferramentas confirmadas após aviso do responsável;
  revisão metodológica usada aqui. Não acrescenta amostras ausentes, nem justifica
  publicar outro dashboard ou enviar dados fiscais a novos serviços.
- Navegador: encontrou falha real de integração que build/testes puros não detectaram.
- Graphify: relações úteis na validação transversal; consulta ampla ruidosa, símbolo
  exato melhor. Ver GRAPHIFY.md. Sem alegar economia de tokens medida.
- Git local basta para esta unidade; GitHub será útil para revisão remota quando
  solicitada. Sem ferramenta ativa de permissões de plugins, não houve auditoria
  exaustiva de permissões. Nenhum plugin novo adicional é necessário agora.

## Riscos e próximos gates

| Risco restante | Impacto | Probabilidade/evidência | Esforço | Risco da mudança |
|---|---|---|---|---|
| Alegar economia causal com amostra pequena | Alto | Limitação comprovada | Médio, coleta | Baixo se só instrumentação isolada |
| Foco/sucesso e uso em aparelho real | Médio | Não ensaiado | Baixo em ambiente seguro | Baixo |
| Histórico sem paginação antes de assinar | Médio | Cresce com volume; hoje 6 notas | Médio | Médio, preservar lotes/filtros |
| Revogação de sessão antes de multiusuário | Alto | Renovação local não revalida papel continuamente | Médio | Alto, autenticação |
| Funções públicas do Ponto e senha vazada | Alto | Advisors retornaram alertas | Exige coordenação | Alto, sistema compartilhado |
| Recuperação/backup sob falha real | Alto | Não reensaiado | Médio | Alto se feito em produção |

Advisors apontaram quatro funções SECURITY DEFINER públicas executáveis por anon
e authenticated e proteção de senha vazada desabilitada. Leitura de privilégios
indicou fiscal sem USAGE para esses papéis. Isso não equivale a auditoria completa
de segurança. Migration 0014 permanece adiada: não corrigir Ponto incidentalmente.

Prioridade imediata: revisão humana do diff e gates seguros de UX/rollback;
depois publicação somente autorizada. Paginação foi adiada conscientemente pelo
volume atual, não removida do roadmap. Instrumentação por tentativa e referências
manuais equivalentes precedem promessas de ganho em escala. Não aumentar
concorrência da VM nem refatorar o Worker como polimento especulativo.
