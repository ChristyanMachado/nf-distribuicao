# Limpeza controlada para início da operação real

Este documento registra o escopo e o resultado da limpeza autorizada antes da
primeira distribuição real. Os números foram auditados imediatamente antes e
depois da operação em 06/09/2026.

## Estado encontrado

- 22 lotes, numerados de 1 a 22;
- 64 disponibilidades e 106 distribuições de itens;
- 37 tarefas e 106 itens de tarefa;
- 22 notas e 44 objetos no bucket privado, todos referenciados por essas notas;
- 3 recuperações concluídas;
- 3 solicitações de cancelamento em `AGUARDANDO_CONFERENCIA`;
- nenhuma tarefa ou nota com ambiente `normal`;
- nenhuma emissão ou recuperação aberta;
- sequência do número do lote posicionada em 22.

Portanto, o histórico fiscal existente pode ser distinguido do futuro histórico
real pelo ambiente: tudo o que existe hoje é legado sem ambiente ou
homologação. A primeira tarefa `normal` ainda não foi criada.

## Dados que devem permanecer

- usuários do Supabase Auth e perfis em `public.perfis`;
- clientes, emitentes e vínculos cliente–emitente;
- produtos e regras fiscais;
- configuração operacional e janela de trabalho;
- migrations, papéis e privilégios do Web e do Worker;
- registros inativos, até revisão humana — estar inativo não prova que o
  cadastro seja descartável.

## Histórico removido com autorização

Com o Worker parado e uma auditoria imediatamente anterior confirmando zero
registros `normal`, a limpeza abrangeu somente:

1. solicitações de cancelamento;
2. solicitações de recuperação;
3. os 44 objetos do Storage referenciados pelas notas históricas;
4. notas;
5. logs fiscais;
6. itens de tarefa e tarefas;
7. distribuições de itens e disponibilidades;
8. lotes de distribuição;
9. reinício da sequência de lotes para que o próximo número seja 1.

Os objetos devem ser excluídos pela API autenticada do Storage, usando a lista
exata capturada antes da remoção das notas; não se apagam objetos do Storage por
SQL nem por prefixo amplo. As tabelas devem ser limpas em ordem compatível com
as chaves estrangeiras, dentro de uma transação quando aplicável.

## Preços por cliente preservados

As 20 linhas de `fiscal.precos_cliente` foram preservadas como cadastro
operacional, conforme a decisão de limitar a limpeza às distribuições. Ao
excluir manualmente um produto ou cliente fictício, somente os preços ligados
àquele cadastro também são removidos para manter a integridade referencial.

## Procedimento executado

1. o Worker foi parado e não havia fila em processamento;
2. a auditoria confirmou zero tarefas e notas `normal`;
3. foram removidos 22 lotes, 64 disponibilidades, 106 distribuições, 37
   tarefas, 106 itens, 22 notas, 3 recuperações, 3 cancelamentos e 44 objetos
   do bucket privado;
4. a auditoria posterior confirmou todas essas tabelas e o bucket com zero
   itens;
5. a sequência ficou em valor 1 com `is_called=false`, portanto a próxima
   distribuição receberá o número 1;
6. permaneceram 6 produtos, 5 clientes, 3 emitentes, 20 preços, 1 regra fiscal
   e 1 configuração operacional.

## Exclusão temporária de cadastros fictícios

A ação temporária foi usada para a limpeza manual dos cadastros fictícios e foi
removida do Web em seguida. O comportamento permanente voltou a ser somente
ativo/inativo, preservando o histórico de qualquer operação futura.

## Estado de produção

O ambiente está **preparado**, mas o fluxo ponta a ponta em produção continua
**não validado**. A prova será a primeira distribuição legítima criada pelo
usuário; não será criada uma operação fiscal artificial para teste.
