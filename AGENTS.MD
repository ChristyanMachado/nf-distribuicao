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

## Graphify

- Consultar o índice conforme `docs/GRAPHIFY.md` quando a tarefa atravessar
  módulos, envolver arquitetura/segurança/banco/integração, atingir código
  desconhecido ou tiver impacto incerto.
- Em correções pequenas e localizadas, com arquivos e dependências já
  conhecidos, abrir diretamente código, testes e diff; não gastar uma consulta
  Graphify apenas para cumprir ritual.
- Atualizar incrementalmente o índice depois de alterações estruturais ou que
  mudem relações entre módulos. Edições apenas documentais ou locais não exigem
  nova extração.
- O grafo é auxiliar e pode estar desatualizado. Antes de editar, confirmar tudo
  nos arquivos reais, no diff e nos testes.
- Usar somente extração local `--code-only`; não ativar backend semântico, modo
  estrito, watch ou hooks sem uma decisão registrada.
- Nunca versionar ou compartilhar `graphify-out/` sem uma revisão explícita de
  segurança.
