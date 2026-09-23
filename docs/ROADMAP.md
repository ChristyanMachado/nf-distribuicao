# Roadmap — NF Distribuição

Atualizado em 22/09/2026. O histórico detalhado e as limitações operacionais
estão no [Handoff](HANDOFF.md). A
[auditoria de lapidação](AUDITORIA-LAPIDACAO-2026-09-09.md) é um diagnóstico
histórico: vários itens apontados nela já foram implementados depois.

## Auditoria de eficiência — 23/09/2026

- A decomposição factual do saldo de 14 minutos está registrada em
  [AUDITORIA-METRICAS-EFICIENCIA-2026-09-23.md](AUDITORIA-METRICAS-EFICIENCIA-2026-09-23.md).
- O próximo benchmark deve seguir
  [PROTOCOLO-BENCHMARK-MANUAL.md](PROTOCOLO-BENCHMARK-MANUAL.md).
- Não extrapolar o único benchmark de 3 notas até haver amostra suficiente.

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
- A versão Web `b8d5746` está em `main` e produção; `2bd469e`, também marcado
  pela tag `web-prod-stable-20260922`, permanece como rollback conhecido.
- O tempo economizado é dinâmico: usa durações reais dos lotes limpos e só
  compara escalas que possuam benchmark humano validado. O KPI voltou a ficar
  visível; hoje a única referência é 337 s para exatamente 3 notas.

## Em andamento imediato

1. **Confirmar e aplicar a migration `0020_retry_automatico_pre_emissao.sql`**
   no projeto correto antes de publicar o Worker que usa o retry; não instalar
   `3592bd5` ou posterior sem esse pré-requisito confirmado.
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
4. **Média:** ensaiar concorrência 2 depois de confirmar isolamento e estabilidade
   no PC servidor; concorrência 1 permanece o padrão seguro.
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
