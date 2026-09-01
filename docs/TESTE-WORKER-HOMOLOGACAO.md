# Teste controlado do Worker — emissão em homologação

Este roteiro libera emissão apenas na homologação e bloqueia qualquer página
fora do domínio oficial. A própria flag explícita substitui a confirmação por
terminal; ela nunca habilita produção. O roteiro local e o conectado são
separados.

## Antes de executar

1. Abra `worker/.env` e confirme que existem, sem compartilhar os valores:
   `SISTEMA_FISCAL_URL`, `CLIENTE_A_LOGIN`, `CLIENTE_A_SENHA` e
   `CLIENTE_A_EMITENTE`.
2. Confira manualmente os dados fiscais de `worker/tarefa_real.json`:
   destinatário, CNPJ, IE, razão social, CEP, número, produtos, quantidades e
   preços. Esse arquivo é ignorado pelo Git.
3. Feche transmissões/programas pesados e use somente um cliente no primeiro
   teste.
4. O teste deve abrir visivelmente o caminho **NFP-e TESTES → Emissão - TESTE**.
   Se a interface mostrar o ambiente normal, feche o navegador: o código
   também bloqueará o clique pela URL.

Este primeiro teste usa `tarefa_real.json`, não tarefas antigas do banco.

## Comandos no PowerShell

Execute dentro de `G:\Downloads\nf-distribuicao\worker`:

```powershell
$env:SMOKE_TEST="true"
$env:TESTAR_NAVEGACAO_EMISSAO="true"
$env:TESTAR_PREENCHIMENTO_COMPLETO="true"
$env:TESTAR_EMISSAO_HOMOLOGACAO="true"
$env:AMBIENTE_EMISSAO="teste"
$env:CLIENTES_ATIVOS="CLIENTE_A"
$env:HEADLESS="false"
$env:INSPECIONAR="false"

python main.py tarefa_real.json
```

## Travas antes do clique

Definir `TESTAR_EMISSAO_HOMOLOGACAO=true` é a autorização explícita para o
teste. Antes do clique, o código valida:

- `AMBIENTE_EMISSAO=teste`;
- URL HTTPS;
- host exato `homologacao.nfae.fazenda.pr.gov.br`;
- caminho iniciado por `/nfae/`;
- navegador visível.

Para um cliente, basta `CLIENTES_ATIVOS="CLIENTE_A"`. Para testar A, B e C
em paralelo, use `CLIENTES_ATIVOS="CLIENTE_A,CLIENTE_B,CLIENTE_C"` e
`MAX_CONCORRENCIA="3"`. O Worker limita esse modo de emissão a três contextos
simultâneos e fecha cada contexto assim que seus downloads terminarem.

## Resultado esperado

O Worker deve clicar em **Emitir**, aguardar `AUTORIZADA` e somente então
tentar baixar:

```text
worker/downloads/xml_<cliente>_<emissor>_Distribuicao-000001_<UTC>.xml
worker/downloads/danfe_<cliente>_<emissor>_Distribuicao-000001_<UTC>.pdf
```

No JSON local, `nome_cliente` e `nome_emitente` são opcionais. Sem eles, o
Worker usa respectivamente a razão social do destinatário e o identificador
do emitente na NFP-e. `numero_distribuicao` também é opcional apenas nesta
fase local: quando ausente, o nome deixa claro que se trata de uma distribuição
local, sem fingir ser o contador oficial do sistema.

No teste A/B/C, prefira definir `CLIENTE_A_NOME_EMITENTE`,
`CLIENTE_B_NOME_EMITENTE` e `CLIENTE_C_NOME_EMITENTE` no `.env`. Esses nomes
substituem o rótulo genérico do JSON e refletem o emissor de cada sessão.

Os arquivos são validados por tamanho e assinatura básica de formato. O XML
precisa ser bem-formado e ter raiz de NF-e; uma página HTML, resposta vazia ou
arquivo malformado disfarçado de documento é recusado e removido.

