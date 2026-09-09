# Auditoria de lapidação — 09/09/2026

## Escopo e limites

Revisão local de código, documentos, testes e registros anteriores de operação.
Não é certificação de produção, auditoria de infraestrutura ao vivo nem novo
ensaio fiscal. Nenhum número histórico foi alterado. Sem migration, publicação,
emissão, cancelamento ou mudança na arquitetura do Worker nesta rodada.

O código é a evidência de implementação; os registros anteriores são evidência
histórica, não prova de que a mesma revisão esteja publicada hoje. Os documentos
AI-CONTEXT e HANDOFF mantêm registros datados; esta revisão corrige a interpretação
de “comparável” usada na seção de métricas de 08/09.

## Reconciliação

Prioridades: alta = integridade/erro operacional; média = conforto/escala; futura =
dependente de necessidade ou mudança do modelo de operação.

| Item | Origem | Estado e evidência no código | Ação / prioridade |
|---|---|---|---|
| Ordem alfabética de produtos e clientes | ROADMAP; uso real | Produtos da distribuição já ordenados; cadastros e opções de emitentes agora usam nome e desempate por ID em `web/src/app/*/actions.ts` | Feito localmente / média |
| Pesquisa de produtos | ROADMAP, lapidação | Seletor em `DistribuicaoForm.tsx` filtra descrições | Feito; validar descrições longas em celular / média |
| Rascunho | ROADMAP, HANDOFF | `DistribuicaoForm.tsx` restaura e permite descartar dados locais | Parcial: falta ensaio de sair/voltar em celular; armazenamento indisponível merece tratamento / média |
| Repetir distribuição | HANDOFF | `distribuicao/actions.ts` recupera último lote e filtra cadastros ativos | Feito; repetir copia também preço promocional, diferente de iniciar novo preenchimento / média |
| Conferência de produtos, preços e totais | Pedido atual; HANDOFF | Resumo no mesmo formulário mostra destino, produto, unidade, preço e subtotal | Feito; sem nova etapa ou modal / alta |
| Trocas versus quantidade na nota | Pedido atual | Resumo agora explicita quantidade faturável; lote só de trocas não promete nota | Corrigido localmente / alta |
| Preço excepcional | HANDOFF | Aviso compara com referência; promoção não atualiza `precosCliente` | Feito; não é detecção estatística de preço errado / alta |
| Sobra não distribuída | Reunião 29/08; ROADMAP | Confirmação condicional no resumo e guarda no servidor; editar produtos invalida aceite | Feito localmente; um aceite apenas quando necessário / alta |
| Confirmação de sucesso persistente | ROADMAP | Resumo com número e atalhos no formulário | Parcial: foco/rolagem automática ainda não comprovados / média |
| Tarefas agrupadas por situação | ROADMAP; pedido atual | `tarefas/page.tsx`: aguardando, processamento, atenção, concluídas e canceladas | Feito; sem confundir resultado incerto com erro simples / alta |
| Pendências antigas invisíveis | Auditoria atual | Consulta antes limitada globalmente a 100; agora retorna recentes e todas não terminais | Corrigido localmente; contagens identificadas como recorte / alta |
| Disponibilidade do Worker | Pedido atual | Lease da tarefa e atualização periódica indicam atividade, não disponibilidade global | Parcial; não exibir “online” sem heartbeat. Instrumentar só se houver espera sem diagnóstico / média |
| Notas por distribuição e situação | ROADMAP, reunião 05/09 | `notas/page.tsx` agrupa; `NotaCard.tsx` separa canceladas e ações | Feito; corrigida mensagem contraditória de chave indisponível em canceladas / média |
| Pesquisa/paginação do histórico | Pedido atual | Notas ainda carrega histórico inteiro e assina documentos das notas exibidas | Falta paginação no servidor por lote, antes de assinar; custo cresce com histórico / média, próxima unidade |
| Compartilhamento de documentos | HANDOFF | Links assinados e feedback em `NotaCard.tsx` | Feito; link temporário, não permanência garantida / média |
| Cancelamento fiscal seguro | HANDOFF, incidente 08/09 | Fila específica, exclusão mútua, estado incerto protegido e retomada humana explícita | Correção existente preservada; não repetir operação como teste / alta |
| Motivo de cancelamento | Auditoria atual | Campo antes sugeria causa como valor preenchido; agora exige texto real | Corrigido localmente; texto livre não comprova causalidade / alta |
| Distribuição validada no servidor | SECURITY | UUID, limites, números, disponibilidade, vínculos e snapshot | Feito parcialmente; reforço de cadastros ativos em pares faturáveis nesta rodada / alta |
| Validação de destino só de trocas | Auditoria atual | Pares fiscais são verificados quando há faturamento; inserções só de troca precisam revisão própria | Falta validar vínculo/atividade sem exigir campos fiscais desnecessários; teste transacional antes de mudar / alta |
| Cadastros inativos/histórico | SECURITY, ROADMAP | Desativação lógica com bloqueio diante de tarefas abertas | Feito; exclusão temporária de fictícios perdeu relevância e não deve voltar |
| PWA, responsividade, impressão | IDENTIDADE-PWA, ROADMAP | Manifesto, navegação e estilos responsivos; impressão compacta existente | Parcial: teste em aparelho/impresso real pendente; não redesenhar / média |
| Autorização administrativa | SECURITY | Sessão exigida nas ações sensíveis; fechamento em produção sem configuração | Feito para piloto de administrador; não equivale a isolamento multiempresa / alta antes de expansão |
| Revogação de acesso | Auditoria atual | Sessão local renovável não representa consulta contínua do papel no provedor | Revisar prazo absoluto/revalidação antes de multiusuário; não alterar autenticação nesta lapidação / alta antes de expansão |
| Banco, Storage e segredos | SECURITY | Consulta parametrizada, referências de credencial, URLs restritas e assinatura no servidor | Controles em código; grants/backup/segredos de produção não revalidados nesta rodada |
| Migration 0014 do sistema de ponto | SECURITY, HANDOFF | Fora do journal, decisão externa pendente | Adiada explicitamente; não aplicar como polimento fiscal |
| VM, identidade exclusiva e virada produção | ROADMAP, HANDOFF | Registros datados já documentam implantação e operação | Itens antigos de “criar VM/papel” obsoletos; manter medição de recursos e restauração / média |
| Retenção e recuperação | ROADMAP | Recuperação e limpeza protegida implementadas | Parcial: ensaio de expiração na VM antes de ativar exclusão; não apagar dados nesta auditoria |
| Importar planilha, cosmética, refatorar Worker | ROADMAP | Sem necessidade operacional demonstrada nesta rodada | Futuro; não vale implementar agora |
| Economia por escala | HANDOFF, pedido atual | `lib/relatorios.ts`, detalhes abaixo | Corrigido viés; metodologia manual ainda insuficiente / alta |

