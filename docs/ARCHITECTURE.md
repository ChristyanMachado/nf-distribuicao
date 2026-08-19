# Arquitetura — NF Distribuição

## Worker de automação fiscal

O Worker usa Playwright Async para manter sessões fiscais isoladas:

```text
1 Chromium Browser
    ├── BrowserContext da tarefa A -> Page A
    ├── BrowserContext da tarefa B -> Page B
    └── BrowserContext da tarefa C -> Page C
```

Cada `BrowserContext` é exclusivo de uma tarefa. Ele não pode ser
compartilhado entre emitentes/tarefas, pois contém cookies, armazenamento
local e autenticação.

## Concorrência

`asyncio.gather()` coordena tarefas independentes. A falha de uma retorna um
`ResultadoProcessamento` próprio e não deve interromper as demais.

Não usar `sync_playwright()` com um Browser compartilhado entre threads:
essa combinação causou `greenlet.error: Cannot switch to a different thread`.

## Migração gradual

`src/orquestrador.py` e `src/auth.py` usam a API Async. `src/flows/emissao.py`
ainda usa a API Sync e não deve receber `Page` Async. Cada etapa do fluxo
fiscal deve ser convertida e testada individualmente antes de integrá-la ao
fluxo completo.

## Limite operacional atual

O modo de desenvolvimento deve parar antes da emissão para conferência humana.
Emissão automática e downloads só serão ativados após testes suficientes e
validação explícita dos dados e seletores.
