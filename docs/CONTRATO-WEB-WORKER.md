<<<<<<< HEAD
# Contrato Web → Worker

## Fonte de verdade

O Web cria o contrato v1 e o persiste na própria tarefa:

- `contrato_versao = 1`;
- `payload_worker` JSONB;
- `payload_hash` SHA-256 do texto JSONB armazenado.

Os três campos são gravados juntos na transação da distribuição. O Worker não
reconstrói a tarefa a partir de cadastros mutáveis: lê e verifica o snapshot.

## Conteúdo do payload v1

O payload contém apenas dados necessários à homologação: IDs UUID da tarefa,
cliente e emitente; ambiente `teste`; referência de credencial; identificador
do emitente no NFP-e; nome do cliente/emitente; número do lote; destinatário;
itens, quantidades, preços e snapshot da regra fiscal; modalidade de frete.

Senha/login fiscal nunca entram no payload. A referência é resolvida no
ambiente protegido do Worker.

## Produção e idempotência

- `lotes_distribuicao.chave_idempotencia` impede duplo envio do formulário.
- Uma tarefa por lote + cliente + emitente agrega seus itens.
- `payload_worker` torna-se imutável depois de completo.
- O hash é verificado antes de abrir o navegador.
- Chave de acesso e relação nota/tarefa possuem unicidade no banco.

## Elegibilidade e reserva

Uma tarefa é elegível somente quando está `PENDENTE`, possui lote,
`contrato_versao=1`, payload e hash completos, não está reservada e respeita o
limite de tentativas.

`fiscal.reservar_tarefas_worker(worker_id, limite, lease_segundos)` usa bloqueio
de linha + `SKIP LOCKED`, marca `PROCESSANDO` e retorna:

- `tarefa_id`;
- `reserva_token` UUID exclusivo.

Lease permitido: 60–3600 segundos. Renovação e transições exigem Worker, token
e lease vigentes. `EXECUTE` de `PUBLIC` foi revogado; a implantação deve
conceder apenas ao papel dedicado do Worker.

## Estados e transições

```text
PENDENTE
  └─ reserva → PROCESSANDO
       ├─ ensaio validado → PENDENTE
       ├─ contrato/hash/credencial inválido → AGUARDANDO_CONFERENCIA
       ├─ início do clique fiscal → EMITINDO
       ├─ XML cStat=100 → EMITIDA + nota
       └─ resultado incerto/lease perdido → AGUARDANDO_CONFERENCIA
```

No ensaio sem navegador, a devolução limpa lease/token e restitui a tentativa.
Mensagem de erro é sanitizada, limitada a 300 caracteres e não aceita quebra
de linha. Resultado incerto nunca ganha retry automático.

## APIs do adaptador Worker

`worker/src/fonte_tarefas.py` é responsável por:

- abrir pool async PostgreSQL com TLS obrigatório;
- reservar e carregar snapshots;
- verificar SHA-256 e validar o contrato;
- renovar lease;
- devolver ensaio a `PENDENTE`;
- marcar conferência/erro com token fencing;
- marcar `EMITINDO` imediatamente antes do clique;
- registrar nota e tarefa autorizada na mesma transação.

## Prova fiscal

Sucesso não depende apenas de texto na página. O XML baixado deve ser NF-e
bem-formada e conter chave de 44 dígitos, número, protocolo e `cStat=100`.
Esses metadados são persistidos sem expor o conteúdo em log. O PDF deve ter
assinatura `%PDF-`.

## Estado de integração

O pipeline já está ligado ao `main.py` atrás de flags explícitas. Canal TLS e
reserva vazia foram confirmados no banco real de teste. Ainda faltam: criar a
primeira tarefa elegível, executar o round-trip completo em homologação,
Storage privado, scheduler e implantação com papel dedicado.
=======
# Contrato Web → Worker — levantamento inicial

## Propósito

Este documento delimita a próxima integração. Não é ainda um endpoint nem
uma migração: é a comparação verificável entre os dados que o Web possui e
os que o Worker precisa para preencher uma NFP-e com segurança.

O contrato definitivo deverá ser versionado (por exemplo,
`versaoContrato: 1`) e transportado sem senha de emitente. Credenciais são
resolvidas no ambiente seguro do Worker, nunca enviadas como parte da tarefa.

## Formato v1 implementado no Worker

O conversor `worker/src/contrato_tarefa.py` já aceita este formato. Os nomes
em camelCase são parte do contrato; os valores abaixo são apenas exemplos
fictícios.

