# Handoff — Estado Atual

## Última alteração

`worker/main.py` foi reorganizado para separar explicitamente o smoke test
Async do fluxo fiscal completo. Sem `SMOKE_TEST=true`, o Worker encerra sem
executar automação fiscal. Isso remove o caminho Sync incompatível e evita
chamar funções Async como se fossem Sync durante a migração.

Os testes do orquestrador foram atualizados para a interface Async atual e
verificam o fechamento do contexto tanto em sucesso quanto em falha.

Validação executada em 18/08/2026:

    worker/.venv/Scripts/python.exe -m pytest tests -v

Resultado: 7 testes aprovados.

Também foi adicionada `docs/COLABORACAO.md`, com convenção de autoria humana,
branches e uso seguro de Codex/Claude Code.

## Alteração anterior

Migramos o orquestrador de:

    Sync Playwright + ThreadPoolExecutor

para:

    Async Playwright
    +
    1 Browser
    +
    N BrowserContexts
    +
    asyncio.gather()

## Por que?

O Browser Sync estava sendo criado na thread principal e utilizado
em threads do ThreadPoolExecutor, provocando:

    greenlet.error:
    Cannot switch to a different thread

## O que foi testado?

### Smoke test

1 Browser + 1 Context + 1 login

✅

### Concorrência

1 Browser + 3 Contexts + 3 logins

✅

## O que NÃO foi alterado ainda?

`flows/emissao.py` ainda contém funções baseadas na Sync API.

Não tentar passar `Page` Async para funções Sync.

## Próximo passo

1. Confirmar identidade autenticada de A/B/C.
2. Migrar `navegar_ate_emissao()` para Async.
3. Testar A.
4. Testar A+B+C.
5. Migrar consentimento.
6. Continuar etapa por etapa.

## Regra de colaboração

Antes de alterar código:

    git status
    git diff

Após alterar:

    testar
    documentar
    atualizar este arquivo

Não assumir que uma alteração feita por outro agente está ausente.

Ler `docs/AI-CONTEXT.md` antes de tomar decisões arquiteturais.
