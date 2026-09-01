Reconhecimento manual do sistema fiscal

Status em 28/08/2026: o fluxo completo foi validado ao vivo em TESTE, incluindo
3 produtos reais, ICMS, tela intermediária, Transporte, Resumo, autorização e
download de XML/DANFE. A distribuição 000012 concluiu automaticamente a partir
da fila do banco, sem Inspector.

2-A. Ambiente de TESTE (NFP-e TESTES / homologação) — confirmado

Caminho completo:

Login → Produtor Rural → NFP-e → NFP-e TESTES → Emissão - TESTE

NFP-e TESTES: #menulateral412 > div:nth-child(4) > a

Emissão - TESTE: #menuLink1131

Domínio de homologação: homologacao.nfae.fazenda.pr.gov.br

AMBIENTE_EMISSAO=teste é o padrão.

O fluxo após Emissão - TESTE usa as mesmas telas/campos reconhecidos no ambiente normal.

Produção continua bloqueada; Emitir só é chamado no host exato de homologação e
com todas as travas explícitas do Worker.

Observação operacional

O ambiente de homologação existe justamente para permitir testes repetidos sem registrar as tentativas no histórico fiscal de produção. A precaução de evitar execuções repetidas volta a ser necessária somente se alguém trocar explicitamente para AMBIENTE_EMISSAO=normal.

1. Login

URL: https://receita.pr.gov.br/login

Usuário: #cpfusuario

Senha: placeholder Senha — no código, preferir get_by_placeholder("Senha").

Botão: get_by_role("button", name="Login").

Não há captcha/2FA/certificado no fluxo reconhecido.

Confirmação pós-login: #icons / página inicial autenticada.

2. Navegação até a área de emissão

Caminho de produção

Login → Produtor Rural → NFP-e → Emissão

Caminho de teste

Login → Produtor Rural → NFP-e → NFP-e TESTES → Emissão - TESTE

O helper de Avançar usa role/texto, não um seletor estrutural.

3. Consentimento inicial

Checkbox: #div-consentimento > input[type=checkbox]

Necessário marcar para liberar o preenchimento.

4. Identificação do emitente

<select> dentro de #div-identificacao

Value confirmado no teste: 9595048491

O sistema preenche automaticamente dados derivados do emitente.

Avançar: get_by_role("button", name="Avançar") quando existe um único candidato.

5. Destinatário — confirmado ao vivo em 21/08

Testado com CNPJ.

Dados usados

CNPJ: 48.188.487/0001-04

IE: 9096853200

Razão social: COOPERATIVA DOS AGRICULTORES FAMILIARES DOS MUN. DA AMENORTE

CEP: 87209-064

Número: 968

Ordem validada

CNPJ
→ Inscrição Estadual
→ Razão Social
→ CEP
→ Tab
→ aguarda loading
→ 1 segundo
→ localiza Número novamente
→ preenche Número
→ valida valor
→ Avançar

Loading do CEP

Seletor observado:

#app > div.slds-align_absolute-center.loading

Durante a consulta o elemento fica visível; depois desaparece.

Importante

Não usar Enter para sair do CEP. Nos testes, Enter podia submeter o formulário; Tab é o evento que foi validado para disparar o comportamento esperado.

O campo Número é localizado novamente depois da consulta porque a aplicação pode recriar/limpar os inputs.

Seletor do CNPJ

O formulário reutiliza classes no fieldset de CPF/CNPJ. O seletor amplo podia capturar o radio de CPF. No código, usar input visível que não seja radio:

input:not([type=radio]):visible

6. Identificação da operação — confirmado

Natureza: Venda — combobox #combobox-id-1.

Tipo de operação: <select> comum; Saída = "1", Entrada = "0".

Finalidade: <select> comum; NF-e normal = "1".

Indicador de presença: <select> comum; Operação não presencial, pela Internet = "2".

Quando os <select> possuem estruturas quase idênticas, localizar por texto de uma <option> âncora é preferível a nth-child.

7. Local de retirada/entrega

No fluxo manual validado, os valores permanecem no padrão. No ciclo conectado
de 28/08, a SPA ainda renderizava a etapa anterior quando esta função começou e
mantinha vários botões `Avançar` no DOM. A automação agora aguarda a pergunta
“Local de Retirada diferente do Emitente”, confirma explicitamente `Não` para
retirada e entrega e ancora o botão na pergunta final. Essa correção foi
validada nas distribuições 000010–000012.

Depois do segundo Avançar do ICMS do último item, a automação agora espera o
botão `Adicionar Produto` ficar visível. Esse é o sinal de que a tela-resumo foi
consolidada; só então localiza e clica o Avançar para Transporte. Isso corrigiu
uma corrida com o botão anterior sem espera fixa. A 000012 foi AUTORIZADA e
teve XML/DANFE salvos; produtos levaram 4,61 s no ciclo automático.

