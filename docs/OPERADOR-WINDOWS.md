# Worker local para operador Windows

## Decisão

Esta é uma contingência manual, não o substituto silencioso do Worker remoto.
Foi escolhida instalação nativa com uma janela simples porque o Docker Desktop
já apresentou falha nesta estação e adicionaria WSL, daemon e mais pontos de
suporte para o operador. Playwright continua assíncrono, com um Chromium e um
`BrowserContext` por vez; a arquitetura fiscal não mudou.

## Uso esperado

1. O administrador isola previamente qualquer Worker remoto no banco.
2. O operador abre **Graalyst Worker Local** no desktop.
3. A janela mostra apenas número do lote e quantidade de notas pendentes.
4. O operador confere produtos, quantidades e valores no Web.
5. **Executar lote** abre uma única confirmação e processa sequencialmente.
6. Sucesso ou interrupção exigem conferência final no Web.

A janela não cria agendamento, não processa cancelamentos, limpeza ou recuperação
histórica e não permite retry. Se uma tentativa já existir, se a VM estiver com
login habilitado, se houver sessão dela ou tarefa ativa, o botão fica bloqueado.
O executável de linha também repete essas verificações dentro da transação de
reserva e aceita somente os IDs exibidos para aquele lote.
Uma trava global de sessão no PostgreSQL permanece adquirida durante todo o
lote, impedindo duas contingências locais simultâneas mesmo em PCs diferentes.
Se o processo ou a conexão cair, o PostgreSQL libera essa trava automaticamente.

## Instalação no computador autorizado

- Extrair `graalyst-worker-local.zip` em uma pasta permanente.
- Executar `INSTALAR.cmd` uma vez. É necessário Python 3.11 ou mais recente e
  acesso à internet para baixar as dependências e o Chromium.
- Preencher `.env.operador` quando ele abrir. Esse arquivo contém segredos,
  recebe ACL restrita ao usuário Windows quando possível e nunca entra no ZIP.
- Usar depois o atalho **Graalyst Worker Local** criado na área de trabalho.

O pacote é produzido por `scripts/Criar-Pacote-Operador.ps1`, copiando uma lista
fechada de código e configuração vazia. `.env`, logs, downloads, testes, Git e
documentos fiscais não são incluídos. Compare o SHA-256 antes de transferir.

Validação desta preparação: 284 testes Worker e compilação Python passaram; os
scripts PowerShell foram analisados pelo parser; o conteúdo empacotado importou
os módulos necessários. A consulta real de fila foi somente leitura e não achou
tarefas pendentes. A instalação completa ainda deve ser ensaiada em outro Windows.

## Limites operacionais

- O papel `nf_worker_local` precisa continuar com privilégios mínimos e senha
  própria. Não usar credencial de proprietário do banco.
- A chave privada do Storage e credenciais fiscais precisam ser instaladas por
  canal seguro diretamente no computador; não enviar junto do ZIP.
- O computador deve permanecer ligado, com internet e sem suspensão, até o fim.
  A janela solicita ao Windows que não suspenda enquanto o lote está rodando e
  impede fechamento normal durante a execução; ainda é recomendável usar energia.
- Na primeira falha, não clicar novamente. O estado pode ser fiscalmente incerto.
- A contingência não resolve disponibilidade noturna. Para isso ainda é necessário
  Worker remoto saudável e monitoramento externo.
