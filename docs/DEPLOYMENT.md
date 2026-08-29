# Implantação proposta — Web e Worker

## Estado desta proposta

Este documento recomenda uma topologia para o piloto. Nenhuma conta, VM ou
credencial de produção foi criada por esta decisão. A liberação fiscal real
continua bloqueada pelas fases de homologação do `docs/ROADMAP.md`.

## Topologia recomendada

```text
Celular / tablet
       │
       ▼
Web Next.js no Vercel ───► Banco / Storage (Supabase)
                                  ▲          │
                                  │          ▼
                         status, logs    tarefa pendente
                                  │          │
                                  └──── Worker em VM ───► Receita PR
                                       (Playwright)
```

- **Vercel:** interface Web, autenticação da aplicação e criação de tarefas.
  A ação do usuário deve responder rapidamente: “tarefa criada”, nunca ficar
  aguardando uma automação fiscal no navegador.
- **Banco/Storage:** fonte de verdade para tarefa, status, logs sanitizados e
  documentos. A tarefa guarda referências, não senha de emitente.
- **Worker em VM:** processo persistente com Chromium, Playwright e scheduler.
  Ele busca/reserva tarefa, executa o fluxo e devolve resultado ao banco.

Durante o desenvolvimento, o Web usa uma sessão administrativa HMAC e fecha o
acesso em produção quando os segredos não estão configurados. Ela deve ser
substituída por autenticação individual e autorização antes do uso comercial.
O checklist obrigatório está em `docs/SECURITY.md`.

## Banco do Worker

A VM deve receber uma `WORKER_DATABASE_URL` própria, com TLS e papel de menor
privilégio. Não copiar a `DATABASE_URL` proprietária usada pelo Web. O papel
precisa apenas ler snapshots elegíveis, executar a função de reserva, renovar
lease, atualizar estados protegidos pelo token e inserir a nota autorizada.
`PUBLIC` já não executa a função de reserva. O papel local foi definido e
auditado no banco de teste em 28/08/2026, mas a VM deve receber outra identidade
dedicada; não reutilizar a senha do desenvolvimento.

O modelo revisável está em
`web/scripts/provisionar-worker-role.sql.template`. Ele não contém senha e não
é executado por migration: criação/rotação de identidade operacional é uma
ação explícita de provisionamento.

Para o piloto local autorizado, `npm run db:provision-worker-local` em `web/`
cria `nf_worker_local` na primeira execução ou reaplica os privilégios mínimos
quando ele já existe, testa a conexão e atualiza apenas o `worker/.env` ignorado.
Rotação posterior de senha depende da administração oferecida pelo provedor. O
comando não deve ser usado como mecanismo de deploy.

Depois de criar a URL dedicada, executar como módulo:

```powershell
.\.venv\Scripts\python.exe -m scripts.verificar_privilegios_banco --env-file .env
.\.venv\Scripts\python.exe -m scripts.verificar_canal_banco --env-file .env
```

O primeiro comando deve retornar `papelWorkerSeguro: true`; o segundo só chama
a reserva quando não existe tarefa elegível e, portanto, não altera trabalho.

Variáveis mínimas do Worker conectado: `FONTE_TAREFAS=banco`,
`TESTAR_INTEGRACAO_BANCO=true`, `WORKER_DATABASE_URL`, `WORKER_ID`, lease,
limite da busca e referências de credencial. `PROCESSAR_FILA_BANCO=true` só é
usado com todas as travas de homologação descritas no roteiro de teste.

## Por que separar o Worker do Vercel

Uma Vercel Function é uma execução limitada no tempo; ao atingir o limite,
ela é encerrada. Mesmo que os limites atuais possam ser longos em planos
pagos, isso não equivale a um serviço persistente, nem elimina o custo de
execução e a fragilidade de manter navegador/arquivos temporários em uma
função serverless. A própria Vercel descreve Queues como mecanismo para
desacoplar requisições e processamento assíncrono, com consumidores externos
em modo de polling.

Fontes oficiais: [limites de duração do Vercel](https://vercel.com/docs/functions/configuring-functions/duration),
[Vercel Queues — poll mode](https://vercel.com/docs/queues/poll-mode).

## Oracle Cloud para o piloto

Uma VM Linux na Oracle Cloud é uma opção adequada para o Worker inicial. O
Always Free oferece, quando houver capacidade na região, até 2 OCPUs e 12 GB
de memória em Ampere A1, o que é mais apropriado ao Chromium do que uma
micro-VM de 1 GB. A capacidade grátis pode estar indisponível no momento da
criação e instâncias Always Free inativas podem ser recuperadas; portanto não
é uma garantia operacional suficiente, sozinha, para venda em escala.

Fonte oficial: [recursos Oracle Always Free](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm).

Antes de adotá-la, fazer uma prova de capacidade:

1. Criar uma VM Ubuntu compatível (preferencialmente A1 com memória adequada).
2. Instalar Playwright e Chromium; executar os testes e um login de
   homologação, sem emitir.
3. Medir memória com 1 e 3 contextos concorrentes.
4. Configurar `systemd`, atualização de segurança, firewall e acesso SSH por
   chave. Não expor uma porta pública do Worker se ele puder apenas consultar
   o banco/fila para buscar trabalho.
5. Definir backup e alerta; caso o uso cresça, migrar para uma VM paga ou
   serviço de containers persistente sem mudar o contrato Web → Worker.

O Playwright documenta a necessidade de navegador e dependências de sistema
em ambiente Linux; a imagem/instalação precisa ser testada na arquitetura
escolhida. [Documentação oficial do Playwright](https://playwright.dev/python/docs/docker).

## Como uma distribuição dispara trabalho

No clique de “Registrar distribuição”, o Web cria tarefa `PENDENTE`, snapshot
e hash na mesma transação e devolve sucesso à tela. Um Worker ativo faz polling
curto ou consome uma fila, reserva a tarefa atomicamente e passa a executar.
Assim o usuário vê o status quase imediatamente, sem depender de manter a
tela aberta nem de a requisição HTTP sobreviver por minutos.

Para o requisito noturno, o Worker só inicia emissão fiscal na janela
`00:00–06:00` (`America/Sao_Paulo`), salvo modos explícitos de homologação
controlada. O scheduler pertence ao Worker, não ao navegador do usuário.

## Opções de fila

Para o primeiro piloto, a tabela `fiscal.tarefas` mais uma reserva atômica é
suficiente e reduz serviços novos. Uma fila pode ser introduzida depois sem
alterar o contrato. Vercel Queues é compatível com consumidores externos em
polling, mas está em beta; não será dependência obrigatória do MVP.

## Estado real da implantação

Web e VM ainda não foram publicados. O bucket privado de teste foi criado e a
integração de upload/assinatura foi implementada, mas falta configurar as
chaves locais — preferencialmente uma chave atual `sb_secret_`, exclusivamente
server-side — e validar um documento real. O banco de teste contém as
migrações `0001`–`0010`, o canal TLS e o papel mínimo foram verificados. A
próxima prova é local: habilitar Storage e criar uma
distribuição nova, fazer o ensaio sem navegador e só depois a homologação
conectada com uma tarefa.
