# Incidente Web — timeouts e excesso de invocações (13/09/2026)

## Resumo

Entre aproximadamente 21:29 e 21:55 (America/Sao_Paulo), o Web em produção
ficou intermitente depois de um lançamento de troca. O lançamento foi gravado
uma única vez, mas páginas dinâmicas de várias áreas passaram a expirar na
Vercel. O serviço voltou sem deploy ou correção de dados, confirmando que a
indisponibilidade era transitória.

## Evidências observadas

- A Vercel registrou 18 erros `Task timed out after 300 seconds`, atingindo
  `/`, `/login`, `/distribuicao`, `/tarefas`, `/entregas` e `/relatorios`.
- As requisições apareceram em grupos no mesmo segundo para várias rotas,
  inclusive com registros separados para função e middleware.
- No recorte 21:40–22:00 houve 51 chamadas a `/distribuicao`; no recorte
  anterior, 21:20–21:40, houve 85. O número observado no painel não representa
  121 envios: inclui carregamentos GET/RSC, pré-buscas e middleware.
- O Supabase estava saudável após o incidente: nenhuma trava não concedida e
  poucas sessões ociosas. `fiscal.trocas_mercado` continha somente um saldo,
  atualizado às 21:29:43; `fiscal.trocas_lancamentos` estava vazio porque o
  deploy ainda era anterior ao livro idempotente.
- O lançamento terminou antes da tempestade e o sistema voltou com o dado
  preservado. Não há evidência de dado inválido ou query de troca bloqueando o
  banco.

## Causa sustentada e fator ainda não confirmado

O mecanismo demonstrável no código era amplificação de carga:

1. todos os links fixos usavam o prefetch padrão do `next/link`;
2. cada tela é dinâmica e consulta o banco;
3. ao montar a navegação, o cliente podia buscar em paralelo rotas não abertas;
4. cada instância Vercel podia manter até cinco conexões Postgres;
5. a tela de tarefas podia atualizar periodicamente durante uma demora.

Esse conjunto explica os grupos de rotas no mesmo segundo, a multiplicação de
invocações e a falha compartilhada por telas sem relação funcional. A evidência
histórica não prova retrospectivamente se o limite exato foi o pool do Supabase,
uma fila no pooler ou degradação temporária da conexão. A `DATABASE_URL` da
Vercel ainda deve ser conferida sem expor seu valor: produção serverless deve
usar o transaction pooler do Supabase (porta 6543), não conexão direta nem
session pooler.

## Correção local

- `AppNavLink` usa `prefetch={false}`; só a rota escolhida é carregada.
- Postgres usa uma conexão por instância, `idle_timeout` de 5 s e vida máxima
  de 60 s, reduzindo a multiplicação de sessões serverless.
- A atualização automática ganhou trava de requisição em voo.
- O lançamento de troca recebe aviso após 12 s e duração máxima de 30 s. A
  idempotência atual permite tentativa posterior sem duplicar o saldo.
- O formulário passou a mostrar saldo restante do produto em tempo real entre
  mercados e limita os botões ao saldo alocável.

## Impacto de dados

Não foi feita correção, remoção ou repetição de dado real. A evidência indica um
único saldo persistido. Não há sinal de múltiplas distribuições ou efeitos
fiscais provocados pelas invocações GET. Antes de repetir envio incerto, o
operador deve conferir Tarefas e o saldo de Trocas.

## Verificação e publicação

- 157 testes Web aprovados;
- TypeScript aprovado;
- build de produção aprovado com URL local fictícia somente para importação;
- nenhum deploy foi executado nesta investigação.

Após publicar, conferir a `DATABASE_URL`, abrir sequencialmente Início,
Configurações, Produtos, Emitentes e Distribuição e observar os Runtime Logs.
O critério é uma requisição por navegação consciente, sem rajada de todas as
rotas e sem timeouts. Operação real só quando houver necessidade legítima.
