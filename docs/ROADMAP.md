# Roadmap — NF Distribuição

Atualizado em 17/09/2026. O histórico detalhado e as limitações operacionais
estão no [Handoff](HANDOFF.md). A
[auditoria de lapidação](AUDITORIA-LAPIDACAO-2026-09-09.md) é um diagnóstico
histórico: vários itens apontados nela já foram implementados depois.

## Onde estamos

- Fluxo fiscal conectado, snapshot imutável, idempotência semântica, reserva e
  token fencing.
- Worker coordenado com papel mínimo, manutenção explícita, retomada após lease
  anterior e concorrência segura configurada em 1.
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

## Em andamento imediato

1. **Empacotar e atualizar o Worker do PC servidor**, preservando
   `hold.request`; comprovar saúde em manutenção e repetir o teste de reboot.
2. **Validar operação física segura:** logs, retomada, impressão e estabilidade,
   sem criar emissão artificial em produção.
3. **Primeira operação legítima em produção:** acompanhar uma distribuição real,
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
7. **Média:** paginar Notas por distribuição no servidor e adicionar pesquisa
   objetiva antes do crescimento do histórico; hoje o limite é por nota.

## Depois da estabilização

- Definir o contrato Fiscal → Financeiro e iniciar o novo sistema financeiro.
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
