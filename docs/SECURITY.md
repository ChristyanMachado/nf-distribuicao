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