8. Produtos — fluxo completo confirmado ao vivo

A etapa de Produtos possui uma tela intermediária após o ICMS que é parte essencial do fluxo.

Fluxo real por produto

Dados do Produto
  ↓ Avançar
ICMS
  ↓ Avançar
Tela: Adicionar Produto / Avançar

A partir dessa tela:

se houver outro item:
    Adicionar Produto
    ↓
    próximo produto

se for o último item:
    Avançar
    ↓
    Transporte

Fluxo validado com 2 produtos

Produto 1
→ Avançar
→ ICMS
→ Avançar
→ Adicionar Produto
→ Produto 2
→ Avançar
→ ICMS
→ Avançar
→ Avançar
→ Transporte

8.1 Código do Produto

O campo correto é Código do Produto, não descrição.

Seletor final validado:

label("Código do Produto") → pai → input.default-input.slds-input

Fluxo:

click
fill(código)
ArrowDown
Enter

Não depender de aria-controls/IDs de sugestões, pois eles são dinâmicos e havia três autocompletes visíveis na tela.

8.2 CFOP

HTML confirmado:

label("CFOP") → pai → select.slds-select

Valor testado:

5101 = Venda de produção do estabelecimento

8.3 Unidade Comercial

HTML confirmado como autocomplete no bloco do label Unidade Comercial.

Fluxo validado:

label("Unidade Comercial")
→ pai
→ input.default-input.slds-input
→ click
→ fill("KG")
→ ArrowDown
→ Enter

Valor testado: KG.

8.4 Quantidade Comercial

Localização:

label("Quantidade Comercial") → pai → input.slds-input

Valor de teste: 10.

O formulário exibiu o valor formatado como 10,0000.

8.5 Valor Unitário Comercial

Localização:

label("Valor Unitário Comercial") → pai → input.slds-input

Valor de tarefa: 4.0.

O formulário exibiu o valor formatado como 40,0000000000 no teste, comportamento do próprio sistema que deve ser preservado/validado conforme a regra do campo.

8.6 Benefício fiscal

Bloco identificado pelo legend:

Possui benefício fiscal?

Fluxo:

localizar legend
→ pai
→ clicar "Sim"

8.7 Código do Benefício Fiscal na UF

Localização:

label("Código de Benefício Fiscal na UF") → pai → input.default-input.slds-input

Valor validado em homologação: PR810128.

Até o teste atual, o fill() do código foi suficiente para seguir o fluxo; não foi necessário confirmar a sugestão com ArrowDown/Enter.

8.8 Situação Tributária ICMS

Localização:

label("Situação Tributária ICMS") → pai → select.slds-select

Valor testado:

40

HTML observado: uma única opção efetiva 40,41,50 - Tributação Isenta, Não tributada ou Suspensão.

8.9 Origem da mercadoria

Localização:

label("Origem da mercadoria") → pai → select.slds-select

Valor testado:

0 = Nacional, exceto as indicadas nos códigos 3, 4, 5 e 8

8.10 Adicionar Produto

Botão localizado por role/nome:

get_by_role("button", name="Adicionar Produto")

Validado ao vivo com 2 produtos.

9. Transporte — confirmado ao vivo em 21/08

Modalidade do Frete

HTML confirmado:

label("Modalidade do Frete") → pai → select.slds-select

Valor testado:

3 = Transporte Próprio por conta do Remetente

Fluxo validado:

Produto(s) concluído(s)
→ tela Transporte
→ selecionar Modalidade do Frete = 3
→ Avançar

O campo foi localizado usando o mesmo padrão estável de label + pai + select.

10. Resumo / emissão / documentos — reconhecimento manual em 25/08

Após Transporte, o botão **Avançar** leva ao Resumo. O botão final de emissão
tem o nome visível **Emitir**; preferir o seletor semântico:

```python
page.get_by_role("button", name="Emitir", exact=True)
```

Após o clique, o sistema apresenta o resultado da emissão e, quando há
documento disponível, os dois botões abaixo.

### Autorização confirmada

HTML observado em homologação:

```html
<span class="autorizada">AUTORIZADA</span>
```

Seletor principal usado pelo Worker:

```python
page.locator("span.autorizada").filter(has_text=re.compile(r"^\s*AUTORIZADA\s*$"))
```

Seletor estrutural registrado apenas como referência de inspeção:

```text
#app > div:nth-child(2) > div > div.slds-panel__section.slds-col.slds-grid.slds-wrap.slds-gutters.slds-tabs__default__content > article > div.slds-card__body.slds-card__body_inner > div > div:nth-child(2) > span
```

