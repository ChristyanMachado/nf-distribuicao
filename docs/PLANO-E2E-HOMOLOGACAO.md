# Plano de conclusão do E2E — 14/09/2026

Destino exclusivo: `szakgftippcqtuqwxsox` (nf-distribuicao-homologacao).
Produção e Ponto não participam. Nenhum passo remoto abaixo foi executado nesta
rodada. O teste de portal em arquivo é apenas a primeira camada.

## 1. Atualizar o QA sem reset

Conferir o journal Drizzle remoto e os hashes da baseline antes de aplicar,
na ordem do journal local:

1. `0016_workers_coordenados` — manter coordenação desligada.
2. `0016_trocas_mercado`.
3. `0017_impressao_roteiros`.
4. `0018_idempotencia_semantica_lotes`.
5. `0019_livro_idempotente_trocas`.

Não reaplicar baseline nem executar `0014`. A migration 0017 concede permissões
a `nf_worker_local` e `nf_worker_vm`; verificar existência desses papéis no QA
antes de aplicar. Se ausentes, preparar revisão específica que torne esses
grants condicionais. Não criar contas operacionais de produção no QA somente
para satisfazer o SQL. Registrar o SQL efetivamente aplicado e sua diferença
em relação ao journal; não marcar um hash original como aplicado se foi alterado.

O Web usa `nf_homologacao_web`. Conceder o necessário nas tabelas novas e
`SELECT` em `worker_status`. Nas tabelas com RLS, grants sozinhos não bastam:
políticas restritas ao papel Web devem permitir suas operações. Conferir as
consultas reais antes de definir políticas. Não conceder reserva de tarefa ao
Web nem acesso fiscal a `anon`/`authenticated`.

## 2. Provar primeiro o envio Web → banco

Na pasta web, `npm run test:integration` carrega somente a configuração QA.
Os testes exercitam a Server Action e transações reais, usando as mesmas opções
Postgres do runtime (`src/db/connection-options.ts`). Sessão e cache Next são
substituídos. Validar 1/3/5 destinos, reenvio idêntico, mudança de conteúdo com a
mesma chave, troca integral e rollback. Os saldos preparados pelo ensaio são
desfeitos junto com a transação; sequências podem avançar.

Isso não testa o clique no navegador. Depois executar o Web QA em build de
produção local (`homologacao:build` / `homologacao:start`) e automatizar o fluxo
de login, seleção de mercado/produto, sobras e Processar distribuição. Guardar
o ID retornado e verificar uma única distribuição/tarefa, inclusive em reenvio.
O erro #441 exige essa camada de navegador/Server Action, além do teste fiscal.

## 3. Integrar Worker e Storage de QA

Criar bucket privado `documentos-fiscais` exclusivamente no QA, com limite de
20 MiB e MIME PDF/XML. Provisionar papel `nf_homologacao_worker` com grants de
fila/nota mínimos, sem INSERT em tarefas, acesso a cadastros ou ao Ponto. Usar
senha gerada e guardada fora de SQL versionado, chat e logs. Auditar os grants
com o script existente do Worker.

As fixtures `QA_SEM_CREDENCIAL_*` e códigos `QA-*` atuais não servem para emitir.
Preparar um destino exclusivo com dados aceitos pelo portal de homologação e
credencial fiscal autorizada. Não copiar a base real inteira para o QA.

O Web QA hoje recusa qualquer segredo de Storage; ampliar essa guarda somente
para a etapa E2E explícita, preservando a validação do ID do projeto. O Worker
deve recusar URL de banco/Storage de outro projeto e exigir ambiente teste.
Nunca reutilizar o launcher de contingência de produção para essa execução.

## 4. Critério de aprovação do circuito completo

Uma execução manual inicia no navegador, cria um lote identificado e entrega
apenas sua tarefa ao Worker QA. Antes de consumir, exigir que não existam outras
tarefas elegíveis; uma fila compartilhada não é uma seleção de lote.

Confirmar: autorização, chave/protocolo persistidos, XML com ambiente 2,
quantidades/preços/total correspondentes ao formulário, PDF disponível, hashes
dos arquivos locais/remotos iguais, tarefa finalizada e download pelo Web.
Uma falha após emissão não pode repetir a emissão automaticamente. Preservar os
artefatos da tentativa para diagnóstico; qualquer limpeza deve selecionar apenas
os IDs daquele ensaio. Sem agendamento até essa execução manual ser comprovada.

## Estado atual

- Comando de portal em arquivo implementado; ensaio ao vivo pendente.
- Configuração Postgres compartilhada pelo runtime e testes de integração.
- Testes de integração atualizados, ainda sem execução contra o QA atualizado.
- Banco/Storage/credenciais e teste de navegador completo pendentes.

Referência de isolamento:
https://supabase.com/docs/guides/deployment/managing-environments
