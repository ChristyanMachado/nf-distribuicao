# Roadmap — NF Distribuição

## Estado de integração local — 25/09/2026

- Produção Web permanece no checkpoint `b589f4e` (correção isolada da sessão
  expirada). A branch local `codex/trocas-lote-ajustes` integra novamente os
  controles Manual/Automático e prepara Trocas em lote com ajuste auditável do
  saldo pendente; **ainda não foi publicada**.
- Migrations 0021/0022 de concorrência já constam em produção e homologação no
  histórico Supabase; não usar runner Drizzle de produção. Migration 0023 de
  ajuste das Trocas foi ensaiada somente em homologação. Após revisão final,
  aplicar 0023 em produção antes de publicar o Web correspondente.
- O PC servidor já reporta versão `56e0130` com protocolo de concorrência,
  preferência Automático e teto 3, mas reportava capacidade efetiva 1 na
  consulta de 25/09. Ensaiar 2 e 3 só com notas legítimas, monitorando erros,
  memória e separação de credenciais.
- Faturamento posterior genérico (caso Cooperativa) não foi implementado em
  nenhum commit. O vídeo confirmou seleção manual de parcelas/produtos e
  projetos no fechamento, sem emitir nota na distribuição. O contrato e os
  acoplamentos a fila, Worker e relatórios estão em
  [PLANO-FATURAMENTO-DIFERIDO.md](PLANO-FATURAMENTO-DIFERIDO.md); implementar
  em etapas isoladas, sem desviar o fluxo imediato que já está em uso.

O restante abaixo é a fotografia histórica de 23/09 e não substitui a
atualização acima.

Atualizado em 23/09/2026. O histórico detalhado e as limitações operacionais
estão no [Handoff](HANDOFF.md). A
[auditoria de lapidação](AUDITORIA-LAPIDACAO-2026-09-09.md) é um diagnóstico
histórico: vários itens apontados nela já foram implementados depois.

## Auditoria de eficiência — 23/09/2026

- A auditoria registra o cálculo antigo de 14min42s e, em seção posterior,
  documenta sua substituição pelo KPI abrangente.
- O KPI provisório agora cobre 50 notas concluídas no recorte de 30 dias:
  42 têm throughput de lote observado, 8 extrapoladas; resultado ≈63 min,
  sem apresentar precisão de segundos. O protocolo de benchmark foi atualizado.
- O próximo benchmark deve seguir
  [PROTOCOLO-BENCHMARK-MANUAL.md](PROTOCOLO-BENCHMARK-MANUAL.md).

## Onde estamos

- Fluxo fiscal conectado, snapshot imutável, idempotência semântica, reserva e
  token fencing.
- Worker coordenado com papel mínimo, manutenção explícita e retomada após lease
  anterior. Capacidade 1 é o estado comprovado; capacidade 2 continua um ensaio
  reversível que exige duas tarefas legítimas de credenciais diferentes.
- Storage privado, recuperação em fila própria e cancelamento fiscal protegido,
  sem confundir estado da nota com estado da tarefa.
- Distribuição com quantidades em milésimos, rascunho protegido, pesquisa de
  produtos, repetição, conferência de sobras, preço promocional e livro
  idempotente de trocas.
- Notas por distribuição, paginação, compartilhamento e datas operacionais
  separadas; PWA, layout móvel e roteiro de impressão disponíveis.
- Feedback operacional de trocas, datas e ordem publicado em `491cc80`, com
  164 testes Web e TypeScript aprovados.
- Data fiscal oficial (`dhEmi`) extraída do XML, normalizada para UTC e ligada à
  persistência da nota sem migration; 334 testes do Worker aprovados. A ativação
  depende da instalação do próximo pacote no PC servidor.
- Feedback de uso real incorporado de forma cirúrgica: reposições mais claras,
  Workers compactos no mobile, total físico explícito no roteiro, emitentes em
  área secundária e relatórios operacionais com período personalizado, trocas
  por mercado e histórico de quantidade por produto.
