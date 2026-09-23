# Auditoria das métricas de eficiência — 23/09/2026

## Resultado reproduzido

No período padrão de 30 dias (`2026-08-25` a `2026-09-23`), o banco contém
19 lotes. Três deles (#6, #8 e #14) possuem somente tarefas canceladas antes da
emissão e não entram na população operacional. Restam 16 distribuições:

- 13 concluídas na primeira tentativa e com timestamps válidos;
- 4 com exatamente 3 notas, única escala que possui benchmark manual;
- 9 medidas, mas sem benchmark da mesma escala;
- 3 excluídas da velocidade por reprocessamento.

O benchmark manual cadastrado é uma única observação de 337 segundos para um
lote de 3 notas. A fórmula implementada é:

`saldo = soma(337 s - duração de parede do lote automático comparável)`

| Distribuição | Duração automática | Saldo |
| --- | ---: | ---: |
| 2 | 184,203 s | 152,797 s |
| 7 | 70,243 s | 266,757 s |
| 13 | 83,275 s | 253,725 s |
| 18 | 128,402 s | 208,598 s |
| **Total** |  | **881,877 s ≈ 14 min 42 s** |

A interface anterior truncava a apresentação para minutos inteiros e exibia
`14 min`. Portanto, o resultado estava matematicamente correto. Conceitualmente,
ele é somente o saldo dos quatro lotes comparáveis, não a economia total das 16
distribuições.

## Reconciliação de estados

- 52 tarefas: 47 concluídas e 5 canceladas antes de emitir;
- 47 notas registradas: 45 autorizadas ativas e 2 canceladas após a emissão;
- 54 reservas acumuladas nas 47 tarefas válidas;
- 7 reservas adicionais em 5 tarefas reprocessadas;
- 0 tarefa em erro final no momento da consulta.

Uma reserva adicional comprova retrabalho, mas não prova um erro distinto. O
banco atual não mantém duração e resultado estruturados de cada tentativa.

## Semântica adotada

- **Tempo automatizado observado:** duração de parede do primeiro início à
  última autorização do lote. Não inclui espera anterior na fila nem upload.
- **Tempo manual de referência:** medição humana explicitamente cadastrada para
  uma escala e protocolo determinados.
- **Tempo economizado estimado:** referência manual comparável menos duração
  automática observada, com valores negativos preservados.
- **Throughput:** notas concluídas divididas pelo tempo de parede acumulado dos
  lotes medidos.
- **Tempo amortizado por nota/item:** tempo de parede do lote dividido pelas
  unidades do lote. Não é latência individual.
- **Latência individual:** ainda não pode ser reconstruída de forma confiável
  com a agregação atual.

Concorrência reduz a duração de parede do lote e aumenta throughput sem provar
que cada nota individual ficou proporcionalmente mais rápida.

## Consulta de reconciliação

```sql
WITH v AS (
  SELECT *, coalesce(lote_id::text, 'tarefa:' || id::text) AS grupo
  FROM fiscal.tarefas
  WHERE data BETWEEN '2026-08-25' AND '2026-09-23'
    AND status::text <> 'CANCELADA'
), l AS (
  SELECT grupo,
         count(*) AS notas,
         bool_and(status::text IN ('EMITIDA','DOCUMENTOS_ARMAZENADOS')) AS concluido,
         bool_and(tentativas = 1) AS primeira,
         bool_and(iniciado_em IS NOT NULL AND concluido_em IS NOT NULL
                  AND concluido_em >= iniciado_em) AS tempos,
         extract(epoch FROM max(concluido_em) - min(iniciado_em)) AS segundos
  FROM v
  GROUP BY grupo
)
SELECT count(*) AS lotes,
       count(*) FILTER (
         WHERE concluido AND primeira AND tempos AND segundos BETWEEN 0 AND 86400
       ) AS medidos,
       count(*) FILTER (
         WHERE concluido AND primeira AND tempos AND segundos BETWEEN 0 AND 86400
           AND notas = 3
       ) AS comparaveis,
       round(sum(337 - segundos) FILTER (
         WHERE concluido AND primeira AND tempos AND segundos BETWEEN 0 AND 86400
           AND notas = 3
       )) AS economia_segundos
FROM l;
```

Resultado observado: `16 lotes / 13 medidos / 4 comparáveis / 882 segundos`.

## Limitações

Os quatro lotes comparáveis possuíam de 6 a 13 linhas de itens. Igual quantidade
de notas não garante igual trabalho manual. Uma única observação humana não
permite estimar separadamente custo fixo, custo por nota e custo por item. Até
novas medições, não extrapolar 337 segundos para outras escalas.