## Métricas: o que é medido

1. Agrupamento por lote; tarefas legadas sem lote são tratadas isoladamente.
2. Tempo do lote = maior `concluido_em` menos menor `iniciado_em`, com todas
   as tarefas consideradas concluídas e de primeira tentativa. Inclui intervalos
   entre tarefas, não apenas soma dos trechos de preenchimento.
3. Datas ausentes, inválidas, invertidas e durações acima de 24 horas são excluídas.
   Reprocessamentos também são excluídos porque início preservado não separa tentativas.
4. Média por nota = soma dos tempos dos lotes / soma de suas notas. É tempo
   amortizado, não medição isolada de cada nota nem ganho marginal da próxima.
5. Média por item = soma dos tempos / soma das linhas de item, somente nos lotes
   com contagem completa. “Item” não significa unidade física vendida. Foi corrigida
   a mistura de tempo com denominadores ausentes.
6. O recorte mede execução até autorização registrada. Não inclui preparação
   humana do formulário nem espera inicial na fila; armazenamento final pode ocorrer
   depois de `concluido_em`. Logs do Worker têm tempos de etapas, mas não são uma
   série estruturada persistida por tentativa para análise histórica completa.

### Referência manual e distorções

Há uma referência de 337 segundos para três notas em 25/08. O código não a
extrapola mais para 1, 2, 5 ou outras quantidades. Mesmo três notas não garantem
comparabilidade: faltam equivalência de itens, preparação, operador e limites
do cronômetro. O card foi renomeado para **Saldo frente ao teste manual**, com
aviso de comparação exploratória, não economia comprovada.

