Reconhecimento manual do sistema fiscal

Status em 21/08/2026: o fluxo de preenchimento da NFP-e foi validado ao vivo no ambiente de TESTE (homologação), incluindo 1 e 2 produtos, ICMS, tela intermediária de Adicionar Produto / Avançar e Transporte. O fluxo ainda para antes de Emitir.

2-A. Ambiente de TESTE (NFP-e TESTES / homologação) — confirmado

Caminho completo:

Login → Produtor Rural → NFP-e → NFP-e TESTES → Emissão - TESTE

NFP-e TESTES: #menulateral412 > div:nth-child(4) > a

Emissão - TESTE: #menuLink1131

Domínio de homologação: homologacao.nfae.fazenda.pr.gov.br

AMBIENTE_EMISSAO=teste é o padrão.

O fluxo após Emissão - TESTE usa as mesmas telas/campos reconhecidos no ambiente normal.

O teste atual não chama Emitir.

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

No fluxo validado, os valores permaneceram no padrão e a etapa foi somente avançada.

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

10. Resumo / validação final

A transição após Transporte foi executada com sucesso no teste de 21/08, mas o conteúdo da tela de resumo ainda não foi reconhecido/documentado em detalhe.

Próximo reconhecimento

Capturar:

título/identidade da tela;

totais;

mensagens de validação;

campos eventualmente editáveis;

botão Emitir;

qualquer confirmação/modal antes da emissão.

Não clicar em Emitir durante o reconhecimento atual.

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

Ainda não confirmado

conteúdo detalhado do Resumo

validações finais do resumo

comportamento do botão Emitir

emissão real

download PDF/XML

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
→ Emitir                ← ainda não implementado/testado
→ Download documentos   ← ainda não implementado

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

20/08/2026 — ambiente de teste e primeiros seletores

ambiente NFP-e TESTES / Emissão - TESTE criado/ligado por padrão;

CNPJ corrigido para excluir radios;

identificação da operação confirmada;

estrutura inicial da etapa de Produtos reconhecida.