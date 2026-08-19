# Worker — Automação de Emissão de Notas Fiscais

Python + Playwright, executando localmente por enquanto (seção 14 do
documento de visão), migrando para uma VM (Oracle Cloud Always Free) depois
de validado (Fase 6).

## Estado atual (18/08)

- Reconhecimento manual avançado até a etapa de produtos, contra o sistema
  real (`receita.pr.gov.br` — NFP-e/Sefaz-PR). Detalhes em `RECON.md`.
- **Todos os dados fiscais confirmados** (CFOP `5101`, situação tributária
  `40`, origem `0`, transporte `3`, indicador de IE, e o código do
  benefício fiscal `PR810128`). O que falta agora é só **seletor** (onde
  clicar), não mais **dado** (o que preencher).
- `src/utils/debug.py`: toda etapa do fluxo passa por `rodar_etapa()`, que
  loga entrada/saída, tira screenshot automático em `downloads/` se falhar,
  e — com `INSPECIONAR=true` — abre o Playwright Inspector direto no ponto
  da falha.
- **Tentativas educadas de seletor** (não confirmadas, mas com base em
  padrão já validado no mesmo formulário): busca de produto via combobox
  SLDS (mesmo padrão que já funciona pra "Venda"), e botão de emissão por
  nome "Emitir". Se a estrutura real for diferente, falham rápido e limpo
  — o Inspector assume dali.
- **Corrigido:** confirmação humana (`validar_antes_de_emitir`) agora é
  thread-safe — antes, com 3 clientes em paralelo, dois `input()`
  simultâneos podiam disputar o mesmo terminal.
- `CLIENTES_ATIVOS` no `.env` controla quantos/quais clientes rodam (útil
  pra testar 1 por vez antes de habilitar os 3 em paralelo).
- `src/orquestrador.py`: BrowserContexts Async independentes (RF14), com
  falha isolada por tarefa (RF24). O login Async foi validado contra a
  Receita PR com um e com três clientes em paralelo.
- `src/auth.py`: autenticação e navegação inicial já usam Playwright Async.
- `src/flows/emissao.py`: ainda usa Playwright Sync; não pode receber uma
  `Page` Async e ainda não integra o fluxo executável.

## Rodando os testes (não precisa de login nem de navegador instalado)

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
pytest tests/ -v
```

## Rodando o smoke test de autenticação

```bash
source .venv/bin/activate
playwright install chromium   # baixa o navegador, só precisa rodar 1x

cp .env.example .env
# preencher CLIENTE_A_LOGIN / CLIENTE_A_SENHA (login é o CPF do emitente)
# CLIENTES_ATIVOS já vem como "CLIENTE_A" só, e INSPECIONAR="true" por padrão

cp tarefa_real.json.template tarefa_real.json   # já está no .gitignore
# preencher com dados reais

$env:SMOKE_TEST="true"
$env:CLIENTES_ATIVOS="CLIENTE_A,CLIENTE_B,CLIENTE_C"
$env:HEADLESS="false"
python main.py tarefa_real.json
```

O smoke test abre uma página por contexto, autentica cada cliente ativo e
não navega até a emissão, não preenche nota e não emite nada. Sem
`SMOKE_TEST=true`, o Worker encerra com mensagem clara: o fluxo completo só
voltará a ser habilitado após a migração gradual de todas as etapas para
Async.

## Próximos passos

1. Confirmar visualmente/logicamente a identidade autenticada em cada
   contexto, sem gravar dados pessoais no log.
2. Testar `navegar_ate_emissao()` em modo Async para um cliente e depois
   para três clientes.
3. Migrar e testar uma etapa de `flows/emissao.py` por vez.
4. Ligar ao Supabase somente após o fluxo fiscal estar validado.


