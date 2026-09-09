# Homologação isolada

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
