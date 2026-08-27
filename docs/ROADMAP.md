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
- **Fase 3 — integração:** implementada em código. Canal TLS real e fila vazia
  foram verificados; falta uma tarefa nova elegível para o primeiro round-trip.
- **Fase 4 — homologação conectada:** fluxo existe, mas ainda não foi executado
  banco → navegador → nota com uma tarefa real.
- **Fases 5/6 — operação e produção:** não iniciadas.

Migrações `0001`–`0009` estão ativas. A verificação somente-leitura de 27/08
confirmou 0 tarefas elegíveis: há 2 clientes ativos (1 incompleto), 1 emitente
ativo ainda incompleto, 3 produtos prontos e nenhuma tarefa pendente. O legado
sem lote está cancelado e permanece apenas como histórico.

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
