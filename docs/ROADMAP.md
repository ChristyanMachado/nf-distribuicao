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
- **Fases 5/6 — operação e produção:** não iniciadas.

Migrações `0001`–`0010` estão ativas. Cliente, emitente e três produtos reais
foram aceitos pelo portal. Uma espera por estado da tela-resumo corrigiu a
corrida entre o Avançar do ICMS e o Avançar para Transporte, sem `sleep` fixo.

O Web já indica quais cadastros impedem o teste e bloqueia o formulário antes
de o usuário montar um lote inviável. O papel mínimo do Worker foi criado no
banco de teste e passou no verificador de privilégios.

## Meta imediata — documentos no celular e operação concorrente

1. Configurar as chaves locais e validar ao vivo o Storage já implementado.
2. Confirmar upload, `DOCUMENTOS_ARMAZENADOS` e download por URL assinada no
   celular; implementar recuperação de upload interrompido sem reemissão.
3. Testar até 3 tarefas/contextos simultâneos com emitentes distintos,
   conferindo isolamento, nomes e estados finais.
4. Medir o ciclo conectado e garantir que observabilidade não aumente de forma
   relevante o tempo fiscal.

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
