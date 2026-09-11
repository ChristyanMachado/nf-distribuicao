# Instalar o servidor de emissão no Windows

Guia da primeira instalação. O pacote desta etapa precisa passar pelo ensaio de
instalação e reinício antes de assumir a produção. O responsável técnico prepara
o banco e a configuração; o responsável pelo PC não precisa conhecer o código.

## Antes de começar

- Windows 10/11 x64, internet e acesso de administrador para a instalação.
- Python **3.13.7 x64**, versão usada para validar o runtime atual; o pacote confere
  a versão exata. Instalar para todos os usuários em uma pasta que a conta do
  serviço consiga ler. Não usar Python instalado só no perfil pessoal.
- Receber do técnico o ZIP da versão, o SHA-256 por canal confiável e o arquivo
  privado `worker.env`. Não compartilhar esse arquivo em grupos ou repositórios.
- Separar espaço para Python, Chromium, downloads fiscais e logs. A máquina
  pode continuar imprimindo e realizando tarefas administrativas leves.
- Configurar energia para não suspender/hibernar e BIOS para ligar após retorno
  da energia. Nobreak deve atender também modem/roteador. O software sozinho não
  garante energia ou internet 24h.

## Instalação inicial

1. Conferir o hash do ZIP com `Get-FileHash -Algorithm SHA256` e comparar com o
   valor enviado pelo técnico. Extrair em uma pasta de preparação.
2. Abrir PowerShell como administrador nessa pasta. Executar:

```powershell
.\windows\Gerenciar-Worker.ps1 -Action Install `
  -PythonExe 'C:\Program Files\Python313\python.exe' `
  -Package 'C:\Pacotes\worker-servidor.zip' `
  -Sha256 '<SHA256 recebido do tecnico>' `
  -ConfigFile 'C:\ConfiguracaoPrivada\worker.env'
```

Substituir os três caminhos pelos arquivos recebidos/instalados. O instalador
recusa destino existente, conta duplicada, pacote alterado ou versão de
desenvolvimento. As dependências são baixadas em versões fixadas e o Chromium
é testado localmente antes da partida. Esse teste não abre o portal fiscal.

3. A instalação cria a conta local **GraalystWorker**, sem administrador e com
   senha aleatória guardada pelo Agendador do Windows. Os arquivos ficam em
   `C:\ProgramData\GraalystWorker`; usuários comuns não leem credenciais.
4. A tarefa **GraalystWorker** inicia no boot sem login de pessoa, sem janela e
   sem monitor. Ela reinicia após falha. Não há porta de rede pública aberta.
5. O primeiro início fica em **manutenção**: confirma a conexão, mas não pega
   trabalho. Depois da validação e do corte coordenado no banco, o técnico libera:

```powershell
.\windows\Gerenciar-Worker.ps1 -Action Resume
```

Se uma etapa falhar, o script informa falha e preserva os arquivos. Não apagar a
pasta nem recriar a conta às cegas; o técnico deve revisar a instalação parcial.

## Operação diária

Normalmente não há nada a abrir. No aplicativo Web, a página **Tarefas** mostra
os servidores, último contato, versão e operações. Manter o PC e a rede ligados.

Comandos de suporte, usando o mesmo script recebido:

```powershell
.\windows\Gerenciar-Worker.ps1 -Action Status
.\windows\Gerenciar-Worker.ps1 -Action Logs
.\windows\Gerenciar-Worker.ps1 -Action Stop
.\windows\Gerenciar-Worker.ps1 -Action Start
```

Stop aguarda o trabalho atual terminar; não encerra o processo à força. O pedido
de parada fica registrado e continua valendo se o PC reiniciar. Start remove esse
pedido. Resume também libera manutenção. As ações que mudam o serviço exigem
administrador. Logs ficam limitados a oito arquivos de até 5 MiB cada pelo padrão
atual. Não enviar downloads fiscais ou o arquivo de configuração junto com logs.

Para reiniciar sem atualização: Stop, conferir Status, depois Start. Não usar o
botão Encerrar do Gerenciador de Tarefas durante emissão, salvo emergência física;
uma interrupção pode exigir conferência da nota no portal.

## Atualizar uma máquina por vez

O técnico envia um novo ZIP e hash. Executar na máquina escolhida:

```powershell
.\windows\Gerenciar-Worker.ps1 -Action Update `
  -PythonExe 'C:\Program Files\Python313\python.exe' `
  -Package 'C:\Pacotes\worker-servidor-novo.zip' `
  -Sha256 '<novo SHA256>'
```

O pacote é validado, extraído em uma pasta nova e suas dependências são preparadas
antes da parada. O worker deixa de pegar trabalho, termina o ciclo e encerra.
Somente depois disso o script troca a versão, inicia em manutenção e exige
heartbeat saudável, commit correto e um identificador de processo novo. Após
essa prova libera trabalho. Se a nova versão falhar, tenta restaurar a anterior
em manutenção. Se a parada não for comprovada, nenhuma troca é feita.

Rollback manual:

```powershell
.\windows\Gerenciar-Worker.ps1 -Action Rollback
```

Releases, logs, documentos e configuração ficam em pastas separadas. A atualização
não sobrescreve segredos nem remove versões antigas. O bootstrap da instalação
também não é trocado automaticamente; mudanças nele exigem manutenção explícita.
Não há execução remota aberta, pull periódico do Git ou atualização sem controle.
O PC de desenvolvimento produz pacotes; inicialmente o responsável os transfere
por canal privado e executa o mesmo comando, sem editar código no servidor.

## Preparação pelo técnico

Ler [WORKERS-COORDENADOS.md](WORKERS-COORDENADOS.md). Aplicar a migration em
homologação, provisionar papel individual e testar antes do corte em produção.
O exemplo vazio fica em `worker/windows/worker.env.example`. O arquivo preenchido
fica fora do pacote e a conta dedicada recebe apenas leitura; suas pastas de
estado/logs/downloads/temp recebem escrita. Administradores locais continuam
sendo confiáveis por necessidade: ACL não protege contra o dono administrador.

Na estação de desenvolvimento, com código revisado e Git limpo:

```powershell
cd worker
.\.venv\Scripts\python.exe -m scripts.empacotar_worker_servidor `
  --output '..\dist\worker-servidor.zip'
```

O comando retorna versão, hash e indicação de pacote instalável. `--preview`
gera apenas material de revisão e o instalador o recusa. Não usar um pacote
`-dirty` em produção. Uma VM Linux usa o mesmo `src.servico` e a imagem existente;
configurar `WORKER_COORDENADO=true`, WORKER_ID, WORKER_VERSION e papel exclusivo,
mantendo downloads em volume persistente. Nenhum componente depende da Oracle.

## Ensaio obrigatório antes de entregar

1. Instalar em Windows limpo; confirmar manutenção sem tarefas consumidas.
2. Reiniciar o PC sem login e verificar heartbeat no Web.
3. Com fila **fictícia de homologação** e efeito externo simulado, desligar a rede
   do principal; conferir novas tarefas no backup e bloqueio de tarefas incertas.
4. Religar o principal e conferir que não assume uma reserva do backup.
5. Solicitar Update durante uma operação; confirmar que só troca depois do término.
6. Simular release que falha ao iniciar; conferir rollback sem perder configuração.
7. Medir consumo com as aplicações administrativas usuais. Manter concorrência 1
   até uma validação específica autorizar outro valor.

Esses testes físicos permanecem pendentes nesta etapa. Não foi instalada tarefa
automática nem serviço fiscal no PC de desenvolvimento.
