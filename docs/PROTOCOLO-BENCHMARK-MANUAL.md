# Protocolo curto para o próximo benchmark manual

Objetivo: comparar trabalho manual e automático equivalente sem transformar a
medição em um experimento pesado.

## Antes

1. Escolher uma distribuição legítima e anotar somente seu número interno.
2. Registrar: quantidade de notas, linhas de produto, produtos distintos,
   emitentes e operador.
3. Usar dados já preparados nos dois métodos. Preparação anterior fica fora ou
   é cronometrada separadamente.

## Cronometragem

1. Iniciar antes do login/primeira ação fiscal.
2. Encerrar na autorização da última nota.
3. Registrar separadamente espera de fila, download/armazenamento e intervenção
   humana.
4. Anotar pausas externas, erros e retrabalho; não apagar uma medição ruim.
5. Quando viável, comparar o mesmo conjunto de trabalho manual e automático.

## Amostra mínima útil

- Repetir algumas vezes em escalas comuns, idealmente 1, 2, 3 e 4/5 notas.
- Variar deliberadamente o número de linhas para não confundir notas com
  complexidade.
- Guardar observações brutas e a versão deste protocolo.

## Recalibração

Para cada observação, registrar operador, início/fim, notas, linhas de produto,
produtos distintos, emitentes, concorrência do Worker, pausas e retrabalho.
Comparar o mesmo conjunto quando viável. Separar duração total de parede do
lote (latência operacional) de soma de notas por minuto (throughput); não
converter throughput em latência individual.

O KPI atual usa provisoriamente 337 s/3 notas como baseline manual linear e a
vazão histórica dos lotes limpos para extrapolar o tempo agregado das notas sem
medição. Não interpretar o rate amortizado como duração de uma NF individual.
Com novas medições, primeiro substituir o benchmark por amostras comparáveis
repetidas nas escalas comuns; reportar mediana/faixa e tamanho da amostra. Só
avaliar `tempo = custo fixo + custo por nota + custo por linha` quando houver
variação independente e amostra suficiente. Não incluir taxa hipotética de erro
humano; guardar falhas e retrabalho como observações separadas.

Um futuro ensaio de throughput fiscal deve ocorrer somente em homologação
controlada e comparar concorrências 1, 2 e 3 (eventualmente maiores em outra
etapa), registrando tempo de parede por lote, notas/minuto, CPU, memória e erros.
Esse laboratório não faz parte da implementação atual nem autoriza emissão
artificial em produção.
