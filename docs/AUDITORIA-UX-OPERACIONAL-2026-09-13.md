# Auditoria operacional e de UX — 13/09/2026

## Objetivo e limite

Auditoria do estado atual da Distribuição Fiscal para encontrar mudanças que
reduzam tempo, cliques, erro humano e esforço mental. Foram lidos os fluxos de
distribuição, trocas, tarefas, notas, relatórios e roteiro, além dos testes e da
documentação vigente. Esta unidade **não implementa** a sequência de melhorias,
não altera banco, Worker, Vercel nem operação fiscal.

O código auditado está no commit `5052a06`. A suíte Web desse mesmo commit
passou com 153 testes em 29 arquivos. A tela pública de login foi aberta, mas as
telas autenticadas não foram usadas nesta auditoria; portanto, os achados de UI
abaixo são confirmados no código e ainda exigem validação visual autenticada em
desktop e celular.

## O que deve ser preservado

- A organização por mercado tornou o preenchimento coerente com a rota física:
  totais dos produtos primeiro, depois todos os produtos de cada mercado.
- A conferência final já mostra mercado, emitente, quantidade total, troca,
  quantidade fiscal, preço e subtotal no mesmo formulário. Não criar um novo
  passo ou modal obrigatório para todas as distribuições.
- Repetir a última distribuição economiza digitação e corretamente reinicia as
  trocas em zero, evitando consumir novamente um saldo já baixado.
- O roteiro mantém `Normal` e `Troca` em colunas fixas de 6rem, com a troca em
  destaque e valores monetários ocultos por padrão. Não redesenhar essa parte.
- Tarefas e notas já atualizam automaticamente enquanto existe operação ativa;
  não trocar isso por consultas contínuas ou Realtime sem necessidade medida.

## Plano priorizado

### P0 — corrigir antes de ampliar o uso

#### 1. Quantidades fiscais em milésimos de ponta a ponta

**Problema.** `validarDistribuicaoTotal` ainda soma `number` diretamente. Um
caso válido com total `0,3` e linhas `0,1 + 0,2` retorna inválido porque o total
binário vira `0,30000000000000004`, embora a sobra exibida seja zero. O mesmo
tipo de soma aparece no saldo visual de troca e no agrupamento do roteiro.

**Impacto.** Pode bloquear uma distribuição correta, mostrar números estranhos
ou criar divergência entre preview e transação. O erro custa conferência e
redigitação justamente no fluxo diário.

**Mudança.** Usar os helpers de milésimos em todos os cálculos de quantidade:
total disponível, distribuído, troca, faturável, saldo e agregação do roteiro.
Moeda continua arredondada separadamente em centavos. Não mudar a regra fiscal.

**Arquivos prováveis.** `web/src/lib/calculos.ts`, `web/src/lib/entregas.ts`,
`web/src/app/distribuicao/DistribuicaoForm.tsx` e respectivos testes.

**Verificação.** Cobrir `0,1 + 0,2 = 0,3`, três casas decimais, limites, troca
entre dois emitentes do mesmo mercado e roteiro sem artefatos binários.

**Benefício/esforço/risco.** Muito alto / baixo-médio / baixo com testes.

#### 2. Congelar o envio usando um snapshot imutável

**Problema.** Durante `processarDistribuicao`, apenas o botão final fica
indisponível. Mercado, emitente, produto, quantidades, repetição e descarte ainda
podem alterar o estado. Quando a resposta chega, o formulário limpa o estado
atual, inclusive edições feitas durante a espera.

**Impacto.** O usuário pode acreditar que uma edição tardia fez parte do lote ou
perder trabalho. É uma janela curta, mas o custo de ambiguidade é fiscal.

**Mudança.** Capturar o payload uma vez no clique; bloquear temporariamente os
controles mutáveis e comunicar “Enviando esta conferência…”. Em falha, restaurar
e manter exatamente o snapshot tentado. Não adicionar uma segunda confirmação.

**Arquivos prováveis.** `DistribuicaoForm.tsx` e testes do componente/ação.

**Verificação.** Simular resposta lenta, tentar editar/remover/repetir e provar
que o lote contém somente o snapshot e que uma falha preserva os dados.

**Benefício/esforço/risco.** Alto / baixo-médio / baixo.

#### 3. Tornar a idempotência semanticamente segura