Não é necessário iniciar o Web para este primeiro teste. Ele usa somente o
JSON local e serve para separar possíveis falhas do portal fiscal de futuras
falhas da fila/banco.

Após os downloads, o contexto é fechado automaticamente para liberar recursos
e permitir que os outros clientes prossigam. A autorização já é reconhecida
por `span.autorizada` + texto exato.

Se `AUTORIZADA` não aparecer, XML/DANFE não são baixados. O Worker salva um
HTML e uma captura local em `worker/downloads/`, registra apenas os caminhos
nos logs e encerra a tarefa como não autorizada/não confirmada.

Log final esperado:

```text
EMISSÃO DE HOMOLOGAÇÃO E DOWNLOADS CONCLUÍDOS
Concluído com sucesso
AUTENTICAÇÃO OK
```

Se houver erro, não repita várias vezes. Envie o trecho do log a partir da
última etapa concluída e o HTML do elemento que ficou visível.

## Segundo roteiro — fila do banco

O gate seguro foi concluído em 28/08/2026 com exatamente uma tarefa real. Ela
foi reservada, validada e devolvida a `PENDENTE`, sem Chromium e sem consumir
uma tentativa. Tarefas antigas sem lote não devem ser adaptadas para o teste.

Primeiro rode com fonte banco e `PROCESSAR_FILA_BANCO=false`, concorrência 1.
O resultado esperado é reserva, validação de snapshot/hash/credencial e retorno
a `PENDENTE`, sem abrir Chromium e sem consumir uma tentativa.

Antes, verifique o canal sem reservar trabalho:

```powershell
.\.venv\Scripts\python.exe -m scripts.verificar_privilegios_banco --env-file .env
.\.venv\Scripts\python.exe -m scripts.verificar_canal_banco --env-file .env
```

O primeiro comando precisa retornar `papelWorkerSeguro: true`. Se a variável
dedicada ainda não existir, ambos retornam JSON `nao_configurado`/configuração
ausente sem revelar URL ou imprimir traceback.

No ambiente local autorizado, a conta pode ser criada ou ter seus privilégios
reaplicados a partir de `web/` com `npm run db:provision-worker-local`. O comando
usa a URL proprietária apenas para conceder os acessos mínimos, testa a
identidade e grava a conexão exclusivamente em `worker/.env`; não imprime a
senha. Em VM ou produção, crie outra identidade e use o template SQL revisável.

Depois do ensaio seguro, e somente com autorização explícita, habilite:

```powershell
$env:FONTE_TAREFAS="banco"
$env:SMOKE_TEST="true"
$env:TESTAR_INTEGRACAO_BANCO="true"
$env:PROCESSAR_FILA_BANCO="true"
$env:TESTAR_NAVEGACAO_EMISSAO="true"
$env:TESTAR_PREENCHIMENTO_COMPLETO="true"
$env:TESTAR_EMISSAO_HOMOLOGACAO="true"
$env:AMBIENTE_EMISSAO="teste"
$env:HEADLESS="false"
$env:INSPECIONAR="false"
$env:PAUSAR_ANTES_TRANSPORTE="false"
$env:MAX_CONCORRENCIA="1"
$env:ARMAZENAR_DOCUMENTOS="true"

.\.venv\Scripts\python.exe main.py
```

Use `WORKER_DATABASE_URL` dedicada e `WORKER_ID`; não use a URL proprietária do
Web na futura VM. O sucesso conectado deve deixar a tarefa `EMITIDA`, criar
uma única nota com chave/número/protocolo do XML `cStat=100`, manter XML/DANFE
locais e enviar os dois documentos ao bucket privado. Antes de iniciar, deixe
somente a nova distribuição pretendida em `PENDENTE`: o comando reserva o
trabalho elegível assim que começa.

Se houver perda de lease ou incerteza depois do clique, não repetir. A tarefa
deve ir para conferência humana.

## Ensaio temporário — emitir e depois consultar a mesma nota

