# Sistema de Distribuição e Automação de Emissão de Notas Fiscais

Duas frentes desenvolvidas em paralelo, conforme o documento de visão v0.4:

```
nf-distribuicao/
├── web/      → Next.js — cadastro, distribuição, tarefas (sem depender do login fiscal)
└── worker/   → Python + Playwright — automação de emissão (depende do login fiscal)
```

O contrato entre as duas frentes é a tabela `fiscal.tarefas` (Supabase):
o `web` cria tarefas PENDENTE a partir da distribuição; o `worker` as
consome e as leva até EMITIDA / ERRO.

## Estado atual (16/08)

- ✅ `web`: **área de Relatórios nova** — faturamento, ranking de clientes e
  produtos, valor perdido em trocas, gráfico por dia, tudo com os dados já
  salvos na distribuição (sem depender de PDF). Chips de período (Hoje/7
  dias/30 dias/Este mês), 1 toque, mobile-first. 23 testes passando (11 +
  12 novos), build de produção validado.
- ✅ `worker`: dados fiscais todos confirmados (CFOP `5101`, situação
  tributária `40`, origem `0`, transporte `3`, benefício fiscal
  `PR810128`). Infra de depuração pronta: Playwright Inspector automático
  no ponto da falha (`INSPECIONAR=true`), screenshot automático, lock de
  concorrência na confirmação humana, tentativas educadas de seletor pra
  busca de produto e botão de emissão. 7 testes passando.
- ⏳ Falta: testar o worker ao vivo (hoje à noite), capturar os seletores
  que restam, ligar o worker ao Supabase (Fase 4).

## Próximos passos

1. Testar o worker ao vivo — `CLIENTES_ATIVOS=CLIENTE_A python main.py tarefa_real.json`.
2. Capturar seletores restantes com o Inspector (ver `worker/RECON.md`).
3. Depois de 1 cliente funcionar, habilitar os 3 em paralelo.
4. Ligar o worker ao Supabase (Fase 4).

Ver `web/README.md` e `worker/README.md` para detalhes de cada frente.
