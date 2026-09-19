# Incidente Produto → ICMS — distribuição 17

## Evidência

Na distribuição 17, quatro notas terminaram autorizadas e com documentos no
Storage. O banco registrou três tentativas que falharam antes da emissão:

- Tino: duas falhas e sucesso na terceira tentativa;
- Amigão 2: uma falha e sucesso na segunda tentativa;
- Max e Amigão 1: sucesso na primeira tentativa.

As três falhas têm o mesmo padrão nos logs do PC servidor: o Worker clicou no
primeiro `Avançar` da etapa de produto e aguardou exatamente dez segundos pela
subetapa de ICMS. O portal não apresentou `Situação Tributária ICMS` dentro do
limite fixo e o Playwright encerrou o preenchimento com `TimeoutError`. Nenhuma
dessas tentativas chegou ao clique de emissão; banco e Storage também não foram
a causa.

## Correção

O Worker conserva a sentinela inicial de dez segundos. Se a Receita ainda não
apresentar o ICMS, registra um aviso de lentidão e aguarda até vinte segundos
adicionais. Nenhum clique é repetido durante essa espera, evitando avançar a
subetapa errada caso a SPA termine a transição tardiamente. Depois de trinta
segundos totais, a falha continua sendo segura e anterior à emissão.

## Validação

Há testes para os três comportamentos:

1. ICMS visível dentro dos dez segundos iniciais;
2. ICMS disponível somente na espera adicional;
3. timeout propagado após as duas janelas.

O efeito em produção deve ser confirmado na próxima distribuição legítima. A
correção reduz a sensibilidade à lentidão observada, mas não transforma falha
indefinida do portal em sucesso presumido.