```json
{
  "versaoContrato": 1,
  "ambiente": "teste",
  "tarefa": {
      "id": "11111111-1111-4111-8111-111111111111",
      "clienteId": "22222222-2222-4222-8222-222222222222",
    "emitente": {
      "id": "33333333-3333-4333-8333-333333333333",
      "valorSelect": "valor-confirmado-no-select-da-nfpe",
      "credencialReferencia": "CLIENTE_A"
    },
    "destinatario": {
      "cnpj": "...",
      "indicadorIe": "CONTRIBUINTE",
      "inscricaoEstadual": "...",
      "razaoSocial": "...",
      "cep": "...",
      "numeroEndereco": "..."
    },
    "operacao": {
      "natureza": "Venda",
      "tipo": "Saída",
      "finalidade": "NF-e normal",
      "indicadorPresenca": "Operação não presencial, pela Internet",
      "modalidadeFrete": "3"
    },
    "itens": [{
      "produtoId": "44444444-4444-4444-8444-444444444444",
      "descricao": "...",
      "codigoFiscal": "...",
      "unidade": "UN",
      "quantidade": 1,
      "precoUnitario": 1.0,
      "cfopTexto": "...",
      "cfopCodigo": "...",
      "situacaoTributariaIcms": "40",
      "origemMercadoria": "0",
      "possuiBeneficioFiscal": true,
      "codigoBeneficioFiscal": "..."
    }]
  }
}
```

## Campos já disponíveis

| Necessidade do Worker | Origem atual no Web | Situação |
| --- | --- | --- |
| Identificador da tarefa | `fiscal.tarefas.id` | disponível |
| Cliente/destinatário | `fiscal.clientes` | disponível, sujeitos a validação de preenchimento |
| Emitente escolhido | `fiscal.tarefas.emitente_id` | disponível; é snapshot da distribuição |
| Nome do emitente | `fiscal.emitentes.nome` | disponível |
| Itens, quantidade e preço | `fiscal.tarefa_itens` + `fiscal.produtos` | disponível |
| Código de busca fiscal do produto | `fiscal.produtos.codigo_fiscal` | opcional hoje; obrigatório para executar |
| Unidade | `fiscal.produtos.unidade` | disponível |
| Tributação e parâmetros da operação | `fiscal.regras_fiscais` via `produto.regra_fiscal_id` | migração `0002` preparada; ainda aplicar no banco de teste |
| Regra aplicada à tarefa | `fiscal.tarefa_itens.regra_fiscal_id` | migração `0002` preparada; snapshot por referência |
| Data e valor total | `fiscal.tarefas` | disponível |
| Status operacional | `fiscal.tarefas.status` | disponível, mas sem controle de lease/tentativas |

## Lacunas que bloqueiam o preenchimento automático seguro

1. **Vínculo do emitente à sessão:** a migração `0005` criou o campo
   `valor_select_nfpe`, mas o emitente de teste ainda precisa receber o valor
   confirmado no reconhecimento. Ele não deve ser inferido do nome/CNPJ.
2. **Dados fiscais de item:** pertencem a uma regra fiscal reutilizável
   associada ao produto. A migração foi aplicada; falta construir o produtor
   Web do contrato, agora implementado como projeção interna testável.
3. **Campos do destinatário:** CNPJ, razão social, CEP e número precisam ser
   obrigatórios/validados para uma tarefa elegível. A IE deve obedecer ao
   `indicador_ie` escolhido.
4. **Dados da operação/transporte:** natureza, finalidade, presença e frete
   estão no modelo do Worker, mas não são snapshots do Web.
5. **Concorrência e auditoria:** faltam `tentativas`, `processando_em`,
   `lease_expira_em`, mensagem sanitizada de erro e identificação da
   execução para impedir processamento duplicado.

## Regras para a implementação

- Uma tarefa é elegível somente se estiver `PENDENTE` e todos os campos
  fiscais obrigatórios tiverem sido validados.
- A reserva deve ser atômica: alterar para `PROCESSANDO` apenas se ela ainda
  estiver pendente, registrando uma lease com validade.
- O Worker só recebe dados da tarefa e um identificador de credencial; não
  recebe senha, nem registra CPF/senha em logs.
- O retorno deve ser idempotente: uma repetição de rede não pode criar duas
  notas nem duplicar documentos.
- Enquanto o produto estiver em homologação, qualquer contrato precisa
  carregar explicitamente o ambiente `teste`; produção exige uma trava e
  aprovação separadas.
- O consumidor rejeita mais de 200 itens, números não finitos/excessivos,
  UUIDs e formatos inválidos, credencial fora do padrão e opções fiscais não
  reconhecidas antes de abrir o navegador.

## Próxima alteração de código

A projeção interna do contrato v1 já existe no Web e está coberta por testes,
sem consulta direta do Worker. O próximo passo é implementar reserva/lease
atômica e retorno idempotente de status.
>>>>>>> bb1f369fe5684487fbfe4bd6b69e53ede982c47d