**Problema.** A chave evita lote duplicado, mas, no conflito, o servidor retorna
o lote existente sem comparar os dados recebidos com os dados do primeiro
envio. Após resposta perdida, uma edição seguida de reenvio com a mesma chave
pode parecer aceita embora o lote antigo tenha sido reutilizado.

**Mudança.** Persistir uma impressão digital canônica do pedido no lote e
compará-la na reutilização. Mesmo pedido retorna o lote anterior; pedido
diferente com a mesma chave é recusado com orientação para abrir o lote já
registrado e iniciar uma nova distribuição para as alterações.

**Dependência.** Não depende do PC servidor, mas exige desenho de migration,
teste transacional e autorização separada antes de alterar o banco remoto.

**Benefício/esforço/risco.** Alto / médio / médio. Deve vir após o snapshot.

### P1 — ganhos rápidos no uso recorrente

#### 4. Evitar perda acidental do rascunho sem burocratizar

Remover mercado/emitente/produto, descartar rascunho e repetir a última
distribuição podem apagar ou substituir quantidades já digitadas imediatamente.
Usar confirmação apenas quando a ação afetar conteúdo preenchido; para remoções,
preferir desfazer por alguns segundos. Rascunho vazio continua com um clique.

**Benefício/esforço/risco.** Alto em correções / baixo-médio / baixo.

#### 5. Mostrar progresso por mercado e a primeira pendência

O cabeçalho informa apenas quantos produtos existem; não informa o que já foi
decidido. Acrescentar resumo compacto por mercado e global, distinguindo campo
em branco de zero deliberado. Exemplo: “3 de 4 produtos conferidos” e “1
pendência”; a pendência deve levar/focar o primeiro campo, sem novo passo.

Antes de implementar, definir uma ação rápida e explícita como “zerar os demais”
para que zero não seja inferido silenciosamente. Isso reduz varredura visual sem
criar nota indevida.

**Benefício/esforço/risco.** Alto e frequente / médio / médio pela semântica do zero.

#### 6. Atalho de teclado para adicionar produtos

Após selecionar produto e informar o total, Enter deve executar `Adicionar` e
devolver o foco à busca do próximo produto. O botão permanece igual no celular.
É uma interação evitada por produto no uso de teclado, sem esconder decisões.

**Benefício/esforço/risco.** Médio e frequente / baixo / baixo.

#### 7. Abrir exatamente o lote recém-enviado

O resultado oferece “Acompanhar emissão”, mas leva para `/tarefas` sem identificar
o lote. Passar `loteId` na URL e destacar/filtrar a distribuição recém-criada;
o mesmo vale para “Abrir documentos” no cartão da última distribuição. Evita o
usuário procurar a rodada em um histórico crescente.

**Benefício/esforço/risco.** Médio-alto / baixo-médio / baixo.

#### 8. Corrigir a conclusão da última distribuição no histórico grande

`tarefas/page.tsx` só marca a última distribuição como concluída quando a lista
tem menos de 100 registros. Ao atingir o recorte, uma rodada completa pode ficar
eternamente com “Acompanhe”. Consultar o último lote completo separadamente, em
vez de inferir completude da lista truncada.

**Benefício/esforço/risco.** Alto quando o histórico crescer / baixo-médio / baixo.

#### 9. Separar “Atenção” de “Em andamento” nos indicadores

Na tela de tarefas, `AGUARDANDO_CONFERENCIA` é Atenção; nos relatórios e na Home
ele é somado a Em andamento. Usar a mesma classificação em todos os lugares e
mostrar Atenção separadamente. Isso evita esperar um Worker que, na verdade,
precisa de decisão humana.

**Benefício/esforço/risco.** Alto para diagnóstico / baixo / baixo.

#### 10. Proteger o registro aditivo de trocas contra reenvio incerto

Hoje cada envio soma ao saldo e não possui chave idempotente nem histórico de
movimento. Uma falha de rede pode levar o operador a enviar novamente e dobrar o
saldo. Primeiro ganho: token idempotente por envio e confirmação com saldo
resultante/último lançamento. Uma tabela contábil completa de movimentos e
estorno só deve ser desenhada após decisão de negócio; não inventar essa regra.

**Benefício/esforço/risco.** Alto, uso ocasional / médio / médio; pode exigir migration.

### P2 — escala e acabamento, depois dos itens acima

#### 11. Paginar Notas antes de assinar documentos

`/notas` lê o histórico inteiro e gera URLs assinadas para toda a visão atual.
Com o crescimento, isso aumenta consulta, tempo e chamadas ao Storage. Paginar
por distribuição no servidor e assinar apenas a página aberta; preservar abas e
recuperação. Não há urgência com histórico pequeno.

