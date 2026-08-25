# Teste controlado do Worker — emissão em homologação

Este roteiro libera emissão apenas na homologação e bloqueia qualquer página
fora do domínio oficial. A própria flag explícita substitui a confirmação por
terminal; ele não habilita produção nem polling do banco.

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

Este primeiro teste usa `tarefa_real.json`, não as 8 tarefas antigas do banco.
O polling está desligado porque os cadastros de teste ainda precisam ser
completados e revisados.

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
