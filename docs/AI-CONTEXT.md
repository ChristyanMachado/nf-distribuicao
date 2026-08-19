# AI Context — NF Distribuição

## Objetivo

Este documento é a fonte de contexto compartilhada entre os agentes de IA
que trabalham no projeto.

O projeto consiste em automatizar o processo de preparação e emissão de
notas fiscais, inicialmente para poucos emitentes/destinatários, com
possibilidade de expansão futura.

---

# 1. Estado atual do projeto

O projeto encontra-se na fase de desenvolvimento do Worker responsável
pela futura automação do sistema fiscal.

A aplicação possui:

- aplicação web para distribuição;
- cadastro de clientes;
- cadastro de emitentes;
- cadastro de produtos;
- geração de tarefas;
- futura integração com o Worker;
- futura emissão automática;
- armazenamento de PDF/XML.

---

# 2. Arquitetura atual do Worker

A arquitetura de navegador foi migrada da API síncrona do Playwright
para a API assíncrona.

Modelo atual:

    1 Browser
        │
        ├── BrowserContext A
        ├── BrowserContext B
        └── BrowserContext C

Cada BrowserContext representa uma sessão independente.

Objetivos:

- isolamento de cookies;
- isolamento de localStorage;
- isolamento de autenticação;
- execução concorrente;
- falha de uma tarefa não interromper as demais.

---

# 3. Motivo da alteração arquitetural

A implementação anterior utilizava:

    sync_playwright()
        ↓
    Browser criado na thread principal
        ↓
    ThreadPoolExecutor
        ↓
    Browser compartilhado entre threads

Isso provocou:

    greenlet.error:
    Cannot switch to a different thread

A API Sync do Playwright não deve ser compartilhada dessa forma entre
threads.

A arquitetura foi alterada para:

    async_playwright()
        ↓
    1 Browser
        ↓
    N BrowserContexts
        ↓
    asyncio.gather()

Essa arquitetura é a escolhida para o Worker.

---

# 4. Estado do teste da nova arquitetura

## Teste 1 — Um cliente

Resultado:

    CLIENTE_A
    ↓
    BrowserContext
    ↓
    Receita PR
    ↓
    Login confirmado

Status:

    ✅ PASSOU

---

## Teste 2 — Três clientes simultaneamente

Configuração:

    CLIENTES_ATIVOS=
    CLIENTE_A,CLIENTE_B,CLIENTE_C

Resultado observado:

    CLIENTE_A → contexto criado → login confirmado
    CLIENTE_B → contexto criado → login confirmado
    CLIENTE_C → contexto criado → login confirmado

Todos os três foram processados concorrentemente.

Status:

    ✅ PASSOU

Observação:

O teste confirma três autenticações bem-sucedidas em três contextos
independentes.

A validação explícita de identidade foi implementada, mas ainda precisa de
confirmação ao vivo: cada `CLIENTE_X_IDENTIDADE_ESPERADA` no `.env` deve
receber um texto visível após o login (por exemplo, o nome do emitente).

---

# 5. Arquivos principais

## main.py

Ponto de entrada do Worker.

Responsável atualmente por:

- carregar configuração;
- carregar tarefa;
- iniciar modo de teste;
- chamar o orquestrador;
- futuramente iniciar o fluxo real.

Uso:

    python main.py tarefa_real.json

Teste da arquitetura:

    SMOKE_TEST=true
    CLIENTES_ATIVOS=CLIENTE_A,CLIENTE_B,CLIENTE_C

---

## src/orquestrador.py

Responsável pela orquestração.

Não deve conhecer os seletores do sistema fiscal.

Responsabilidades:

- iniciar Playwright;
- abrir Chromium;
- criar BrowserContexts;
- executar tarefas em paralelo;
- isolar falhas;
- fechar contextos;
- fechar navegador.

---

## src/auth.py

Responsável pela autenticação e navegação inicial.

Já migrado para Async Playwright.

Fluxo:

    login
      ↓
    confirmação
      ↓
    Produtor Rural
      ↓
    NFP-e
      ↓
    Emissão

A autenticação já foi validada em três contextos simultâneos.

---

## src/config.py

Responsável por:

- variáveis de ambiente;
- configurações;
- credenciais.

