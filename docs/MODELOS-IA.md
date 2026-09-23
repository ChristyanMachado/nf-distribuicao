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

## DeepSeek Flash: protocolo de entrega

O DeepSeek deve ser usado intensivamente em tarefas delimitadas, mas o esforço
de raciocínio não pode consumir todo o orçamento antes do artefato. Padrão do
projeto:

| Situação | `reasoning` | Saída sugerida |
| --- | --- | --- |
| Transformação mecânica, testes explícitos, boilerplate | `none` | 6k–12k |
| Implementação normal ou revisão focada | `low` | 12k–16k |
| Investigação difícil ou plano arquitetural delimitado | `high` | 24k |
| Caso excepcional, já comprovadamente difícil | `max` | 32k |

Antes de delegar:

1. enviar somente arquivos e contratos necessários, nunca `.env`, credenciais
   ou dados reais;
2. dividir a tarefa se ela atravessar mais de três arquivos sem um contrato
   simples;
3. pedir um artefato concreto: patch, testes, achados ou plano;
4. exigir `# ARTEFATO`, arquivos/diff, testes, riscos e `FIM_DO_ARTEFATO`;
5. dizer que, se o orçamento apertar, deve entregar resultado parcial marcado
   `PENDENTE`, nunca terminar apenas com raciocínio.

Se a chamada gastar todo o orçamento e não produzir resposta visível, ela
falhou. Não repetir a mesma chamada. Fazer uma única recuperação com:

- `high`/`low` convertido para `low`/`none`;
- contexto reduzido em 30%–50%;
- “artefato primeiro” no início do pedido;
- orçamento de saída igual ou maior;
- uma função, arquivo ou responsabilidade por chamada.

O caso de 23/09/2026 confirmou a diferença: uma tentativa `low`, com contexto
amplo, consumiu 14 mil tokens de raciocínio e não entregou texto; a repetição
correta em `none`, contexto reduzido e diff primeiro terminou em cerca de 7,5 s,
com 2.180 tokens de saída e zero tokens de raciocínio. Portanto, `none` é o
padrão preferido para testes cujo comportamento já foi definido pelo Lead.

Em paralelo, separar responsabilidades: um worker implementa, outro procura
casos de borda e um terceiro revisa apenas quando isso reduz retrabalho. O Lead
continua responsável por integração, segurança, testes e decisão final.
