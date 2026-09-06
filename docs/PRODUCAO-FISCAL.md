# Transição fiscal para produção

Este documento é o roteiro operacional do primeiro piloto com validade fiscal.
Ele complementa `DEPLOYMENT.md` e não autoriza, por si só, nenhuma emissão ou
cancelamento real.

## O que o código diferencia

| Ambiente | Caminho de emissão | Caminho de consulta | Host final |
| --- | --- | --- | --- |
| `teste` | Produtor Rural → NFP-e → NFP-e TESTES → Emissão - TESTE | Produtor Rural → NFP-e → NFP-e TESTES → Consulta - TESTE | `homologacao.nfae.fazenda.pr.gov.br` |
| `normal` | Produtor Rural → NFP-e → Emissão | Produtor Rural → NFP-e → Consulta | `nfae.fazenda.pr.gov.br` |

A emissão normal e seu seletor `#menuLink1119` já constavam do reconhecimento
manual. A consulta normal é localizada por papel e texto exato `Consulta`, sem
depender de um id numérico de menu; seu `href` precisa apontar para
`https://nfae.fazenda.pr.gov.br/nfae/produtor/consulta`. Em 06/09/2026, um
ensaio local estritamente de leitura confirmou ao vivo esse caminho, o host de
produção, a seleção do emitente e o filtro vazio, sem pesquisar, emitir ou
cancelar nota.

## Barreiras contra troca acidental de ambiente

1. O Web grava `ambiente` no snapshot imutável da tarefa no momento em que a
   distribuição é confirmada.
2. O Worker só reserva/processa snapshots cujo ambiente coincide com sua
   configuração.
3. Antes de `Emitir`, durante a confirmação de autorização e antes de
   `Confirmar` um cancelamento, a origem HTTPS e a rota da página são
   revalidadas contra o ambiente do snapshot.
4. Homologação e produção têm flags mutuamente exclusivas. Produção exige fila
   do banco, modo automático e concorrência 1 no piloto.
5. O Web mostra permanentemente o selo **Teste** ou **Produção** no cabeçalho.

## Cancelamento real

Cancelar uma nota continua sendo uma decisão humana. O usuário abre a nota no
Web, escolhe cancelar, revisa ou edita o motivo e confirma o formulário. Só
essa confirmação cria a solicitação na fila. O Worker não varre notas para
cancelá-las e não cria solicitações sozinho.

No portal, o Worker pesquisa a chave, evita reenviar o comando quando a linha
já estiver `Cancelada`, preenche o motivo e confirma. Sucesso só é gravado após
a prova oficial `Evento registrado e vinculado a NF-e`. Resultado ambíguo vai
para conferência e nunca é repetido automaticamente. A tarefa de emissão
permanece concluída; apenas a nota e a fila de cancelamento mudam de estado.

## Configuração do piloto

No Vercel, para novas distribuições reais:

```dotenv
AMBIENTE_EMISSAO="normal"
```

Na VM, além das configurações de banco, Storage e credenciais já existentes:

```dotenv
AMBIENTE_EMISSAO="normal"
HABILITAR_PRODUCAO_FISCAL="true"
TESTAR_EMISSAO_HOMOLOGACAO="false"
FONTE_TAREFAS="banco"
TESTAR_INTEGRACAO_BANCO="true"
PROCESSAR_FILA_BANCO="true"
TESTAR_NAVEGACAO_EMISSAO="true"
TESTAR_PREENCHIMENTO_COMPLETO="true"
MODO_OPERACAO="automatico"
MAX_CONCORRENCIA="1"
WORKER_PERSISTENTE="true"
HEADLESS="true"
INSPECIONAR="false"
PROCESSAR_CANCELAMENTOS_FISCAIS="true"
```

Não manter `teste` no Web e `normal` no Worker, nem o inverso. Tarefas antigas
preservam o ambiente com que foram criadas e não são convertidas por uma troca
de variável.

## Ordem segura da virada

1. Confirmar que não há emissão, recuperação ou cancelamento em andamento.
2. Publicar e instalar a mesma revisão no Web e na VM, ainda em homologação.
3. Confirmar a evidência da prova de leitura já concluída: login → Produtor
   Rural → NFP-e → Consulta, sem pesquisa nem efeito fiscal.
4. Parar o Worker.
5. Alterar o Vercel para `AMBIENTE_EMISSAO=normal` e fazer novo deploy.
6. Confirmar visualmente o selo **Produção** antes de criar uma distribuição.
7. Alterar a VM para as variáveis do piloto, validar a configuração e iniciar o
   Worker. Conferir healthcheck e logs sem criar trabalho automaticamente.
8. O operador cria conscientemente uma única distribuição real, de baixo
   risco, e confere destinatário, itens, quantidades e valores antes do envio.
9. Acompanhar os estados `PENDENTE` → `PROCESSANDO` → `EMITINDO` → `EMITIDA`,
   abrir XML/DANFE e conferir a nota diretamente no portal.
10. Só depois dessa prova liberar o uso diário. Cancelamento real deve ter um
    teste separado, iniciado e confirmado pelo operador em uma nota apropriada.

## Parada e reversão

Se houver divergência antes de `EMITINDO`, parar o Worker e voltar os dois
ambientes para `teste`. Se o log indicar `EMITINDO`, autorização incerta ou
confirmação de cancelamento enviada, não reenfileirar e não repetir: conferir a
situação diretamente na Receita. Snapshots `normal` já criados não devem ser
alterados para `teste`; ficam aguardando decisão operacional explícita.

## Evidência exigida para declarar concluído

- testes automatizados e build aprovados;
- Web e VM na mesma revisão;
- selo do Web coerente com o ambiente;
- consulta normal aberta no host esperado em ensaio somente de leitura;
- uma emissão real criada conscientemente pelo operador e conferida ponta a
  ponta;
- logs sanitizados, XML/DANFE válidos e retorno correto ao Web;
- nenhuma repetição automática de resultado fiscal incerto.
