# Guia de escolha de modelo — Graalyst

Recomendação prática em 05/09/2026, não benchmark comparativo do projeto.
Fontes consultadas com OpenAI Docs:
- https://developers.openai.com/api/docs/models
- https://learn.chatgpt.com/docs/pricing

## Regra de recomendação ao usuário

Ao receber novo pedido, indicar brevemente modelo + intensidade + motivo.
Exemplo: “Modelo indicado: Terra médio — alteração delimitada em UI existente.”
Não interromper o trabalho esperando troca, nem afirmar ter trocado o modelo.
Evitar repetir a recomendação a cada mensagem dentro da mesma tarefa, salvo
se risco/escopo mudar. Recomendação não autoriza subagentes automaticamente.

## Manual prático

| Trabalho | Ponto de partida |
| --- | --- |
| Texto, rótulo, documentação pontual, edição mecânica | Luna baixo |
| UI localizada, filtro, teste com requisito explícito | Luna médio |
| Correção delimitada com vários casos de borda | Luna alto ou Terra médio |
| Funcionalidade comum, formulário, relatório | Terra médio |
| Integração de vários módulos com contrato definido | Sol médio |
| Bug ambíguo, concorrência, integridade fiscal | Astra médio |
| Arquitetura do financeiro e avaliação de legado | Astra médio, alto se necessário |
| Cancelamento fiscal, segurança e liberação para produção | Astra alto para revisão |

Luna Max é opção para problema bem delimitado que exige mais raciocínio;
não assumir equivalência a Sol/Astra nem usá-lo como padrão para toda tarefa.
Baixo: trabalho claro e simples. Médio: padrão. Alto: ambiguidade e risco.
Max/Ultra: reservar para dificuldade comprovada, não usar como ritual.

## Eficiência

- Medir tarefas corretas entregues, não só tokens ou velocidade da resposta.
- Evitar “melhore tudo”; delimitar objetivo, restrições e critério de aceite.
- Após tentativas sem nova evidência, consolidar diagnóstico antes de escalar.
- Contexto atual curto + histórico consultável; Graphify seletivo conforme regra.
- Janela de uso de cinco horas não é janela de contexto. Consumo depende do
  modelo, raciocínio, tamanho do contexto e trabalho executado. Preços de API
  e créditos não permitem prometer duração exata do limite da assinatura.
- Validar a estratégia em tarefas comparáveis antes de afirmar economia percentual.

O guia não substitui testes ou revisão humana das decisões fiscais.
