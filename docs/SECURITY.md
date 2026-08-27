# Segurança — NF Distribuição

<<<<<<< HEAD
## Controles implementados

### Web

- sessão administrativa HMAC com duração curta e cookie seguro;
- bloqueio por inatividade e logout;
- produção fecha quando a autenticação não está configurada;
- Server Actions sensíveis exigem sessão novamente;
- validação e limites para texto, UUID, CNPJ, CEP, IE, números e lote;
- cabeçalhos CSP/anti-frame/nosniff/referrer e HSTS em produção;
- URLs de documentos restritas a hosts de Storage permitidos;
- respostas administrativas sem cache e páginas sem indexação.

Essa autenticação é adequada apenas ao piloto de um administrador. Não
substitui identidade multiusuário, papéis, tenant e RLS.

### Banco e fila

- TLS obrigatório;
- lote idempotente;
- snapshot imutável + SHA-256;
- reserva atômica por `SKIP LOCKED`, token UUID e lease de 60–3600 s;
- token fencing em renovação e status;
- função de reserva sem `EXECUTE` público;
- unicidade de nota/tarefa e chave de acesso;
- protocolo e prova fiscal persistidos;
- incerteza pós-clique nunca retorna automaticamente à fila.

### Worker

- somente Playwright Async e contextos isolados;
- host HTTPS de homologação revalidado no clique fiscal;
- credenciais resolvidas por referência fora do Web;
- logs sanitizados, rotacionados e sem dados fiscais brutos;
- mensagens de banco limitadas e sem CR/LF;
- XML e PDF validados antes de sucesso;
- diretório/arquivos privados e recusa de link simbólico;
- configuração não revela URL do banco em `repr`.

## Riscos que ainda bloqueiam produção

1. Criar papel PostgreSQL exclusivo do Worker e conceder apenas SELECT/UPDATE,
   INSERT de nota e EXECUTE estritamente necessários. Não usar a URL do dono
   do Web na VM. Há um modelo não executável em
   `web/scripts/provisionar-worker-role.sql.template` e uma auditoria somente
   de metadados em `worker/scripts/verificar_privilegios_banco.py`.
2. Implementar Storage privado, URL assinada curta, autorização de download,
   retenção e limpeza local.
3. Implementar autenticação individual, autorização por papel/empresa e
   isolamento por implantação ou tenant + RLS antes de integrar Financeiro/RH.
4. Remover colunas legadas de login/senha fiscal após migração auditada.
5. Adicionar rate limit distribuído/WAF, auditoria, alertas e resposta a
   incidentes.
6. Implantar scheduler e supervisão; definir recuperação manual de lease
   vencido e resultado fiscal incerto.
7. Validar backup/restauração e políticas de retenção.
8. Executar o primeiro ciclo conectado apenas em homologação e com uma tarefa.

## Checklist antes de qualquer piloto externo

- [ ] segredos distintos e fora do Git;
- [ ] papel dedicado do Worker testado;
- [ ] Storage privado e downloads autorizados;
- [ ] autenticação/autorização adequadas ao público do piloto;
- [ ] testes, TypeScript, build e auditoria de dependências limpos;
- [ ] backup e restauração exercitados;
- [ ] logs/alertas/healthcheck ativos;
- [ ] homologação conectada comprovada e revisada;
- [ ] produção fiscal continua desabilitada até aprovação explícita.
=======
## Estado da revisão de 25/08/2026

Esta revisão cobre o código Web, o contrato Web → Worker, arquivos locais do
Worker e dependências JavaScript. Ela reduz a exposição durante o
desenvolvimento, mas não substitui a revisão de infraestrutura antes da venda.

Proteções implementadas:

- o Web fecha o acesso em produção quando `APP_BASIC_AUTH_USER` e
  `APP_BASIC_AUTH_PASSWORD` não existem; credenciais erradas recebem `401`;
- comparação da autenticação provisória por hash e tempo constante;
- cabeçalhos CSP, anti-iframe, `nosniff`, política de referência e restrição de
  câmera, microfone, geolocalização, pagamento e USB;
- Server Actions validam UUID, data, texto, números finitos, limites de volume,
  duplicações e relações cliente↔emitente;
- links de PDF/XML aceitam somente URLs HTTPS absolutas. O modelo definitivo
  deverá usar URL assinada e curta do Storage;
