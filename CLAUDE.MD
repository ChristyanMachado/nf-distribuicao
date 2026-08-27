# Contexto do projeto

Leia antes de modificar qualquer código:

- `docs/AI-CONTEXT.md`
- `docs/ARCHITECTURE.md`
- `docs/HANDOFF.md`
- `docs/COLABORACAO.md`
- `docs/CLAUDE-TASK.md`

## Regra

Não altere decisões arquiteturais importantes sem documentar a mudança em
`docs/AI-CONTEXT.md`.

Antes de modificar um módulo importante, leia o código atual e os testes.

Após uma alteração:
1. Execute os testes relevantes.
2. Registre o resultado.
3. Atualize `docs/HANDOFF.md`.

O Codex atua como mantenedor principal deste ciclo. Trabalhe em tarefas
delimitadas, preserve as travas fiscais e devolva ao responsável humano: diff,
testes executados, riscos e bloqueios. Não reescreva a arquitetura sem decisão
registrada.

## Graphify

Quando houver `graphify-out/graph.json`, use uma consulta pequena e focada em
trabalho transversal, arquitetura, segurança, banco, integração, módulo
desconhecido ou impacto incerto. Para uma correção local em arquivos e relações
já conhecidos, vá direto ao código, testes e diff. Atualize o mapa após mudanças
estruturais, não após edição apenas documental ou estritamente local. Siga
`docs/GRAPHIFY.md`: o índice nunca substitui a confirmação no código. Não ative
modo estrito, hooks, watch nem extração semântica neste projeto.
