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

## Atualização do KPI abrangente — recorte até 23/09/2026

Uma nova consulta somente de leitura atualizou o recorte para **50 notas de
tarefas concluídas**. Há 42 notas em 14 lotes concluídos na primeira tentativa,
com timestamps válidos; 8 notas concluídas pertencem a lotes reprocessados e
não têm duração vencedora reconstruível. Cinco dos 14 lotes limpos têm 3 notas
(15 notas diretamente comparáveis ao benchmark de escala). As outras 27 notas
estão em 9 lotes limpos, têm tempo observado, mas não benchmark humano da mesma
escala.

O KPI principal agora usa uma aproximação linear provisória para cobrir as 50
notas, mantendo medição e extrapolação diferenciadas:

```text
baseline manual = 50 × (337 / 3) = 5.616,667 s
parede observada = soma das durações dos 14 lotes limpos = 1.559,671 s
vazão observada = 1.559,671 / 42 = 37,135 s por nota (amortizado)
parede estimada para 8 notas sem medição limpa = 8 × 37,135 = 297,080 s
tempo automatizado estimado = 1.559,671 + 297,080 = 1.856,751 s
economia estimada = 5.616,667 - 1.856,751 = 3.759,916 s ≈ 62 min 40 s
```

A interface arredonda o indicador para **≈63 min**; não mostra segundos como se
fossem precisão real. A comparação direta da única escala disponível é um
subconjunto separado: `5 × 337 - 554,952 = 1.130,048 s`, aproximadamente
18 min 50 s para cinco lotes de 3 notas. Esse subconjunto não é somado uma
segunda vez ao total.

`37,135 s/nota` é somente uma taxa de throughput amortizada para estimar o
tempo total de outro volume. Não é latência individual. Se duas notas levam
40 s de parede simultaneamente, o lote observado permanece 40 s; o rate de
20 s por nota só pode ser usado para extrapolar volume semelhante, nunca para
afirmar que cada nota teve latência de 20 s. O relatório continua mostrando
tempo de lote e throughput separadamente. As durações dos 14 lotes limpos não
se sobrepõem entre si neste recorte; retries ficam fora do tempo observado e
entram apenas na estimativa de volume, sem somar intervalos que incluem espera
ou intervenção.

Reprodução agregada no projeto de produção (`t.data` é texto ISO `YYYY-MM-DD`):

```sql
WITH tarefas AS (
  SELECT id, lote_id, status::text AS status, tentativas, iniciado_em, concluido_em
  FROM fiscal.tarefas
  WHERE data >= '2026-08-25' AND data < '2026-09-24'
    AND status::text <> 'CANCELADA'
), lotes AS (
  SELECT COALESCE(lote_id::text, 'tarefa:' || id::text) AS grupo,
         COUNT(*) AS notas,
         BOOL_AND(status IN ('EMITIDA','DOCUMENTOS_ARMAZENADOS')) AS concluido,
         BOOL_AND(tentativas = 1) AS primeira_tentativa,
         MIN(iniciado_em) AS inicio,
         MAX(concluido_em) AS fim
  FROM tarefas
  GROUP BY 1
), medidos AS (
  SELECT *, EXTRACT(EPOCH FROM (fim - inicio)) AS segundos
  FROM lotes
  WHERE concluido AND primeira_tentativa
    AND inicio IS NOT NULL AND fim >= inicio
    AND EXTRACT(EPOCH FROM (fim - inicio)) BETWEEN 0 AND 86400
)
SELECT
  (SELECT SUM(notas) FROM lotes WHERE concluido) AS notas_em_lotes_concluidos,
  (SELECT SUM(notas) FROM medidos) AS notas_medidas,
  COUNT(*) AS lotes_medidos,
  SUM(segundos) AS segundos_parede_lotes,
  COUNT(*) FILTER (WHERE notas = 3) AS lotes_com_3_notas,
  SUM(segundos) FILTER (WHERE notas = 3) AS segundos_parede_3_notas,
  (SELECT SUM(notas) FROM lotes WHERE concluido AND NOT primeira_tentativa)
    AS notas_sem_medicao_limpa
FROM medidos;
```

## Limitações

Os lotes comparáveis possuíam números diferentes de linhas de itens. Igual
quantidade de notas não garante igual trabalho manual. Uma única observação
humana não permite estimar separadamente custo fixo, custo por nota e custo por
item. A extrapolação atual é deliberadamente linear e provisória, não um modelo
estatístico validado. Substituir os parâmetros somente após o benchmark descrito
em `PROTOCOLO-BENCHMARK-MANUAL.md`.
