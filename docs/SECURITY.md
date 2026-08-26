# Segurança — NF Distribuição

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