- o Web não grava mais CPF/login nem senha fiscal. Ele guarda somente uma
  `credencial_referencia` e o identificador da opção NFP-e, ambos sem segredo,
  que serão resolvidos pelo Worker;
- listagens de emitentes selecionam explicitamente apenas colunas públicas;
- contrato v1 do Worker limita itens, textos e números, rejeita `NaN`/infinito,
  valida UUIDs, formatos e opções fiscais permitidas;
- o Worker aceita login apenas no endereço HTTPS oficial
  `https://receita.pr.gov.br/login`, evitando envio acidental de credenciais a
  um host adulterado;
- identificadores de clientes e concorrência têm limites; logs neutralizam
  quebras de linha forjadas; logs e screenshots recebem permissão `0600`
  quando suportada pelo sistema operacional;
- `.env`, downloads, screenshots e logs permanecem fora do Git;
- `npm audit --omit=dev` em 25/08/2026: nenhuma vulnerabilidade conhecida nas
  dependências de produção.

## Proteção provisória do Web

O Basic Auth existe para impedir que um deploy de desenvolvimento exponha
cadastros e Server Actions. Ele não é a autenticação comercial definitiva.
Em produção, configurar no Vercel valores longos e exclusivos:

```text
APP_BASIC_AUTH_USER
APP_BASIC_AUTH_PASSWORD
```

Não reutilizar senha fiscal. O tráfego deve permanecer exclusivamente em
HTTPS. Em desenvolvimento local a trava é ignorada para não atrapalhar os
testes.

## Riscos residuais que bloqueiam produção

1. Implementar Supabase Auth (ou provedor equivalente), sessões, papéis e
   autorização por organização/usuário. Basic Auth não oferece auditoria por
   pessoa, recuperação de conta ou revogação individual.
2. Criar usuário de banco de menor privilégio e políticas RLS coerentes com o
   modelo de acesso. Nunca expor `DATABASE_URL` no navegador.
3. As colunas legadas `fiscal.emitentes.login_usuario` e
   `fiscal.emitentes.senha` ainda existem no banco **local de teste** para
   preservar os dados solicitados durante a transição. O Web não as lê nem
   grava. Antes de qualquer deploy real, migrar credenciais para um secrets
   manager, limpar os valores e remover as colunas em migração auditável.
4. Storage de PDF/XML deve ser privado, com URLs assinadas de curta duração,
   validação de tipo/tamanho, retenção e trilha de acesso. Caminho recebido do
   Worker nunca deve virar URL pública diretamente.
5. Implantar rate limiting/WAF, alertas, backups testados, rotação de segredos,
   atualização automática da VM e acesso SSH apenas por chave.
6. Definir retenção e descarte seguro de logs/screenshots. Uma screenshot de
   erro pode conter dados fiscais mesmo quando o texto do log está sanitizado.
7. Antes de habilitar emissão, adicionar idempotência, lease atômica, limite de
   tentativas e trava separada para produção.

## Checklist antes de publicar

- [ ] autenticação individual e autorização implementadas;
- [ ] colunas legadas de credencial removidas;
- [ ] segredos apenas no Vercel/VM/secrets manager;
- [ ] banco e Storage privados e com menor privilégio;
- [ ] URLs de documentos assinadas e temporárias;
- [ ] domínio HTTPS, WAF/rate limiting e alertas;
- [ ] backup e restauração testados;
- [ ] `npm audit`, testes Web/Worker, TypeScript e build limpos;
- [ ] revisão manual do diff e teste de autorização em ambiente de preview;
- [ ] emissão de produção continua desabilitada até aprovação explícita.

### Trava do teste fiscal

`TESTAR_EMISSAO_HOMOLOGACAO` não é uma liberação genérica. O Worker recusa o
clique se a configuração não for `teste` ou se a URL atual não pertencer ao
host HTTPS exato da homologação. A flag é uma autorização explícita de teste;
`HEADLESS=true` continua bloqueado. O Worker permite no máximo três contextos
de homologação simultâneos, inclusive quando `MAX_CONCORRENCIA` é configurado.
A integração futura deverá preservar essa separação e possuir uma trava
diferente, explicitamente aprovada, para produção.

Referências de implementação: [CSP no Next.js](https://nextjs.org/docs/app/guides/content-security-policy)
e [cabeçalhos no Next.js](https://nextjs.org/docs/app/api-reference/config/next-config-js/headers).
>>>>>>> bb1f369fe5684487fbfe4bd6b69e53ede982c47d