Saldo exploratório = soma de (337 − tempo observado) nos lotes de três notas.
Antes, diferenças negativas eram zeradas: isso selecionava ganhos e ocultava
perdas. Agora um lote mais lento reduz o saldo. Sem amostra, a interface mostra
ausência, não economia zero comprovada. Nenhum registro histórico foi reescrito.

Os filtros de primeira tentativa, duração máxima e cancelamento pré-emissão
selecionam uma população de execuções concluídas. Não usar esse indicador para
afirmar confiabilidade global ou tempo total gasto com retrabalho. Uma tarefa
cancelada antes da emissão sai do agrupamento: o tamanho medido pode ser menor
que o lote originalmente solicitado.

### Evidência operacional disponível

Consulta somente leitura registrada na análise de 08/09 (não nova consulta neste
documento): lotes de 1 nota/3 itens/4902 s com tentativas adicionais; 3 notas/8
itens/184 s na primeira tentativa, com um cancelamento fiscal posterior; 1 nota/2
itens/59 s; e 1 nota/5 itens/81 s. O primeiro não entra na amostra de velocidade.
O relato de cinco notas existe também na reunião de 05/09, como observação
informal. Histórico de homologação passou por limpeza autorizada: não encontrar
cinco tarefas juntas no recorte atual não invalida o relato do usuário.

Para o lote de três notas observado, 337 − 184 = 153 s (~45,4%) é apenas diferença
frente àquela referência, não estimativa causal de economia real. Os poucos lotes
não permitem estimar custo fixo ou curva de eficiência; 59 e 81 segundos também
não isolam o efeito dos produtos de outras condições.

### Próxima medição defensável

- Registrar por lote: início/fim da preparação, envio, primeira reserva, última
  autorização e documentos prontos; por tentativa, início/fim, resultado e etapas.
- Separar tempo de trabalho humano, espera na fila, portal, execução e retrabalho.
- Comparar manual e sistema para lotes de 1, 2, 3 e 5 notas com quantidade de linhas
  e condições semelhantes, repetindo observações em dias distintos. Informar n,
  mediana e dispersão; não tirar conclusões de um único lote.
- Exibir tabela por tamanho: total, tempo médio por nota, linhas, cobertura e
  falhas/retrabalho. Evolução temporal deve manter versão e escopo do cronômetro.
- Só então calcular economia absoluta = manual equivalente − sistema equivalente;
  percentual = economia / manual equivalente × 100, preservando valores negativos.
- Testar custo fixo + custo por nota + custo por linha apenas com amostra suficiente;
  validar resíduos/interações antes de extrapolar. Manter dados brutos imutáveis e
  versão da metodologia, nunca ajustar histórico para melhorar resultado.

## Causalidade e segurança operacional

Estado fiscal, resultado técnico e causa são dimensões distintas. Autorização
seguida de cancelamento continua sendo processamento concluído; nota deixa de
ser vigente. `ERRO` não significa automaticamente defeito da automação: pode
envolver portal externo ou dados. Resultado incerto exige conferência.

Próxima unidade: registrar categoria (técnica, operacional, externa, voluntária,
desconhecida), evidência, responsável e data da confirmação, sem sobrescrever os
eventos originais. Até lá, não classificar motivos por palavras-chave nem culpar o
usuário por padrão. No caso relatado, só marcar causa operacional após confirmação;
cancelamento isolado não entra como falha técnica comprovada.

## Verificação desta unidade

- 123 testes Web em 22 arquivos aprovados; incluem regressões para saldo negativo,
  datas invertidas e denominador incompleto por item.
- Build de produção Next.js concluído com código de saída zero, incluindo TypeScript.
- Alterações de consultas/ações foram verificadas por leitura e compilação; não
  houve teste transacional no banco remoto nem ensaio fiscal.
- Validação visual completa das telas autenticadas e em celular ainda pendente.
  O navegador local abriu a navegação, selo Teste e o estado de indisponibilidade
  no carregamento de dados. Não houve envio nem tentativa de contornar a falha.
  Não interpretar teste unitário ou build como aprovação visual/operacional.

Melhor ganho imediato: conferência no formulário existente com quantidade realmente
faturável e preços visíveis; confirmação extra só para sobra. Próxima prioridade:
teste transacional de destinos só de troca, depois paginação de Notas antes de
assinatura de arquivos e instrumentação de métricas por tentativa.
