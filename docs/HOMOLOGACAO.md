# Homologação isolada

## Provisionamento concluído; conexão pendente — 14/09/2026

A nova tentativa de `qa_permissoes_worker_web_storage` foi aplicada e conferida.
Bucket `documentos-fiscais` privado, 20 MiB, PDF/XML; papel
`nf_homologacao_worker` criado NOLOGIN, sem superuser, criação de papéis,
bypass RLS, DELETE de notas ou leitura de emitentes. Reserva disponível apenas
ao Worker; Web não pode reservar. anon/authenticated sem USAGE fiscal.
Advisor de segurança retornou zero lints; tarefas/notas continuam em zero.

Integração com a configuração local existente foi tentada: após liberar a rede
do sandbox, o pooler respondeu `(ENOTFOUND) tenant/user ... not found` nos sete
cenários, antes das consultas. Não são testes aprovados. Confirmar host/porta
em Connect do projeto QA; não adivinhar hosts de outros projetos. Senha/LOGIN
do Worker e chave Storage de QA ainda precisam de provisionamento protegido.
O bloqueio de uso descrito abaixo foi superado; não reaplicar a migration.

## Atualização autorizada aplicada — 14/09/2026

Aplicada `qa_atualizacao_fiscal_0016_0019` exclusivamente no QA. Verificação
posterior confirmou 20 entradas Drizzle, tabelas de coordenação/trocas/impressão
presentes, gate desligado e zero tarefas/notas. A 0014 permanece excluída.
A 0017 usa grants condicionais porque os papéis legados não existem no QA;
o journal registra o hash do SQL efetivamente aplicado, não o original.

Pendente: `web/scripts/qa-permissoes-e-storage.sql`. A chamada para criar papel,
políticas e bucket foi rejeitada pelo revisor automático por limite de uso,
antes da aplicação. Consulta posterior confirmou papel e bucket ausentes.
A autorização do usuário já existe e não precisa ser solicitada novamente;
retomar a chamada normal após liberação do serviço, sem contornar a rejeição.
Senha/LOGIN do papel e credenciais Storage ainda precisam ser provisionados
por canal protegido antes do teste completo. Produção não foi alterada.

## Auditoria para sentinela E2E — 14/09/2026

Consulta somente leitura confirmou o projeto `szakgftippcqtuqwxsox` como
`ACTIVE_HEALTHY`, em São Paulo, ainda com zero tarefas/notas e zero objetos ou
buckets no Storage. O schema remoto termina na base equivalente a `0015`: não
possui `fiscal.workers`, `fiscal.trocas_mercado`, fila de impressão,
`trocas_lancamentos` nem `lotes_distribuicao.payload_hash`. Também não existe
papel de Worker QA. Portanto, ainda não é seguro apontar o Worker de fila para
esse ambiente.

O inventário automático alertou que as tabelas fiscais não usam RLS. A
verificação efetiva de privilégios mostrou, porém, que `anon`, `authenticated`
e `service_role` não possuem `USAGE` no schema fiscal nem `SELECT`/`UPDATE` nas
tabelas conferidas; o advisor oficial não retornou lint. Não há exposição atual
por esses papéis, mas RLS permanece uma defesa em profundidade a ser planejada
com políticas compatíveis — não habilitar isoladamente, pois bloquearia o Web.

O primeiro estágio da sentinela, documentado em `SENTINELA-HOMOLOGACAO.md`, já
certifica portal real de homologação + XML/DANFE sem banco. Para o segundo
estágio, nesta ordem: alinhar migrations do QA (mantendo `0014` excluída), criar
bucket privado, provisionar papel exclusivo de Worker QA com privilégio mínimo,
auditar canal/grants, publicar Web QA e só então ensaiar uma única distribuição
identificável. Cada mudança remota requer autorização e verificação próprias.

## Estado em 09/09/2026

Parcialmente preparada; não publicada e ainda não validada ponta a ponta.

- Produção preservada: projeto `kcukzbszakwrfhbsiihw`, VM e Vercel existentes.
- Novo projeto: `nf-distribuicao-homologacao`, ID `szakgftippcqtuqwxsox`, região
  São Paulo, organização escolhida pelo responsável. Ferramenta informou US$ 0/mês
  para criação; não é promessa de ausência de limites ou custos futuros de uso.
- Baseline aplicada com as 15 entradas do journal Drizzle (0000–0013 e 0015).
  0014 excluída. Histórico Drizzle preservado com hashes dos arquivos locais;
  aplicar novas migrations só após conferir destino, journal e diff.
- Antes do seed: consulta confirmou 15 migrations, zero notas/tarefas e ausência
  de USAGE em fiscal para anon/authenticated.
