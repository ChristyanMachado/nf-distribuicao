# Arquitetura — NF Distribuição

## Visão geral

O sistema possui duas partes desacopladas:

```text
Aplicação web → banco/filas de tarefas → Worker fiscal → Receita PR
                                      ← status, PDF/XML e logs ←
```

A aplicação web cadastra emitentes, clientes, produtos e distribuições. Ela gera tarefas de emissão; o Worker é responsável por executá-las no sistema fiscal. A integração automática entre as duas partes ainda não foi ligada: hoje o Worker recebe um JSON local de demonstração, com dados fiscais hardcoded.

## Worker fiscal

O Worker usa exclusivamente Playwright Async:

```text
1 Chromium Browser
    ├── BrowserContext da tarefa A → Page A
    ├── BrowserContext da tarefa B → Page B
    └── BrowserContext da tarefa C → Page C
```

Cada `BrowserContext` é exclusivo de uma tarefa. Cookies, local storage e a sessão autenticada nunca são compartilhados entre emitentes.

`asyncio.gather()` coordena as tarefas; cada falha vira um `ResultadoProcessamento` próprio. A concorrência pode ser limitada por `MAX_CONCORRENCIA` para adequar o consumo de memória da máquina/servidor.

Não usar `sync_playwright()` com browser compartilhado entre threads. Essa abordagem já causou `greenlet.error: Cannot switch to a different thread`.

## Fluxo fiscal no estado atual

`src/auth.py` e `src/flows/emissao.py` já usam API Async. No ambiente de homologação, foi validado ao vivo o preenchimento até a etapa posterior a Transporte, para um e dois produtos. O Worker para antes de `validar_antes_de_emitir()` e nunca clica em **Emitir**.

O padrão é `AMBIENTE_EMISSAO=teste`, com o caminho NFP-e TESTES → Emissão - TESTE. Produção só poderá ser usada após validação explícita.

Ainda faltam o reconhecimento da tela final de resumo/validação, emissão, download de PDF/XML, cancelamento e a integração real com a fila.

Para testes, há três níveis deliberadamente separados:

- login: exige apenas `CLIENTE_X_LOGIN` e `CLIENTE_X_SENHA`;
- navegação: usa as mesmas credenciais e respeita `AMBIENTE_EMISSAO`;
- preenchimento completo: exige também `CLIENTE_X_EMITENTE`, pois seleciona
  o emitente na tela NFP-e. Continua parando antes de **Emitir**.

## Modelo de domínio

Uma tarefa de emissão deve guardar a escolha efetiva de emitente e cliente, além dos itens e valores. A regra de produto aprovada é relação N:N:

```text
Emitente A ──┐
             ├── Cliente X
Emitente B ──┘
```

O código usa `cliente_emitentes`, `distribuicoes.emitenteId` e
`tarefas.emitenteId`. A migração `0001_emitente_por_tarefa.sql` foi aplicada
ao banco de teste em 22/08; ela copiou o vínculo legado de
`clientes.emitente_id`, criou as relações N:N e preencheu os registros de
teste. O campo legado é preservado temporariamente para auditoria; não deve
ser usado pela aplicação nova.

O preço padrão é por **produto + cliente/mercado**, independentemente do emitente. A distribuição pode substituir esse preço em uma promoção, e o comportamento atual salva o último preço usado como padrão do par.

### Regra fiscal reutilizável

`regras_fiscais` concentra a tributação e os parâmetros operacionais comuns:
CFOP, ICMS, origem, benefício fiscal, natureza/tipo/finalidade, presença e
frete. Cada produto aponta para uma regra; o primeiro cadastro recebe a
regra ativa automaticamente quando só houver uma. `tarefa_itens` guarda a
referência usada na distribuição, preservando o contexto fiscal da tarefa.

As regras devem ser tratadas como imutáveis: para uma tributação futura,
criar outra regra e associá-la aos próximos produtos, nunca editar a regra de
uma tarefa já preparada.

### Lotes e roteiro de entrega

Cada ação concluída em Distribuição cria um `lotes_distribuicao`. As
disponibilidades e distribuições originadas naquela ação pertencem ao mesmo
lote. A página `/entregas` usa o lote para montar uma folha de motorista por
cliente, com endereço, produtos, quantidades e trocas, mas sem preço ou total
monetário. O lote mais recente é aberto por padrão e pode ser impresso.

## Agendamento futuro

O requisito operacional é que as tarefas pendentes sejam executadas automaticamente entre 00:00 e 06:00, não apenas aceitas quando alguém abre o Worker nesse intervalo. A implementação deverá ter um agendador que acorde o Worker, busque as tarefas elegíveis, respeite a janela e registre o resultado. Definir antes a zona horária operacional, política de repetição e tratamento de tarefa que não terminar dentro da janela.

O plano de entrega detalhado e a ordem segura das fases estão em
`docs/ROADMAP.md`.

## Implantação proposta

O Web deverá rodar no Vercel para atender celular/tablet. O Worker fiscal não
deve rodar dentro da requisição do Web: ele precisa de um processo persistente
com navegador, agendamento e recuperação de falhas. A proposta inicial é uma
VM Linux (Oracle Cloud Always Free para o piloto, após prova de capacidade),
que consulta/reserva tarefas no banco. Detalhes e limites conhecidos em
`docs/DEPLOYMENT.md`.

## Segurança e operação

- Não colocar credenciais no código, logs, documentos ou commits.
- Não versionar `.env`.
- Dados fiscais reais e emissão em produção exigem conferência humana até a fase de validação estar concluída.
- `INSPECIONAR`/`page.pause()` não pode bloquear execução headless.
- PDFs/XMLs e logs deverão retornar ao armazenamento da aplicação após a integração com o Worker.
