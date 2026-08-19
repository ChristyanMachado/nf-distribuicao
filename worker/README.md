# Worker — Automação de Emissão de Notas Fiscais

Python + Playwright, executando localmente por enquanto (seção 14 do
documento de visão), migrando para uma VM (Oracle Cloud Always Free) depois
de validado (Fase 6).

## Estado atual (15/08)

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
- `src/orquestrador.py`: 3 sessões paralelas (RF14), falha isolada por
  cliente (RF24) — testado sem depender de navegador real.

## Rodando os testes (não precisa de login nem de navegador instalado)

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
pytest tests/ -v   # 7 testes: orquestrador (2) + debug (4) + concorrência (1)
```

## Rodando o fluxo real (primeiro teste)

```bash
source .venv/bin/activate
playwright install chromium   # baixa o navegador, só precisa rodar 1x

cp .env.example .env
# preencher CLIENTE_A_LOGIN / CLIENTE_A_SENHA (login é o CPF do emitente)
# CLIENTES_ATIVOS já vem como "CLIENTE_A" só, e INSPECIONAR="true" por padrão

cp tarefa_real.json.template tarefa_real.json   # já está no .gitignore
# preencher com dados reais

python main.py tarefa_real.json
```

Vai rodar em janela visível (headless=false), etapa por etapa. Quando parar
num seletor não confirmado, o Playwright Inspector abre sozinho — clique no
elemento certo, copie o seletor da aba "Explore", cole no arquivo
correspondente (`src/auth.py` ou `src/flows/emissao.py`), clique ▶ Resume
no Inspector, e rode de novo pra confirmar que colou certo.

## Próximos passos

1. Primeiro teste ao vivo — capturar os seletores que ainda faltam (ver
   lista em `RECON.md`), um de cada vez, com o Inspector.
2. Depois de 1 cliente funcionar de ponta a ponta, trocar
   `CLIENTES_ATIVOS` pra `CLIENTE_A,CLIENTE_B,CLIENTE_C` e testar os 3 em
   paralelo.
3. Ligar ao Supabase: substituir `tarefa_real.json` por uma consulta real
   às tarefas `PENDENTE` (Fase 4).