O Worker só inicia os downloads depois que classe e texto confirmam
`AUTORIZADA`. O estado de rejeição ainda precisa ser reconhecido para retorno
de erro mais específico; sua ausência nunca é interpretada como sucesso.

### Baixar XML

Seletor principal:

```python
page.get_by_role("button", name="Baixar XML", exact=True)
```

HTML observado:

```html
<button class="slds-button slds-button_brand ...">Baixar XML</button>
```

Seletor estrutural registrado apenas como referência de inspeção:

```text
#app > div:nth-child(2) > div > div.slds-panel__section.slds-col.slds-grid.slds-wrap.slds-gutters.slds-tabs__default__content > article > footer > button:nth-child(2)
```

No navegador manual, o Chromium exibiu um aviso sobre o download. No Worker,
o `BrowserContext` é criado com `accept_downloads=True` e o Playwright captura
o arquivo com `expect_download()`; o aviso visual não deve exigir clique extra.

### Visualizar DANFE

Seletor principal:

```python
page.get_by_role("button", name="Visualizar DANFE", exact=True)
```

HTML observado:

```html
<button class="slds-button slds-button_brand ...">Visualizar DANFE</button>
```

Seletor estrutural registrado apenas como referência de inspeção:

```text
#app > div:nth-child(2) > div > div.slds-panel__section.slds-col.slds-grid.slds-wrap.slds-gutters.slds-tabs__default__content > article > footer > button:nth-child(3)
```

Apesar do rótulo “Visualizar”, o comportamento observado foi download direto
de PDF com nome genérico `DANFE.pdf`. O Worker salva os arquivos como
`danfe_<tarefa>_<UTC>.pdf` e `xml_<tarefa>_<UTC>.xml`, evitando colisões e
permitindo o envio posterior ao Storage privado.

Ainda falta capturar o seletor/texto do estado rejeitado, os totais do Resumo
e eventual modal intermediário.

Atualização posterior: o `main.py` pode executar uma emissão **somente em
homologação** quando `TESTAR_EMISSAO_HOMOLOGACAO=true`. A flag é bloqueada em
ambiente normal e o próprio `emitir()` confere o host da Page antes de clicar.
Não há confirmação por terminal: a flag é a autorização explícita do teste.
Até três clientes podem emitir em paralelo com `MAX_CONCORRENCIA=3`.
Produção continua indisponível.

11. Validação atual do fluxo

Confirmado ao vivo

ambiente de homologação

login

navegação

consentimento

emitente

CNPJ do destinatário

IE

razão social

CEP

sincronização de endereço

número

identificação da operação

local de retirada/entrega

busca de produto por código

CFOP

unidade comercial

quantidade

valor unitário

benefício fiscal

código de benefício

situação tributária ICMS

origem da mercadoria

múltiplos produtos

Adicionar Produto

transição para Transporte

modalidade do frete

transição após Transporte

Resumo e botão Emitir reconhecidos manualmente

botões Baixar XML e Visualizar DANFE reconhecidos manualmente

Ainda não confirmado

conteúdo detalhado do Resumo

seletor/texto do status autorizado/rejeitado

validações finais do resumo

eventual modal antes de Emitir

emissão automatizada controlada

cancelamento

PIS/COFINS/IPI, caso apareçam em telas posteriores

12. Sequência do fluxo manual validado

Login
→ Produtor Rural
→ NFP-e
→ NFP-e TESTES
→ Emissão - TESTE
→ Consentimento
→ Emitente
→ Destinatário
→ Identificação da operação
→ Local de retirada/entrega
→ Produto 1
→ ICMS
→ Adicionar Produto / Avançar
→ [Produto 2 → ICMS → Adicionar Produto / Avançar]*
→ Transporte
→ Resumo / Validação
→ Emitir                ← reconhecido manualmente; não chamado pelo Worker
→ Resultado autorizado/rejeitado
→ Baixar XML / Visualizar DANFE

13. Estratégia de seletores consolidada

A experiência do teste ao vivo mostrou que a página reutiliza intensivamente classes e estruturas.

Prioridade atual:

label/legend semântico;

id/name estável;

placeholder;

role + nome;

texto visível;

atributos estáveis;

seletor estrutural somente quando necessário.

Padrão dominante do formulário

Para <input> / <select> vinculados a rótulos:

campo = (
    page.locator("label")
    .filter(has_text="Nome do Campo")
    .locator("..")
    .locator("input")  # ou select.slds-select
)

Para legend/radio:

bloco = (
    page.locator("legend")
    .filter(has_text="Nome do grupo")
    .locator("..")
)

Evitar depender de IDs dinâmicos de autocomplete, como 251-suggestions, 281-suggestions, etc.

14. Histórico de reconhecimento

21/08/2026 — rodada de fechamento do preenchimento

