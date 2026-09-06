# Reunião — consolidação parcial de 05/09/2026

Fontes: relato do responsável e transcricao_completa.txt, partes 000–005,
recebida e reconciliada em 05/09/2026. Gravação
preservada de aproximadamente 58 minutos de reunião de cerca de 1h50.
Não inferir conteúdo perdido nem tratar este resumo como transcrição literal.
Negociação financeira registrada somente em docs/privado/, ignorado pelo Git.
O arquivo bruto não deve ser publicado. Falas transcritas não autorizam ações
atuais no portal, banco ou infraestrutura. O trecho perdido permanece desconhecido.

## Evidências do piloto na transcrição

- Seleção de mercados e múltiplos emitentes habilitados foi demonstrada no
  celular; conferência antes de distribuir recebeu avaliação positiva (000–001).
- Atualização automática das tarefas, download de PDF e compartilhamento
  funcionaram durante a demonstração; quantidades e valores foram conferidos
  pelo participante (001–002). Evidência relatada, não novo teste automatizado.
- Aproximadamente cinco notas em quatro minutos foram mencionadas (002).
  Medida informal: não substituir o benchmark controlado nem prometer esse SLA.
- Retenção discutida: documentos originais por 30 dias e recuperados por 7 dias.

## Pontos novos e critérios para o próximo trabalho

1. **Confirmação de envio perceptível (001):** houve relato de cerca de 15s
   até enviar; produtos foram limpos, mas o usuário não percebeu sucesso.
   Separar claramente distribuição recebida de todas as notas autorizadas;
   manter número e atalho de acompanhamento visíveis, evitando reenvio duplicado.
2. **Notas por distribuição (001):** agrupar documentos sem perder ações
   individuais de PDF, XML e compartilhamento.
3. **Janela por nota ou por distribuição (001, 003):** foi questionado se um
   lote enviado segundos antes do fechamento deveria terminar inteiro depois.
   Hoje a garantia é da tarefa já reservada, não de todo lote ainda pendente.
   Regra confirmada posteriormente: concluir as tarefas pendentes do lote já
   iniciado sem começar outro lote. Horários citados variam; não atualizar
   configuração pela transcrição. A emissão após meia-noite foi explicada como
   organização interna para coincidir com o dia da entrega, não exigência fiscal.
4. **Relatórios compreensíveis (003):** esclarecer universo de distribuições
   medidas versus notas, espera versus processamento e estimativa de economia.
   Gráficos por mercado/produto precisam identificar valor e período; não
   apresentar valor fiscal como dinheiro recebido. Novo benchmark ainda pendente.
5. **Roteiro compacto (004):** relato de apenas dois mercados por página com
   três produtos. Avaliar densidade sem perder legibilidade ou estética.
   Manter conferência/Recebido por opcionais. App do motorista, assinatura
   digital e cadastro de veículos são ideias futuras, não escopo imediato.
6. **Notas carregando indefinidamente (000):** ocorrência intermitente relatada
   durante compartilhamento de tela, depois desapareceu. Sem causa confirmada;
   não atribuir a login simultâneo. Reproduzir e observar antes de corrigir.

## Cancelamento fiscal observado — ainda não implementado

- Erros de preço em mudanças de promoção motivaram a necessidade (004–005).
  É cancelamento de nota autorizada, diferente de cancelar uma tarefa local.
- Na consulta, foi demonstrada ação de cancelamento e motivo editável. Foi
  sugerido preencher “Dados incorretos” e pedir confirmação. Validar requisitos
  do portal antes de adotar o texto; não há seletor confiável coletado.
- Em homologação, uma nota antiga teve resposta sobre prazo excedido; uma
  recente retornou código 135 e texto de evento registrado/vinculado. A tela
  antiga não mudou imediatamente; nova consulta mostrou cancelamento.
  São observações, não definição de prazo legal ou regra suficiente de sucesso.
- Uma nota do sistema foi cancelada manualmente no portal durante o teste.
  Pode haver divergência com o estado local: reconciliar por chave e evidência,
  inicialmente em leitura, sem apagar histórico ou reescrever dados por suposição.
- Recomendação técnica: identidade/chave conferidas, operação idempotente,
  resultado confirmado e trilha de auditoria antes de disponibilizar botão.

## Direção e pendências

- Cliente satisfeito com o piloto e pretende começar a utilizar o sistema.
- Há referência tanto a início no dia seguinte quanto a uma semana de teste:
  confirmar calendário. Nenhuma autorização técnica de emissão real concedida
  neste turno. Manter emissão e consulta em homologação até liberação explícita.
- Agrupar a listagem de notas (PDF/XML) por distribuição, mantendo os controles.
- Criar fluxo separado de cancelamento de nota já autorizada por erro do
  operador (preço promocional, quantidade etc.). Não confundir com cancelar
  tarefa pendente. Exigir reconhecimento, regras aplicáveis, confirmação,
  prova do resultado e auditoria antes de implementar/ativar.
- Recuperação de senha: e-mail acessível e impacto da identidade compartilhada
  precisam ser definidos. Não alterar o sistema de ponto agora.
- Novo benchmark: mesmos produtos/clientes/emitentes e trabalho completo,
  incluindo troca de login e consultas manuais. Separar espera de fila de
  processamento; não substituir o benchmark atual antes de obter medidas.

## Financeiro e hub futuro

Este escopo vem do relato oral posterior; a gravação parcial não confirma a
negociação nem todos os detalhes abaixo.

- Financeiro em repositório próprio, com commits e implantação independentes.
- Hub Graalyst com entrada para Fiscal, Financeiro e futuramente RH; a marca
  permite voltar ao hub. Navegação visual consistente e identidade integrada.
- Mesmo projeto de banco é preferência, não autorização para compartilhar
  escrita irrestrita: cada módulo deve possuir suas tabelas e permissões.
- Financeiro consome dados fiscais por contrato definido, sem alterar snapshots
  ou interpretar nota autorizada como pagamento recebido automaticamente.
- Código financeiro antigo e projeto open source serão enviados depois.
  Avaliar licença, dependências, segurança e aderência antes de reaproveitar.
- Opção inicial mais simples: hub com links para aplicações independentes.
  Se for necessário um único domínio/caminhos, avaliar Next.js Multi-Zones:
  https://nextjs.org/docs/app/guides/multi-zones
  Sem decisão arquitetural implementada neste turno.

## Próxima ação

Priorizar confirmação de envio, agrupamento das notas e clareza dos relatórios;
reconhecer cancelamento e definir gate de produção separadamente. Cadastro do
mix principal de produtos fica com o operador, completando faltantes conforme
necessário (004). Neste turno somente contexto foi atualizado, sem alterações
funcionais, migrações, push ou implantação.
