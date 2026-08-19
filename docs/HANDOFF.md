# Handoff — Estado Atual

## Última alteração

O primeiro seletor da navegação falhou no teste ao vivo porque o elemento
atual é o link "Produtor Rural" (`a.mais`) e não o antigo seletor estrutural
com classe `menos`. Ele foi substituído por `get_by_role("link",
name="Produtor Rural", exact=True)`, que não depende de posição no menu.

Executar novamente com somente `CLIENTE_A`; não avançar para o teste de três
logins até confirmar a navegação com uma conta.

Não foi localizada uma regra pública da Receita PR com limite de logins por
IP. Durante desenvolvimento, evitar execuções repetidas e paralelas sem
necessidade. Concorrência em produção será tratada como parâmetro
conservador, a ser confirmado em testes controlados.

O teste seguinte confirmou o clique no primeiro menu, mas não confirmou a
tela de emissão. A navegação agora registra cada passo, aguarda a URL do
domínio NFP-e e espera diretamente o checkbox dentro de `#div-consentimento`.
Executar novamente com `CLIENTE_A` para confirmar o caminho completo.

## Alteração anterior

A navegação Async até a tela de emissão foi ligada ao smoke test de forma
opcional. Com `TESTAR_NAVEGACAO_EMISSAO=true`, cada tarefa autenticada segue
o caminho Produtor Rural -> NFP-e -> Emissão e confirma a tela aguardando
`#div-consentimento`. O teste não marca consentimento, não preenche campos e
não emite nota.

Falta executar este modo ao vivo, primeiro com `CLIENTE_A` e somente depois
com A/B/C em paralelo.

Validação executada em 19/08/2026:

    worker/.venv/Scripts/python.exe -m pytest tests -v -p no:cacheprovider

Resultado: 12 testes aprovados.

## Alteração anterior

Foi adicionada validação opcional de identidade pós-login. Quando
`CLIENTE_X_IDENTIDADE_ESPERADA` está definido no `.env`, o Worker procura
esse texto na área autenticada e falha apenas naquela tarefa se ele não for
encontrado. O valor esperado não é escrito nos logs.

Ainda falta executar este teste contra o portal com os textos reais exibidos
por cada conta. O próximo passo permanece testar a navegação Async até a
emissão para um cliente.

Também foi corrigido um teste de depuração para não herdar
`INSPECIONAR=true` do `.env` local; a suíte deve produzir o mesmo resultado
em qualquer máquina.

Validação executada em 19/08/2026:

    worker/.venv/Scripts/python.exe -m pytest tests -v -p no:cacheprovider

Resultado: 10 testes aprovados.

## Alteração anterior

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