confirmado fluxo destinatário + CEP + número;

confirmado Código do Produto por label;

confirmado CFOP por label;

confirmado Unidade Comercial por label + autocomplete;

confirmado Quantidade Comercial por label;

confirmado Valor Unitário Comercial por label;

confirmado benefício fiscal e código por label/legend;

confirmado Situação Tributária ICMS por label;

confirmado Origem da Mercadoria por label;

descoberto e implementado o passo intermediário Adicionar Produto / Avançar;

validado 1 produto;

validado 2 produtos;

confirmado Transporte e Modalidade do Frete;

fluxo completo de preenchimento chegou ao fim e parou antes de Emitir.

25/08/2026 — reconhecimento da saída de homologação

confirmado que Avançar após Transporte leva ao Resumo;

botão Emitir reconhecido pelo nome visível;

resposta pós-emissão observada manualmente;

capturados Baixar XML e Visualizar DANFE;

confirmado que Visualizar DANFE baixa diretamente `DANFE.pdf`;

download automatizado preparado, sem ligar a emissão ao fluxo executável.

20/08/2026 — ambiente de teste e primeiros seletores

ambiente NFP-e TESTES / Emissão - TESTE criado/ligado por padrão;

CNPJ corrigido para excluir radios;

identificação da operação confirmada;

estrutura inicial da etapa de Produtos reconhecida.

15. Consulta histórica de documentos — reconhecimento parcial de 01/09/2026

Objetivo

Recuperar XML/DANFE de uma nota já autorizada depois que a cópia privada sair
da retenção. Este fluxo é separado da emissão e nunca pode clicar em Emitir.

Caminho confirmado em homologação

Login
→ Produtor Rural
→ NFP-e
→ NFP-e TESTES
→ Consulta - TESTE (`#menuLink1132`)
→ selecionar o cadastro do produtor
→ escolher filtro Chave de Acesso
→ pesquisar a chave persistida da nota
→ abrir o resultado
→ baixar XML / DANFE

O link observado para Consulta - TESTE anuncia HTTP. O Worker abre a rota
equivalente diretamente em HTTPS e confirma host, caminho e o select da tela.

Seletores confirmados

- menu: `#menuLink1132`;
- tela carregada: `article select.slds-select`;
- produtor: o mesmo select; escolher pelo `value` salvo em
  `emitentes.valor_select_nfpe`, nunca pela posição da opção.

Fonte da chave

`fiscal.notas.chave_acesso`, já preenchida pelo XML autorizado e validada como
44 dígitos. O valor exibido no resumo pós-emissão não será uma segunda fonte de
verdade. Não registrar a chave em logs ou artefatos de diagnóstico.

Ainda falta reconhecer antes de automatizar a pesquisa

- controle que ativa o filtro “Chave de Acesso”;
- input da chave;
- botão Consultar;
- linha/cartão do resultado e ação de abrir detalhes;
- botões de XML/DANFE na tela consultada;
- estado de “nenhum resultado” e mensagens de erro;
- comportamento quando o documento já não está disponível no portal.

Implementado e testável agora

`TESTAR_NAVEGACAO_CONSULTA=true` faz login, abre exclusivamente a Consulta -
TESTE e seleciona o emitente exato. Ele para antes de pesquisar qualquer nota.
Não combinar com `TESTAR_NAVEGACAO_EMISSAO`.

Validação ao vivo de 01/09

O select aparece antes das opções e, depois, a tela contém outros selects.
O Worker agora aguarda a opção esperada e localiza o select que contém seu
`value` exato. A execução com um emitente concluiu até esse ponto sem pesquisa,
download ou emissão.

O filtro por chave também foi validado ao vivo: a opção `value="1"` abriu o
`input.slds-input.slds-size_6-of-12`, que permaneceu vazio. A pesquisa por uma
chave real ainda não foi ligada ao smoke test.

16. Máscara numérica de quantidade e preço — correção crítica de 01/09/2026

Foi observado na reunião que inteiros enviados como `2.0`/`10.0` podiam ser
interpretados pela máscara como 20/100. Se quantidade e preço fossem ampliados
juntos, o total podia chegar a 100 vezes o esperado.

Correção aplicada

- formatação humana com vírgula decimal e sem `.0`/zeros finais;
- clique, seleção total e digitação sequencial para disparar os mesmos eventos
  da interface;
- Tab para concluir a máscara;
- leitura obrigatória do valor final e comparação decimal com o contrato;
- qualquer divergência interrompe o Worker antes do próximo Avançar.

Validação ao vivo

Uma tarefa local de dois produtos atravessou Produtos e Transporte em
homologação com a conferência dos quatro campos numéricos aprovada. A flag de
emissão permaneceu desligada; nenhuma nota foi emitida nesse ensaio.
