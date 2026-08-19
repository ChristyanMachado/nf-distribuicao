# Projeto NF Distribuição

Antes de trabalhar:

1. Leia `docs/AI-CONTEXT.md`.
2. Leia `docs/ARCHITECTURE.md`.
3. Leia `docs/HANDOFF.md`.

## Regras

- Não sobrescrever trabalho existente sem verificar o diff.
- Não alterar a arquitetura sem registrar a decisão.
- Testar antes de afirmar que algo funciona.
- Manter documentação atualizada.
- Não colocar credenciais no código.
- Não versionar `.env`.
- Ler `docs/COLABORACAO.md` antes de iniciar trabalho compartilhado.
- Registrar alterações no Git com a identidade do programador responsável;
  IA é ferramenta de apoio, não autoria humana.

## Playwright

A arquitetura atual utiliza:

1 Browser
+
N BrowserContexts independentes.

Não retornar para a API Sync + ThreadPool sem uma justificativa técnica documentada.
