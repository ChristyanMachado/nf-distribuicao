# Roadmap de entrega — NF Distribuição

## Resultado que estamos construindo

Entregar um fluxo seguro e rastreável no qual a aplicação web gera tarefas
de NFP-e com emitente, destinatário, produtos e valores corretos; o Worker
as executa de forma isolada na Receita PR; e a aplicação recebe o status e,
quando aplicável, os documentos gerados. A automação noturna deve processar
as tarefas pendentes entre **00:00 e 06:00**, sem antecipar emissão em
produção antes da validação controlada.

## Estado atual

- **Web:** cadastros, distribuição, tarefas, relatório operacional e relação
  N:N cliente↔emitente já existem e foram migrados no banco de teste.
- **Worker:** usa 1 Chromium e N contextos isolados; login, navegação e
  preenchimento até Transporte foram validados em homologação. Ele nunca
  clica em **Emitir**.
- **Lacuna principal:** o Worker ainda lê `tarefa_real.json` local com dados
  de demonstração. Não há fila/contrato Web → Worker, retorno de status ou
  documentos.

## Fases de entrega

### 1. Consolidar a borda fiscal de homologação

1. Reconhecer a tela final de resumo/validação no ambiente de teste.
2. Registrar seletores e validações em `worker/RECON.md`.
3. Identificar o botão de emitir sem acioná-lo.
4. Mapear, sem implementar em produção, como a Receita disponibiliza PDF e
   XML após uma emissão de homologação.

**Saída da fase:** todo o caminho visual é conhecido; emissão real continua
desabilitada.

### 2. Definir o contrato Web → Worker

1. Especificar uma representação versionada de tarefa que contenha:
   identificadores da tarefa, cliente e emitente; destinatário fiscal;
   itens, quantidades e preços; campos fiscais obrigatórios; e metadados de
   criação.
2. Comparar o contrato com o schema Web para localizar os campos inexistentes
   ou ainda hardcoded no Worker. Não inventar dado fiscal para preencher a
   lacuna.
3. Definir estados mínimos aproveitando o enum já existente: `PENDENTE`,
   `PROCESSANDO`, `ERRO`, `CANCELADA`, `EMITIDA` e
   `DOCUMENTOS_ARMAZENADOS`, além de tentativa, mensagem sanitizada e
   horários.
4. Definir reserva/lease atômica: duas instâncias do Worker nunca podem
   processar a mesma tarefa.

**Andamento:** formato v1, conversor e testes de validação foram entregues em
`worker/src/contrato_tarefa.py`. A regra fiscal reutilizável e sua referência
por produto/item de tarefa foram preparadas no Web pela migração `0002`;
falta aplicá-la e criar o produtor do contrato no Web.

**Saída da fase:** contrato revisado, documentado e coberto por testes sem
necessidade de abrir navegador.

### 3. Integrar de forma testável

1. Criar no Worker uma abstração de fonte de tarefas, começando por arquivo
   local/fixture para testes e depois implementando o adaptador do banco.
2. Carregar uma tarefa do Web, validá-la e convertê-la para o modelo fiscal
   existente.
3. Atualizar status de início, sucesso e falha sem gravar credenciais, CPF,
   senha ou dados sensíveis em logs.
4. Criar retorno/armazenamento de artefatos para PDF/XML, sem expor arquivos
   publicamente por padrão.

**Saída da fase:** uma tarefa criada no Web percorre o Worker em homologação
até o limite seguro, com status visível no Web.

### 4. Emitir em homologação sob controle

1. Implementar validações de pré-emissão e uma trava explícita de ambiente.
2. Fazer emissão controlada em homologação, com uma tarefa por vez.
3. Validar status de retorno e downloads de documentos.
4. Implementar recuperação segura de falhas e evitar repetição que possa
   duplicar documentos.

**Saída da fase:** ciclo completo demonstrado em homologação e registrado.

### 5. Operação automática

1. Implementar agendador persistente para a janela `00:00–06:00`, em
   `America/Sao_Paulo`.
2. Definir limite de concorrência, retries, backoff, limite de tentativas e
   comportamento de tarefas que ultrapassarem a janela.
3. Garantir observabilidade: logs sanitizados, status, alertas e auditoria.
4. Validar execução em ambiente de servidor/VM, sem depender de alguém abrir
   o terminal local.

**Saída da fase:** processamento noturno real de tarefas homologadas.

### 6. Liberação de produção

Só inicia após aprovação explícita: revisão do fluxo homologado, backup,
controle de acesso, operação piloto com volume reduzido, plano de reversão e
confirmação humana para a primeira emissão produtiva. Produção não é uma
continuação automática das fases anteriores.

## Próxima ação de código

Aplicar controladamente a migração `0002_regras_fiscais_reutilizaveis.sql` no
banco de teste e confirmar o cadastro de produtos no celular. Depois,
implementar o produtor v1 no Web como projeção/fonte de teste. Não conectar
o banco ao Worker antes dessa validação.
