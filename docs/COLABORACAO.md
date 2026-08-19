# Colaboração e Git

## Princípio

O Git identifica a autoria humana do commit. Ferramentas de IA são apoio ao
programador: quem revisa e cria o commit assume a responsabilidade pela
alteração.

Cada integrante deve configurar o nome e e-mail apenas neste repositório:

```powershell
git config user.name "Nome do Programador"
git config user.email "email@exemplo.com"
```

Não usar `--global` para isso no computador compartilhado.

## Fluxo para cada alteração

1. Atualizar/consultar `main`.
2. Criar uma branch com nome do responsável e objetivo:
   `feat/nome/navegacao-async` ou `fix/nome/smoke-test`.
3. Antes de editar, executar `git status` e `git diff`.
4. Fazer uma alteração pequena e coerente.
5. Executar os testes relevantes.
6. Atualizar `docs/HANDOFF.md` com o que mudou, motivo, teste e próximo
   passo.
7. Criar um commit claro, por exemplo:
   `fix(worker): separar smoke test do fluxo fiscal`.

## Uso de IA

No corpo do commit, opcionalmente registrar a ferramenta de apoio, sem
substituir a autoria humana:

```text
Assistido por: Codex
Revisado por: Nome do Programador
```

Claude Code e Codex não devem editar simultaneamente o mesmo diretório ou os
mesmos arquivos. Se o trabalho precisar ocorrer em paralelo, cada pessoa
deve usar sua própria branch e, idealmente, seu próprio clone ou worktree.

## Envio manual ao Claude Code

Enquanto não houver acesso compartilhado, enviar junto com o pedido:

- a branch ou hash do último commit;
- `AGENTS.MD` e `CLAUDE.MD`;
- `docs/AI-CONTEXT.md`, `docs/ARCHITECTURE.md` e `docs/HANDOFF.md`;
- os arquivos que serão modificados;
- o resultado do teste mais recente.

Nunca enviar `.env`, credenciais ou dados fiscais reais.
