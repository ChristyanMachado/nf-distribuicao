# Descobertas para produtos futuros

Status: **necessidades e ideias futuras — não implementar agora no NF
Distribuição**, exceto agregações simples explicitamente delimitadas abaixo.

## Fronteira atual do NF Distribuição

Pertencem ao produto atual: distribuição, roteiro de entrega, notas, trocas e
inteligência simples derivada diretamente dessas operações. Nesta etapa entram
filtros temporais, valores registrados, comparações por mercado/produto,
reposições usadas por mercado e histórico observado de quantidades.

Não pertencem ao escopo atual: lucro, fluxo de caixa, estoque disponível,
entradas, perdas, produção plantada, previsão garantida ou planejamento
agrícola completo.

## Financeiro / Auditor Fiscal

Necessidades preservadas:

- trocas por mercado como sinal para futura análise de rentabilidade;
- relação entre distribuição física, fechamento fiscal, nota, recebimento e
  custos;
- conciliação de receitas, pagamentos, descontos e despesas;
- uso futuro de lote, mercado, produto, quantidades normal/troca, preço,
  tarefa, nota, status fiscal e datas de distribuição/emissão originados no NF
  Distribuição.

Regra semântica: quantidade ou valor de troca isolado não prova lucro ou
prejuízo. Essa conclusão exige receita, custos e demais eventos financeiros.

## Estoque

Necessidades preservadas:

- disponibilidade física real por produto;
- entradas por produção própria e compra;
- saídas, ajustes, perdas e armazenamento;
- integração com as quantidades distribuídas sem duplicar o conceito de
  distribuição.

O NF Distribuição conhece saídas planejadas/registradas, mas isso não basta para
afirmar o estoque atual.

## Produção rural e planejamento de culturas

Necessidades preservadas:

- registrar plantio, cultura, data/ciclo e quantidade plantada;
- registrar colheita, quantidade efetiva e perdas;
- comparar produção, estoque e uso histórico por produto;
- estudar sazonalidade apenas quando houver histórico suficiente;
- usar demanda observada como apoio ao planejamento, não como previsão
  garantida.

O NF Distribuição entrega agora somente o sinal que possui: histórico da
quantidade registrada por produto ao longo do tempo, com médias simples e
identificação clara do período.

## Integração futura

A arquitetura técnica definitiva não está decidida. Os módulos devem conservar
identificadores estáveis e semântica clara para permitir integração posterior,
mas cada novo domínio continuará com regras, dados e valor comercial próprios.
