# Roadmap de entrega — NF Distribuição

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
- **Fase 3 — integração:** implementada em código; canal TLS, papel mínimo,
  reserva, snapshot e retorno de erros ao Web foram verificados.
- **Fase 4 — homologação conectada:** concluída com as distribuições
  000010–000012 autorizadas. A 000012 comprovou o ciclo automático completo,
  incluindo XML/DANFE e retorno `EMITIDA` ao banco.
- **Fase 5 — operação persistente:** a VM piloto Oracle está criada e recebeu
  swap, Docker/Compose, firewall, fuso e atualizações automáticas por bootstrap
  reproduzível. A janela editável no Web já separa recuperações 24h do início
  de novas emissões; tarefas iniciadas antes do corte sempre terminam. A 0013
  foi aplicada, identidade exclusiva instalada e polling iniciado na VM;
  auditorias e healthcheck passaram. Falta ensaio fiscal de ponta a ponta
  nessa máquina e medição de recursos sob carga, com concorrência 1.
  **Atualização:** emissão autorizada e recuperação histórica já foram
  concluídas pela VM com retorno ao Web. Resta ampliar o piloto para outros
  emitentes/clientes, medir recursos sob carga e melhorar atualização da UI.
- **Fase 6 — produção:** não iniciada e explicitamente bloqueada.

Migrações `0001`–`0012` estão ativas. `0013` (janela operacional) e `0014`
(restrição de RPC anônimo no sistema de ponto compartilhado) estão preparadas,
mas aguardam aplicação consciente e validação. Cliente, emitente e três produtos reais
foram aceitos pelo portal. Uma espera por estado da tela-resumo corrigiu a
corrida entre o Avançar do ICMS e o Avançar para Transporte, sem `sleep` fixo.

O Web já indica quais cadastros impedem o teste e bloqueia o formulário antes
de o usuário montar um lote inviável. O papel mínimo do Worker foi criado no
banco de teste e passou no verificador de privilégios.

## Meta imediata — recuperação histórica e polimento do fluxo diário

1. Corrigir no celular o bloco Adicionar produto e manter a confirmação da
   distribuição criada imediatamente visível.
2. Pedir confirmação explícita quando houver quantidade não distribuída,
   preservando o bloqueio de excesso no cliente e no servidor.
3. Harmonizar os conceitos de nota registrada, nota emitida e distribuição
   entre Home e Relatórios, usando duração real para o tempo médio.
4. Ensaiar a limpeza da migration `0011`; depois retomar container/VM e operação
   persistente. O Web já está publicado e o ciclo conectado foi comprovado.

## Próximas entregas de código

### Storage e retorno ao celular

- bucket privado, upload, referências internas e URL assinada estão validados;
- recuperação de upload interrompido está implementada por manifesto local
  persistente e testes; falta validá-la no container/VM;
- retenção operacional definida em **30 dias** para novos documentos;
  limpeza física idempotente está implementada e protegida por flag, reserva e
  lease. A migration `0011` foi aplicada e o papel mínimo auditado; antes de
  ativá-la na VM, validar um documento vencido no ambiente de teste. A exclusão usa a
  API do Storage, nunca SQL direto;
- recuperação histórica sob demanda usa fila própria por nota e nunca reabre
  a emissão. O XML é validado antes do DANFE; após o reenvio, o par recuperado
  fica disponível por 7 dias. Migration `0012` aplicada; duas recuperações
  conectadas foram validadas ao vivo em 02/09.

### Operação persistente

- construir e validar na VM a imagem preparada com Chromium e supervisão;
- medir o piloto Micro com 1 GB físico + 4 GB de swap e concorrência 1; não
  promover esse dimensionamento para produção sem prova de estabilidade;
- papel PostgreSQL exclusivo do Worker com privilégios mínimos;
- validar na VM a janela configurada no Web, mantendo recuperações disponíveis
  24h e comprovando que o corte não interrompe tarefa já iniciada;
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
- adaptar Adicionar produto a descrições longas sem cortar quantidade ou ação;
- mostrar descrição + unidade sempre que apresentações do mesmo produto possam
  ser confundidas;
- confirmar sobras antes do processamento e levar foco ao resumo de sucesso;
- manter tarefas frequentes em poucos cliques e alvos de toque adequados;
- consolidar KPIs de notas e tempo economizado por lote concluído, distinguindo
  valor comprometido de nota efetivamente emitida;
- importar produtos por planilha validada;
- finalizar documentação RF, UML, implantação, operação e manual do usuário.

## Gate de produção

Produção não é continuação automática da homologação. Exige ciclo conectado
comprovado, Storage privado, autenticação/autorização definitiva, papel de
banco mínimo, scheduler supervisionado, backup, plano de reversão e aprovação
humana para o piloto de baixo volume.
