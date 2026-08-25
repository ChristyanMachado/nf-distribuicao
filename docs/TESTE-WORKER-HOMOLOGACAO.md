# Teste controlado do Worker — emissão em homologação

Este roteiro libera **uma única tarefa por execução**, pede confirmação humana
antes do clique e bloqueia qualquer página fora do domínio oficial de
homologação. Ele não habilita produção nem polling do banco.

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
   Se a interface mostrar o ambiente normal, responda `N` no terminal ou feche
   o navegador.

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

## Momento da confirmação

Depois do preenchimento e da chegada ao Resumo, o terminal exibirá:

```text
Conferir tarefa ... e confirmar emissão? [s/N]
```

Antes de responder, confira visualmente emitente, destinatário, itens,
quantidades, preços e que a tela pertence ao ambiente **TESTE**. Responda
somente `s` para prosseguir. Qualquer outra resposta cancela o clique.

Além dessa conferência, o código valida imediatamente antes do clique:

- `AMBIENTE_EMISSAO=teste`;
- URL HTTPS;
- host exato `homologacao.nfae.fazenda.pr.gov.br`;
- caminho iniciado por `/nfae/`;
- um único cliente e navegador visível.

## Resultado esperado

O Worker deve clicar em **Emitir**, aguardar `AUTORIZADA` e somente então
tentar baixar:

```text
worker/downloads/xml_<tarefa>_<UTC>.xml
worker/downloads/danfe_<tarefa>_<UTC>.pdf
```

Os arquivos são validados por tamanho e assinatura básica de formato. O XML
precisa ser bem-formado e ter raiz de NF-e; uma página HTML, resposta vazia ou
arquivo malformado disfarçado de documento é recusado e removido.

Não é necessário iniciar o Web para este primeiro teste. Ele usa somente o
JSON local e serve para separar possíveis falhas do portal fiscal de futuras
falhas da fila/banco.

Após os downloads, o navegador permanece aberto até você pressionar Enter no
terminal. A autorização já é reconhecida por `span.autorizada` + texto exato.
Aproveite esse momento para copiar o HTML ou seletor do estado **Rejeitada**,
número da nota e chave de acesso, sem incluir dados sensíveis na documentação
pública.

Log final esperado:

```text
EMISSÃO DE HOMOLOGAÇÃO E DOWNLOADS CONCLUÍDOS
Concluído com sucesso
AUTENTICAÇÃO OK
```

Se houver erro, não repita várias vezes. Envie o trecho do log a partir da
última etapa concluída e o HTML do elemento que ficou visível.
