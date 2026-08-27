# Roadmap de entrega — NF Distribuição

<<<<<<< HEAD
## Resultado combinado

O usuário prepara uma distribuição pelo celular; o Web cria tarefas fiscais
imutáveis; um Worker persistente as processa com segurança na Receita PR; e o
Web mostra estado, nota e documentos. O roteiro de entrega sai por lote, sem
valores monetários. A fase posterior adicionará financeiro/auditoria e RH sob
um portal autenticado, sem misturar autorização administrativa nesta entrega.

## Onde estamos

- **Fase 1 — borda fiscal:** concluída em homologação para login,
  preenchimento, autorização e download XML/DANFE.
- **Fase 2 — contrato:** concluída em código e banco com payload v1, snapshot,
  hash, idempotência, token fencing e estados.
- **Fase 3 — integração:** implementada em código. Canal TLS real e fila vazia
  foram verificados; falta uma tarefa nova elegível para o primeiro round-trip.
- **Fase 4 — homologação conectada:** fluxo existe, mas ainda não foi executado
  banco → navegador → nota com uma tarefa real.
- **Fases 5/6 — operação e produção:** não iniciadas.

Migrações `0001`–`0009` estão ativas. Hoje existem 0 tarefas elegíveis: os 2
clientes e o emitente de teste estão incompletos; as 8 tarefas antigas não têm
lote e ficam fora da fila por segurança.

O Web já indica quais cadastros impedem o teste e bloqueia o formulário antes
de o usuário montar um lote inviável. O papel mínimo do Worker possui template
e verificador, mas ainda não foi criado.

## Meta imediata — primeiro round-trip Web → banco → Worker

1. Completar no Web um cliente e um emitente fiscalmente válidos.
2. Criar exatamente uma distribuição nova.
3. Executar `npm run db:verify-integration` e confirmar 1 tarefa elegível com
   snapshot/hash.
4. Rodar fonte banco com `PROCESSAR_FILA_BANCO=false`, concorrência 1 e sem
   navegador. Esperado: reservar, validar e devolver a `PENDENTE`.
5. Conferir token, lease, tentativa e integridade do snapshot.
6. Com autorização humana explícita, ativar todas as travas e processar essa
   única tarefa em homologação visível.
7. Conferir `EMITIDA`, nota única, chave/número/protocolo, XML e DANFE locais.
8. Só depois testar até 3 tarefas/contextos simultâneos.

## Próximas entregas de código

### Storage e retorno ao celular

- criar bucket privado;
- upload do XML/DANFE pelo Worker;
- persistir somente referências internas;
- download por URL assinada curta e autorizada;
- retenção e limpeza de arquivos locais.

### Operação persistente

- VM Linux com usuário não privilegiado, Chromium e supervisão;
- papel PostgreSQL exclusivo do Worker com privilégios mínimos;
- scheduler entre 00:00 e 06:00 em `America/Sao_Paulo`;
- healthcheck, métricas, alertas e recuperação segura;
- nunca repetir automaticamente resultado fiscal incerto.

O template e o auditor do papel já estão prontos; a criação do papel só deve
ocorrer quando a credencial dedicada puder ser guardada fora do repositório.

### Segurança para comercialização

- autenticação multiusuário e autorização por papel/empresa;
- decisão formal entre isolamento por implantação ou tenant + RLS;
- remover colunas legadas de credencial do banco;
- rate limit distribuído/WAF, auditoria e gestão de segredos;
- revisão de dependências, backup, restauração e resposta a incidentes.

### Polimento do produto

- validar em celulares reais os fluxos Distribuir, Tarefas, Notas e Entregas;
- manter tarefas frequentes em poucos cliques e alvos de toque adequados;
- consolidar KPIs de notas e tempo economizado por lote concluído;
- importar produtos por planilha validada;
- finalizar documentação RF, UML, implantação, operação e manual do usuário.

## Gate de produção

Produção não é continuação automática da homologação. Exige ciclo conectado
comprovado, Storage privado, autenticação/autorização definitiva, papel de
banco mínimo, scheduler supervisionado, backup, plano de reversão e aprovação
humana para o piloto de baixo volume.
=======
## Resultado que estamos construindo

Entregar um fluxo seguro e rastreável no qual a aplicação web gera tarefas
de NFP-e com emitente, destinatário, produtos e valores corretos; o Worker
as executa de forma isolada na Receita PR; e a aplicação recebe o status e,
quando aplicável, os documentos gerados. A automação noturna deve processar
as tarefas pendentes entre **00:00 e 06:00**, sem antecipar emissão em
produção antes da validação controlada.

## Estado atual

- **Web:** cadastros, distribuição, tarefas, relatório operacional e relação
  N:N cliente↔emitente já existem e foram migrados no banco de teste. O
  roteiro por lote foi aplicado e validado no banco de teste pela migração
  `0003`; a migração `0006` também foi aplicada, criando número sequencial de
  distribuição e o vínculo da tarefa com sua rodada de origem.
- **Worker:** usa 1 Chromium e N contextos isolados; login, navegação e
  preenchimento, emissão autorizada, XML e DANFE foram validados em
  homologação. Documentos só são baixados após confirmação `AUTORIZADA`.
- **Lacuna principal:** consumidor e produtor internos do contrato v1 já
  existem e foram endurecidos contra payloads maliciosos, mas ainda não há
  reserva/fila ligando os dois, retorno de status ou documentos. O Worker
  executável continua lendo `tarefa_real.json` local.

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
por produto/item foram aplicadas pela migração `0002`. O produtor interno do
contrato já existe no Web; falta a reserva atômica e a fonte de tarefas.

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

**Gate atual:** emissão controlada e downloads foram validados ao vivo em
homologação; a migração `0006` está aplicada. A seguir, implementar lease
atômica/polling e Storage. A topologia será Web e Worker em máquinas/redes
distintas coordenados pelo banco Supabase na nuvem.

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

Executar o ensaio de banco com uma tarefa nova e fiscalmente completa; depois
ligar a fonte ao fluxo Playwright já validado e implementar retorno de
sucesso/erro e Storage, ainda limitado à homologação.

O painel de relatórios ganhará, após o retorno de status do Worker, os KPIs
históricos de emissões autorizadas e tempo economizado. O tempo será calculado
com a média real observada no comparativo manual versus Worker, não por uma
estimativa fixa.
>>>>>>> bb1f369fe5684487fbfe4bd6b69e53ede982c47d
