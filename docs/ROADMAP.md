# Roadmap — NF Distribuição

Atualizado em 09/09/2026. Reconciliação, evidências e limitações em
[Auditoria de lapidação](AUDITORIA-LAPIDACAO-2026-09-09.md).
O histórico de implantação permanece no HANDOFF e no Git; tarefas já concluídas
não são gates futuros. Publicação não é consequência automática de alteração local.

## Entregue anteriormente

- Fluxo fiscal conectado, snapshot/idempotência, reserva e token fencing.
- VM e papel exclusivo; piloto em produção com concorrência 1.
- Storage privado, recuperação por fila própria e cancelamento protegido.
- Correção do incidente de cancelamento, conforme registro `adb82fa` no HANDOFF;
  não reabrir nem repetir cancelamento sem nova evidência e autorização.
- Rascunho, pesquisa de produtos, repetição, resumo pré-envio, preço promocional,
  notas por distribuição, confirmação persistente e impressão compacta.
- Limpeza autorizada de homologação e retirada da exceção para excluir fictícios.

## Unidade local de lapidação — implementada, ainda não publicada

- Saldo de tempo preserva perdas; datas e denominadores inválidos não distorcem médias.
- Benchmark de três notas identificado como comparação exploratória, não prova
  de economia nas demais escalas ou em lotes com produtos diferentes.
- Conferência explicita quantidade faturável e sobra; aceite só quando houver sobra,
  também validado no servidor.
- Ordenação alfabética consistente; tarefas antigas não terminais não desaparecem
  no corte de 100 recentes; recorte das contagens explícito.
- Motivo fiscal sem causa pré-preenchida e mensagem de canceladas corrigida.
- 123 testes Web e build de produção aprovados; sem novo efeito fiscal.

## Próximas unidades, em ordem

1. **Alta:** validar transacionalmente destinos só de troca (vínculo e atividade),
   mantendo separada a exigência de cadastro fiscal para valores faturáveis.
2. **Alta:** ensaiar conferência, sobra e edição após aceite em desktop/celular;
   verificar rascunho e foco no sucesso. Publicar somente depois do gate visual.
3. **Média:** paginar Notas por lote no servidor antes de assinar documentos;
   adicionar pesquisa objetiva e preservar filtros/retorno. Não carregar histórico
   inteiro à medida que cresce.
4. **Alta, analítica:** instrumentar tempos por tentativa e limites de preparação,
   fila, autorização e documentos; coletar referências manuais equivalentes por
   notas/linhas. Não extrapolar 337 segundos para tamanhos diferentes.
5. **Média:** classificação de causa confirmada separada do estado fiscal, com
   evidência e autoria; causa desconhecida por padrão, sem culpabilização automática.
6. **Média:** ensaiar expiração/recuperação e backup/restauração em ambiente seguro;
   medir recursos da VM sob carga real antes de aumentar concorrência.

## Condicionais / fora desta lapidação

- Multiempresa: decidir isolamento por implantação ou tenant, revisar autorização,
  revogação de sessão, auditoria e limites distribuídos antes de ampliar acesso.
- Migration `0014` do ponto compartilhado continua adiada, fora do journal; exige
  coordenação própria. Não misturar com alterações fiscais.
- Heartbeat global do Worker apenas se a espera sem diagnóstico justificar.
  Lease indica tarefa ativa, não disponibilidade geral.
- Importação de planilha, redesign, novas confirmações generalizadas e refatoração
  do Worker sem evidência de ganho: não implementar agora.

## Gate para esta revisão

Revisar diff, testes, build, telas autenticadas e aparelho real; preservar rascunho,
promoção, trocas e idempotência. Não emitir/cancelar para demonstrar UX. Manter
separados: código local validado, publicação e confirmação operacional em produção.
