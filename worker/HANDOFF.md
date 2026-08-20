# Handoff — Estado Atual

## Última alteração

Reconhecimento ao vivo (20/08) avançou de "checkbox de consentimento" até o
fim da etapa de Produtos, e `worker/src/flows/emissao.py` foi atualizado com
os seletores confirmados. Resumo do que mudou:

- `aceitar_consentimento` e `selecionar_emitente`: reconfirmados sem
  alteração de seletor.
- `preencher_destinatario`: seletor do campo de CEP corrigido de
  `div:nth-child(2)` (hipótese) para `div.slds-form-element.slds-col.slds-size_12-of-12`
  (confirmado). ⚠️ Ponto em aberto: o reconhecimento ao vivo mais recente
  foi direto do clique em "CNPJ" para o campo de Inscrição Estadual, sem
  passar pela seleção explícita de "Contribuinte ICMS (informar a IE do
  destinatário)" que o código ainda faz. Mantido por ora (única coisa já
  confirmada antes), mas se o próximo teste ao vivo travar nesse clique, é
  esse o primeiro suspeito — não remover sem observar a tela.
- `preencher_identificacao_operacao`: Tipo de Operação, Finalidade da
  Emissão e Indicador de Presença deixaram de ser `logger.warning`
  (placeholder) e passaram a ser preenchidos de verdade. Os três são
  `<select>` comuns (não combobox SLDS) com caminhos estruturais quase
  idênticos entre si no DOM real — por isso foi criado um helper
  (`_selecionar_select_por_opcao_ancora`) que localiza cada `<select>` pelo
  texto de uma `<option>` única daquele combobox (ex: "Entrada" só existe
  no combobox de Tipo de Operação), em vez de confiar em nth-child.
- Produtos: descoberta importante — a etapa não é uma tela única, tem DOIS
  "Avançar" internos (Dados do Produto → Avançar → ICMS → Avançar), e só
  depois do segundo é que aparece o botão "Adicionar Produto" pra próximo
  item. `preencher_item()` e `preencher_produtos()` foram reestruturados
  pra refletir isso. Campo de busca de produto confirmado: é o "Código do
  Produto" (não "Descrição"), a descrição vem automática.
- `preencher_transporte`: implementado de verdade (antes levantava
  `DadosFiscaisIncompletos` de propósito). Seletor do `<select>` de
  Modalidade do Frete confirmado, value "3".

Teste executado após a alteração (sem navegador, só sintaxe + suíte
existente, que não cobre os seletores novos):

    worker/.venv/Scripts/python.exe -m pytest tests -v -p no:cacheprovider

Resultado: 12 testes aprovados (nenhum teste novo cobre os seletores desta
alteração — validação real só acontece no próximo teste ao vivo).

Próximo passo: rodar `SMOKE_TEST` completo (ou um teste dedicado) até o
botão de emissão — sem clicar nele — com `CLIENTE_A`, observando se os dois
pontos em aberto acima (indicador de IE do destinatário e os três selects de
identificação da operação) se comportam como esperado.

## Alteração anterior

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