- Seed executado: 5 clientes fictícios, 2 emitentes fictícios, 26 produtos e seus
  vínculos. Reexecução é idempotente por IDs. Consulta posterior confirmou 5/2/26
  cadastros, 10 vínculos, zero notas/tarefas, papel limitado e sem reserva do Worker.
  Advisor de segurança retornou lista vazia; isso não é certificação de segurança.
- Papel `nf_homologacao_web` criado com login e sem superuser/criação de papéis,
  bancos ou bypass RLS; DML fiscal e DELETE apenas de vínculos. Sem grant de
  execução da reserva do Worker. Segredos aleatórios guardados exclusivamente
  em `web/.env.homologacao.local`, ignorado pelo Git.
  O texto do provisionamento inicialmente continha a senha literal no histórico
  administrativo; ela foi removida desse registro específico, preservando versão,
  nome, permissões e o papel ativo. Para reproduzir o papel, gerar outra senha
  fora de migrations; nunca copiar o segredo para arquivo versionado. Logs do
  provedor não foram apagados nem considerados livres de segredos por essa limpeza.
- Banco direto não resolveu no DNS; tentativa no pooler regional conhecido
  retornou tenant/user não encontrado. Confirmar host/porta em Connect do novo
  projeto; não testar outros projetos nem substituir a URL pela de produção.
- Nenhum Worker de QA iniciado, nenhuma credencial fiscal copiada, nenhuma nota
  emitida. Sem Storage API nesta fase: arquivos reais não são copiados ou assinados.
  Bucket/API de documentos e Supabase Auth ainda não estão preparados para QA.
- Docker local instalado, mas incapaz de iniciar; não houve reparo de Docker/WSL
  nem mudança na VM para contornar isso.
- 146 testes Web, 17 verificações de configuração e build de homologação no
  diretório separado aprovados. Foco pós-envio implementado, ainda sem prova visual.

## Decisão de isolamento

Mesmo código e migrations; dados, login e banco separados. `AMBIENTE_EMISSAO`
identifica destino fiscal, não separação de infraestrutura. Não usar schema de
teste dentro do projeto de produção como substituto desta separação.

O primeiro ambiente testa Web + Postgres sem Worker. Para provar o fluxo fiscal,
será necessário outro ensaio autorizado, em Receita homologação, com execução e
volumes separados. Configuração desta fase recusa credenciais de Worker/Storage.
O login de QA é administrativo, não prova integração com Supabase Auth/Ponto.

## Execução local

Na pasta `web`, depois de confirmar a conexão de QA:

```powershell
npm run test:safety
npm test
npm run test:integration
npm run homologacao:build
npm run homologacao:dev
```

Site local previsto: `http://127.0.0.1:3200`. Login obrigatório e faixa HOMOLOGAÇÃO.
O launcher carrega somente `.env.homologacao.local` e neutraliza valores que o
Next herdaria dos arquivos habituais. Nenhum `.env` de produção é editado.
Build fica em `.next-homologacao`, separado do `.next` habitual.

Guardas no início do servidor, na abertura do banco e no preflight: recusam
projeto diferente do ID autorizado, usuário incorreto no pooler compartilhado,
Storage de outro projeto, login desligado e ambiente fiscal normal. Preview
sem isolamento é recusado. Desenvolvimento explícito ligado ao projeto conhecido
de produção também é recusado; configuração habitual de produção não foi migrada.
Essas guardas protegem este aplicativo, não impedem um administrador de usar uma
ferramenta externa com outras credenciais. Não existe comando automático de reset.

## Testes de integração

`web/integration/distribuicao.integration.test.ts` usa consultas, transações,
savepoints e geração de contrato reais. Apenas sessão/cache do Next são substituídos.
Verifica lotes de 1/3/5 tarefas, idempotência, troca integral, rollback após vínculo
ausente e ausência de permissão de reserva pelo Web. Os ensaios de escrita estão
envolvidos por rollback; sequências podem avançar mesmo com rollback no Postgres.
Nada disso deve ser usado como benchmark de desempenho da automação fiscal.

Não roda dentro de `npm test`; comando separado exige o projeto autorizado antes
de abrir conexão. Ainda não executado com sucesso: conexão pendente. Não substituir
por mocks e declarar prova de rollback real. Os testes unitários continuam úteis,
mas medem outra camada.

## Publicação de QA e passagem para produção

Falta confirmar conexão e configurar um site de homologação com estas variáveis
exclusivas. Não modificar os segredos Production do site existente. Não promover
um artefato de QA com credenciais/identificação de homologação para uso real.

Depois: conferir login, montagem, envio fictício, feedback e rascunho em navegador
e aparelho real; revisar diff; autorizar publicação da revisão em produção com as
variáveis próprias. Migration e rollback de dados exigem plano específico;
rollback de Web não desfaz efeitos fiscais. Não usar a produção como teste.