Credenciais não devem ser hardcoded.

---

## src/flows/emissao.py

Ainda contém grande parte do fluxo fiscal original baseado na API
síncrona.

Ainda NÃO foi completamente migrado para Async.

Não misturar `Page` síncrona com `Page` assíncrona.

---

# 6. Próximo passo imediato

Migrar gradualmente o fluxo fiscal para Async. Enquanto isso, o Worker só
permite o smoke test de autenticação quando `SMOKE_TEST=true`; o fluxo fiscal
completo permanece intencionalmente desabilitado.

Ordem:

1. autenticação ✅
2. configurar e confirmar ao vivo a identidade autenticada
3. navegação até emissão 🔄 cliques e confirmação final refinados; repetir teste ao vivo
4. consentimento
5. seleção do emitente
6. destinatário
7. identificação da operação
8. local de retirada
9. produtos
10. transporte
11. validação antes de emitir
12. emissão
13. download dos documentos

Cada etapa deverá ser testada antes de migrar a próxima.

---

# 7. Estratégia de segurança durante desenvolvimento

As primeiras versões não devem emitir automaticamente.

Modo inicial:

    login
      ↓
    navegação
      ↓
    preenchimento
      ↓
    validação
      ↓
    pausa/conferência

Somente depois de testes suficientes o botão de emissão será automatizado.

---

# 8. Modelo de domínio

A relação entre emitentes e destinatários é N:N.

Não assumir:

    1 emitente → 1 cliente

O modelo futuro deve permitir:

    Emitente A ──┐
                 ├── Destinatário X
    Emitente B ──┘

e:

    Emitente A ──┐
                 ├── Destinatário Y
    Emitente C ──┘

A unidade de execução do Worker deverá ser uma TAREFA DE EMISSÃO.

Exemplo:

    tarefa_id
    emitente_id
    destinatario_id
    produtos
    quantidades
    valores
    configurações fiscais

A credencial deve ser determinada pelo emitente da tarefa.

---

# 9. Arquitetura futura

O objetivo é:

    Aplicativo
        ↓
    Supabase
        ↓
    Fila de tarefas
        ↓
    Worker
        ↓
    Chromium
        ↓
    N BrowserContexts
        ↓
    Sistema fiscal
        ↓
    PDF/XML
        ↓
    Supabase Storage
        ↓
    Aplicativo

O Worker deverá futuramente funcionar em uma VM/servidor.

A frequência prevista é baixa, portanto a infraestrutura deverá priorizar
baixo custo e, enquanto tecnicamente possível, uso de infraestrutura
gratuita.

---

# 10. Princípios

- Não colocar credenciais no código.
- Não misturar Sync Playwright com Async Playwright.
- Não compartilhar BrowserContext entre tarefas.
- Uma falha de uma tarefa não deve cancelar as demais.
- Não automatizar emissão definitiva antes da fase de validação.
- Preferir seletores robustos.
- Testar cada etapa isoladamente.
- Documentar decisões arquiteturais.
- Manter o Worker desacoplado da aplicação web.
- A unidade de execução é a tarefa, não o cliente.

---

# 11. Estado atual resumido

✅ Interface de distribuição avançada

✅ Distribuição de múltiplos produtos

✅ Distribuição para múltiplos destinatários

✅ Controle de troca

✅ Geração conceitual de tarefas

✅ Worker inicial

✅ Execução de BrowserContexts concorrentes

✅ Autenticação Async

✅ 3 logins simultâneos testados

✅ Navegação Async — testes unitários aprovados; teste ao vivo pendente

🔄 Fluxo fiscal Async

⏳ Preenchimento completo

⏳ Validação

⏳ Emissão

⏳ Download PDF/XML

⏳ Supabase

⏳ Worker em servidor

⏳ Integração completa Mobile → Worker

---

# 12. Último resultado validado

Data: 18/08/2026

Teste:

    3 clientes simultâneos

Resultado:

    CLIENTE_A ✅
    CLIENTE_B ✅
    CLIENTE_C ✅

Tempo aproximado:

    início: 20:03:25
    conclusão: 20:03:36

O processamento ocorreu concorrentemente.

Próxima validação:

    comprovar identidade individual após login.
