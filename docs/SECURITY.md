# Segurança — NF Distribuição

## Controles implementados

### Web

- sessão administrativa HMAC com duração curta e cookie seguro;
- bloqueio por inatividade e logout;
- produção fecha quando a autenticação não está configurada;
- Server Actions sensíveis exigem sessão novamente;
- validação e limites para texto, UUID, CNPJ, CEP, IE, números e lote;
- CPF/CNPJ de emitente validados por dígitos verificadores e IE opcional;
- validações esperadas retornam feedback local, enquanto exceções internas são
  reduzidas a mensagens genéricas sem detalhes de conexão ou SQL;
- exclusão operacional de cliente, emitente ou produto usa desativação lógica
  e é bloqueada diante de tarefa aberta, preservando histórico e evitando
  processamento órfão;
- cabeçalhos CSP/anti-frame/nosniff/referrer e HSTS em produção;
- URLs de documentos restritas a hosts de Storage permitidos;
- respostas administrativas sem cache e páginas sem indexação.
- diagnóstico de prontidão não imprime documentos nem conexão e valida vínculo
  apenas com emitente ativo e produto com regra fiscal ativa;
- as consultas operacionais usam parâmetros do Drizzle/PostgreSQL; valores de
  formulário não são concatenados em SQL;
- `npm audit --omit=dev` em 04/09/2026 não encontrou vulnerabilidades
  conhecidas nas dependências usadas em produção pelo Web;

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
- `anon` e `authenticated` não possuem `USAGE` nem grants de tabela no schema
  `fiscal`; o Web continua acessando-o somente pelo servidor. O aviso genérico
  de RLS desligado deve ser acompanhado, mas não autoriza habilitar políticas
  às cegas e interromper o papel dedicado do Worker.
- o horário operacional fica em linha única com restrições no banco; o Web é o
  único escritor e o Worker dedicado recebe apenas `SELECT`;

### Worker

- somente Playwright Async e contextos isolados;
- host HTTPS de homologação revalidado no clique fiscal;
- credenciais resolvidas por referência fora do Web;
- logs sanitizados, rotacionados e sem dados fiscais brutos;
- mensagens de banco limitadas e sem CR/LF;
- códigos de erro limitados a formato estável e sem dados fiscais; retry usa
  lista fechada e transição atômica apenas a partir de `ERRO` pré-emissão;
- `AGUARDANDO_CONFERENCIA` nunca recebe botão de nova tentativa;
- XML e PDF validados antes de sucesso;
- diretório/arquivos privados e recusa de link simbólico;
- configuração não revela URL do banco em `repr`.
- serviço persistente recusa produção, modo visível, Inspector, pausa e
  configuração parcial; o papel PostgreSQL é auditado antes do primeiro ciclo;
- container sem porta pública, com raiz somente leitura, capabilities removidas,
  `no-new-privileges`, volumes explícitos e healthcheck sanitizado.

## Riscos que ainda bloqueiam produção

0. O projeto Supabase também hospeda o sistema de ponto. A auditoria ao vivo
   de 04/09 encontrou
   `public.criar_usuario`, `atualizar_usuario`, `is_gerente` e
   `obter_email_usuario` como `SECURITY DEFINER` executáveis por `anon`; as
   funções fazem verificações internas, mas os grants devem ser revisados. A
   migration `0014` está preparada para revogar somente `PUBLIC`/`anon` e
   manter `authenticated`/`service_role`; ainda não foi aplicada. A
   função legada `is_gerente()` não exige `ativo=true` e a proteção contra
   senhas vazadas está desligada. Corrigir em uma migration própria e testar o
   sistema de ponto antes de aplicar, sem improvisar durante o deploy fiscal.
   A redefinição de senha administrativa deve migrar para o Supabase Auth
   Admin API (`updateUserById`) em código exclusivamente servidor. A função
   legada `atualizar_usuario` altera `auth.users` diretamente e não deve ser
   copiada para o Web nem chamada pelo navegador.

1. Criar uma identidade PostgreSQL exclusiva para cada implantação do Worker.
   O papel local de teste já foi provisionado e auditado com sucesso; não
   reutilizar sua senha nem a URL do dono do Web na futura VM. O modelo
   revisável permanece em `web/scripts/provisionar-worker-role.sql.template`.
2. Storage privado e primeiro download real estão validados; adicionar
   recuperação de upload interrompido, autorização individual e limpeza local.
3. Implementar autenticação individual, autorização por papel/empresa e
   isolamento por implantação ou tenant + RLS antes de integrar Financeiro/RH.
4. Remover colunas legadas de login/senha fiscal após migração auditada.
5. O login possui comparação constante, erro genérico e limitador local de
   cinco tentativas/15 minutos, mas memória serverless não é barreira
   distribuída. Habilitar proteção contra senhas vazadas e CAPTCHA/rate limits
   no Supabase Auth. No Vercel, manter o DDoS automático e ensaiar uma regra WAF
   em modo de log antes de publicá-la para `/login`.
6. Validar o container na VM, implantar scheduler/alertas e definir recuperação
   manual de lease vencido e resultado fiscal incerto.
7. Validar backup/restauração e políticas de retenção.
8. Executar o primeiro ciclo conectado apenas em homologação e com uma tarefa.

## Checklist antes de qualquer piloto externo

- [ ] segredos distintos e fora do Git;
- [x] papel dedicado do Worker local testado (repetir com outra identidade na VM);
- [x] Storage privado e primeiro upload/download real validados;
- [ ] autorização multiusuário e recuperação de upload interrompido;
- [ ] autenticação/autorização adequadas ao público do piloto;
- [ ] migration `0014` aplicada e sistema de ponto validado com usuário autenticado;
- [ ] proteção de senha vazada/CAPTCHA e rate limit distribuído validados;
- [ ] testes, TypeScript, build e auditoria de dependências limpos;
- [ ] backup e restauração exercitados;
- [ ] logs/alertas/healthcheck ativos;
- [ ] homologação conectada comprovada e revisada;
- [ ] produção fiscal continua desabilitada até aprovação explícita.
