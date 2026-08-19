# Handoff — Estado Atual

## Última alteração

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