Este roteiro usa `tarefa_real.json`, um único `CLIENTE_A` e duas execuções
completamente separadas. Não é necessário criar uma distribuição no Web. Antes
de começar, confira o JSON e mantenha somente dados destinados à homologação.

### Fase 1 — emitir, baixar e inspecionar

No PowerShell, dentro de `worker/`:

```powershell
$env:FONTE_TAREFAS="arquivo"
$env:PROCESSAR_FILA_BANCO="false"
$env:SMOKE_TEST="true"
$env:TESTAR_NAVEGACAO_EMISSAO="true"
$env:TESTAR_PREENCHIMENTO_COMPLETO="true"
$env:TESTAR_EMISSAO_HOMOLOGACAO="true"
$env:TESTAR_NAVEGACAO_CONSULTA="false"
$env:CONSULTAR_ULTIMO_XML="false"
$env:AMBIENTE_EMISSAO="teste"
$env:CLIENTES_ATIVOS="CLIENTE_A"
$env:MAX_CONCORRENCIA="1"
$env:HEADLESS="false"
$env:INSPECIONAR="true"
$env:PAUSAR_ANTES_TRANSPORTE="false"
$env:PAUSAR_APOS_DOWNLOADS="true"
$env:PAUSAR_APOS_CONSULTA="false"
$env:ARMAZENAR_DOCUMENTOS="false"
$env:LIMPAR_DOCUMENTOS_EXPIRADOS="false"
$env:WORKER_PERSISTENTE="false"

.\.venv\Scripts\python.exe main.py tarefa_real.json
```

A pausa ocorre somente depois de `AUTORIZADA` e dos dois downloads validados.
Confira na página quantidade, valor, total, emitente, destinatário, número e
chave. Confira também os novos arquivos em `worker/downloads/`. Depois clique
em **Resume** no Inspector; o Chromium será fechado normalmente.

### Fase 2 — consultar automaticamente pela chave do XML recém-baixado

No mesmo PowerShell, depois de encerrar a fase 1:

```powershell
$env:FONTE_TAREFAS="arquivo"
$env:PROCESSAR_FILA_BANCO="false"
$env:SMOKE_TEST="true"
$env:TESTAR_NAVEGACAO_EMISSAO="false"
$env:TESTAR_PREENCHIMENTO_COMPLETO="false"
$env:TESTAR_EMISSAO_HOMOLOGACAO="false"
$env:TESTAR_NAVEGACAO_CONSULTA="true"
$env:CONSULTAR_ULTIMO_XML="true"
$env:AMBIENTE_EMISSAO="teste"
$env:CLIENTES_ATIVOS="CLIENTE_A"
$env:MAX_CONCORRENCIA="1"
$env:HEADLESS="false"
$env:INSPECIONAR="true"
$env:PAUSAR_ANTES_TRANSPORTE="false"
$env:PAUSAR_APOS_DOWNLOADS="false"
$env:PAUSAR_APOS_CONSULTA="true"
$env:ARMAZENAR_DOCUMENTOS="false"
$env:LIMPAR_DOCUMENTOS_EXPIRADOS="false"
$env:WORKER_PERSISTENTE="false"

.\.venv\Scripts\python.exe main.py
```

O Worker escolhe o `xml_*.xml` local mais recente, recusa links e XML sem prova
de autorização, extrai a chave de 44 dígitos sem imprimi-la, seleciona o mesmo
emitente, pesquisa e exige exatamente **Um registro** com os ícones XML e
DANFE. A pausa ocorre com o resultado visível. Neste gate os ícones ainda não
são clicados: primeiro deve-se confirmar ao vivo que a linha localizada é a
nota recém-emitida. Depois clique em **Resume** para encerrar.

As flags `PAUSAR_APOS_DOWNLOADS`, `CONSULTAR_ULTIMO_XML` e
`PAUSAR_APOS_CONSULTA` ficam desligadas por padrão e são recusadas em
headless/serviço persistente quando implicam interação humana.