- A versão Web `a7884b0` está em `main` e produção; o checkpoint também está
  marcado pela tag `checkpoint-metricas-concorrencia2-20260923`. `2bd469e`,
  marcado pela tag `web-prod-stable-20260922`, permanece como rollback estável
  conhecido.
- O tempo economizado é dinâmico e identificado como estimativa. Usa baseline
  linear provisório de 337 s/3 notas e throughput de parede dos lotes sem retry;
  isso não mede latência individual e precisa ser recalibrado com benchmark real.
- Banco permite capacidade 2 (`capacity_limit=2`), mas o último heartbeat
  consultado ainda reportou 1. A atualização do `worker.env` físico e validação
  manual ainda dependem de acesso à máquina; não afirmar concorrência 2 ativa.

## Em andamento imediato

1. **Concluído:** migration `0020_retry_automatico_pre_emissao.sql` aplicada no
   Supabase de produção em 2026-09-23; índice, ordenação e permissões dos papéis
   `nf_worker_vm`/`nf_worker_local` verificados.
2. **Gerar e instalar o próximo pacote do Worker** a partir do commit validado,
   preservando `hold.request`; comprovar saúde em manutenção e repetir o reboot.
3. **Validar operação física segura:** logs, retomada, impressão e estabilidade,
   sem criar emissão artificial em produção.
4. **Primeira operação legítima em produção:** acompanhar uma distribuição real,
   conferir XML/DANFE, data fiscal, status e documentos. Produção está preparada,
   mas o fluxo completo ainda aguarda essa validação prática.

## Próximas unidades, em ordem

1. **Alta:** completar ensaio autenticado em aparelho real no ambiente seguro.
2. **Alta:** complementar destinos somente de troca com rollback real em banco
   isolado; não criar tarefas no banco de produção para QA.
3. **Alta, analítica:** instrumentar separadamente preparação, fila, autorização
   e documentos; comparar somente com referências manuais equivalentes.
4. **Média:** configurar `MAX_CONCORRENCIA=2` no arquivo privado do PC servidor,
   confirmar `reported_capacity=2`, e validar com duas tarefas legítimas ou em
   homologação isolada. Uma terceira deve permanecer na fila. Não elevar a 3.
5. **Média:** classificar causa confirmada separadamente do estado fiscal, com
   evidência e autoria; causa desconhecida por padrão.
6. **Média:** ensaiar expiração/recuperação e backup/restauração em ambiente seguro.
7. **Descoberta, sem implementação:** confirmar com o cliente as decisões em
   `PLANO-FATURAMENTO-DIFERIDO.md` antes de qualquer schema ou UX de cooperativas.

## Depois da estabilização

- Definir o contrato Fiscal → Financeiro e iniciar o novo sistema financeiro.
- Projetar Estoque e Produção Rural como produtos próprios, usando apenas o
  histórico de distribuição como futura entrada; não incorporá-los ao NF.
- Criar o hub Graalyst para integrar módulos independentes.
- Implementar recuperação de senha compatível com a identidade real dos usuários.
- Decidir isolamento multiempresa, auditoria e limites distribuídos antes de
  ampliar acesso.

## Condicionais e decisões adiadas

- Persistir a ordem operacional do atalho `Repetir distribuição` requer coluna e
  migration próprias; não alterar schema sem necessidade confirmada.
- Migration `0014` do Ponto compartilhado continua adiada e fora do journal.
- Heartbeat global do Worker somente se a espera sem diagnóstico justificar;
  lease de tarefa não prova disponibilidade global.
- Importação de planilha, redesign e refatorações amplas sem evidência de ganho
  permanecem fora desta fase.

## Gate operacional

Revisar diff, testes, pacote, saúde em manutenção e reboot antes de liberar uma
nova versão do Worker. Não emitir nem cancelar para demonstrar UX. Manter sempre
separados: código validado, publicação, instalação no PC e confirmação fiscal
em uma operação legítima.