#### 12. Reconciliar os dois roteiros e lidar com mercado muito longo

O roteiro visual destaca Troca em vermelho, mas o HTML da fila automática não.
Ambos têm colunas fixas, porém `break-inside: avoid` no cartão inteiro pode
estourar uma página quando um mercado tiver muitas linhas. Manter o desenho
aprovado, aplicar a mesma cor no HTML automático e permitir quebra controlada
entre itens, repetindo cabeçalho quando necessário. Validar impresso com `—`, 1,
2 e 3 dígitos, poucas linhas e um mercado maior que uma página.

#### 13. Preservar preferências do roteiro

Trocar a distribuição recarrega a página e volta todos os filtros ao padrão.
Persistir localmente Endereço, Trocas, Valores e Conferência reduz cliques para
quem sempre imprime do mesmo jeito. É conforto; não deve preceder correções de
integridade.

#### 14. Métricas operacionais sem promessas inventadas

Os tempos atuais usam timestamps reais do lote e corretamente não extrapolam o
benchmark manual. Próximo passo: separar espera na fila (criação até primeira
reserva) de tempo de processamento em parede (primeiro início até última
conclusão), rotulando-os com precisão. `AGUARDANDO_CONFERENCIA` deve aparecer em
Atenção. Não chamar duração de parede de “tempo ativo do Playwright”.

#### 15. Corrigir apenas destinos que falharam

Preparar uma ação que abra nova distribuição somente com os pares
mercado/emitente que falharam e seus itens originais. Não usar para estado fiscal
incerto e não reprocessar automaticamente. É valioso, porém menos frequente e
mais complexo que impedir o erro antes do envio.

## O que pode ser feito agora

1. Quantidades em milésimos e testes de regressão.
2. Snapshot/bloqueio durante envio.
3. Proteção condicional do rascunho.
4. Atalho de produto e foco.
5. Progresso por mercado, após fechar a semântica de zero.
6. Atalhos direcionados ao lote recém-criado.
7. Conclusão correta do último lote e coerência de estados/KPIs.
8. Paginação de Notas, consistência dos roteiros e preferências locais.
9. Desenho/teste local da idempotência do lote e da entrada de trocas; qualquer
   migration remota continua sujeita a autorização específica.

## O que realmente depende do PC servidor

- Instalar o pacote do Worker como processo em background e provar reinício do
  Windows, atualização e rollback.
- Validar duas tarefas simultâneas com sessões reais, CPU/memória e portal.
- Testar impressora física/rede, fila automática, nomes de impressora, papel,
  falha, retomada e proteção contra impressão duplicada.
- Medir latência e estabilidade contínua da máquina definitiva.
- Ativar coordenação entre executores somente após o ensaio de identidades e
  corte operacional já documentado.

Nenhum desses itens bloqueia as melhorias Web/P0 e P1.

## Sequência recomendada

1. **Lote A:** itens 1, 2 e 9; testes unitários e do formulário; validação
   visual autenticada em desktop e celular.
2. **Lote B:** itens 4, 6, 7 e 8; medir se o operador chega ao lote correto sem
   procurar e se nenhum rascunho preenchido some sem aviso.
3. **Lote C:** item 5, com decisão explícita sobre branco versus zero.
4. **Lote D:** idempotência do lote e das trocas; preparar migration, teste
   transacional e pedir autorização antes do banco remoto.
5. **Lote E:** escala de Notas, paridade dos roteiros e métricas.
6. **Servidor:** somente então executar o roteiro físico já documentado, sem
   misturar diagnóstico de UX Web com hardware/impressão.

## Configuração mínima de modelo

- **Lotes A e B:** `gpt-5.6-terra` com intensidade **média** é a menor
  configuração recomendada para cruzar componentes, Server Actions e testes sem
  gastar um modelo de arquitetura.
- **Mudanças puramente locais já especificadas** (cor do roteiro automático,
  Enter/foco e preferências): `gpt-5.6-luna` em **alta** é suficiente.
- **Lote D (migration/idempotência fiscal):** `gpt-5.6-sol` em **alta** pela
  necessidade de raciocínio transacional e compatibilidade de dados.
- **GPT-6 Astra:** reservar para revisão arquitetural/segurança, conflito de
  requisitos ou investigação que continue incerta após testes. Não é necessário
  para executar os quick wins já definidos.

