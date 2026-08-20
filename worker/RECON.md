# Reconhecimento manual do sistema fiscal

> **Status em 20/08:** reconhecimento ao vivo avançou do checkbox de
> consentimento até o fim da etapa de Produtos (Transporte também
> confirmado, embutido no mesmo teste). `src/flows/emissao.py` já foi
> atualizado com todos os seletores abaixo — ver `docs/HANDOFF.md` pro
> resumo da alteração. O que falta capturar agora é só a partir da tela de
> **Resumo/Validação final** (o próprio botão "Emitir" continua com uma
> tentativa automática por nome, ainda não confirmada ao vivo).
>
> **Descoberta importante desta rodada:** a etapa de Produtos não é uma
> tela única — tem dois "Avançar" internos (Dados do Produto → Avançar →
> ICMS → Avançar) antes de aparecer "Adicionar Produto" pro próximo item.
> Ver seção 8 e 11 abaixo.
>
> **Dois pontos em aberto, ainda não confirmados com certeza:**
> 1. Destinatário: o teste ao vivo mais recente foi direto do clique em
>    "CNPJ" pro campo de Inscrição Estadual, sem passar pela seleção
>    explícita de "Contribuinte ICMS (informar a IE do destinatário)" que o
>    código ainda faz (herdada da confirmação de 14/08). Repetir o teste
>    observando se esse clique é necessário, redundante ou quebra o fluxo.
> 2. Botão "Emitir" e tudo a partir da tela de resumo/validação final —
>    ainda não alcançado no reconhecimento ao vivo.
>
> **Dica:** com `INSPECIONAR=true` no `.env` (já é o padrão do
> `.env.example`), toda etapa que falhar abre o **Playwright Inspector**
> sozinho, parado exatamente naquele ponto.

---

## 1. Login

* **URL da tela de login:**
  `https://receita.pr.gov.br/login`

* **Campo de usuário:**

  * ID/seletor: `#cpfusuario`
  * Placeholder: `Usuário (CPF)`
  * Classe observada: `.form-control-placeholder-no-fixed.valid`

* **Campo de senha:**

  * Tipo: `password`
  * Placeholder: `Senha`
  * Seletor CSS (bruto, do DevTools):
    `body > div.content > form.login-form.text-center > div:nth-child(3) > div > input`
  * **No código:** usamos `page.get_by_placeholder("Senha")` em vez do
    seletor acima — mais estável.

* **Botão de submit:**

  * Texto: `Login`
  * Tipo: `submit`
  * Classes observadas: `BTN blue pull-right`
  * **No código:** `page.get_by_role("button", name="Login")`.

* **Existe captcha / 2FA / certificado digital no navegador?**

  * Não. Login manual realizado com sucesso sem captcha, 2FA ou certificado.

* **Qual elemento confirma que o login deu certo?**

  * Não existe mensagem explícita de "login realizado" — o sistema
    redireciona para a página inicial autenticada.
  * Elemento usado como confirmação: `#icons`
  * O menu lateral também pode servir de indicador alternativo.

* **URL após login bem-sucedido:**
  `https://receita.pr.gov.br/`

---

## 2. Navegação até a área de emissão

### Menu principal

* **"Produtor Rural":** `#menulateral > div > a.menos`

### NFP-e

* **NFP-e:** `#menulateral412 > div:nth-child(3) > a`
* Existe também **NFP-e Testes** (ambiente de testes) — não usado ainda.

### Emissão

* **Emissão:** `#menuLink1119`
* **Consulta:** seletor ainda não identificado.

### Caminho confirmado

`Login → Produtor Rural → NFP-e → Emissão`

---

## 3. Consentimento inicial da emissão

* **Checkbox de consentimento:** `#div-consentimento > input[type=checkbox]`

Necessário marcar para liberar o preenchimento.

---

## 4. Identificação do emitente

* **Campo de seleção do emitente:** `<select>` dentro de `#div-identificacao`
  (seletor bruto original tem uma cadeia `nth-child` longa — no código
  simplificamos para `#div-identificacao select`, a confirmar se é único).
* **Value observado numa option:** `9595048491`

### Preenchimento automático

Após selecionar o emitente, o sistema carrega automaticamente: razão
social, CPF/CNPJ, endereço, CEP, logradouro, número, demais dados.

### Avançar

* Botão "Avançar" — **no código:** `page.get_by_role("button", name="Avançar")`
  em vez do seletor estrutural bruto.

---

## 5. Destinatário

Testado com **CNPJ** (opção intermediária dos tipos de identificação).

* **CNPJ usado no reconhecimento:** `48.188.487/0001-04`
* **Indicador da IE do destinatário:** testado como **Contribuinte**
  (exige inscrição estadual). Demais opções conceituais: Contribuinte
  isento (identifica como isento), Não contribuinte (não exige IE).
* **CEP:** confirmado ao vivo (20/08) como o único campo
  `slds-form-element.slds-col.slds-size_12-of-12` dentro de
  `#div-endereco` — a hipótese anterior (`div:nth-child(2)`) estava certa
  na posição, mas o seletor por classe é mais estável.
* **Inscrição estadual usada:** `9096853200`
* **Nome/Razão social usado:** `COOPERATIVA DOS AGRICULTORES FAMILIARES DOS MUN. DA AMENORTE`
* **País:** já vem preenchido como Brasil por padrão.
* **Número usado:** `968`

> ⚠️ **Ponto em aberto (20/08):** no reconhecimento ao vivo mais recente, a
> sequência observada foi Tipo de Documento (CNPJ) → CNPJ → Inscrição
> Estadual → Nome/Razão Social → CEP → Número → Avançar, **sem** nenhuma
> etapa visível de "Contribuinte ICMS (informar a IE do destinatário)".
> O código ainda faz esse clique (herdado da confirmação de 14/08) — pode
> ser redundante, pode já estar marcado por padrão, ou pode ser necessário
> mas não ter sido registrado neste reconhecimento específico. Confirmar no
> próximo teste ao vivo antes de remover.

> Regra fiscal (Contribuinte vs. isento vs. não contribuinte) ainda precisa
> validação documental antes de virar regra rígida — não travar a
> automação numa hipótese não confirmada.

---

## 6. Identificação da operação

* **Natureza da operação:** `Venda` — combobox confirmado: `#combobox-id-1`.
  No código, a opção é selecionada **pelo texto** (`get_by_text`), não por
  posição — o próprio reconhecimento já apontava esse risco
  (`li:nth-child(26)` era só provisório).
* **Tipo de operação:** confirmado ao vivo (20/08) — é um `<select>` comum
  (não combobox SLDS), com `Saída` = value `"1"` e `Entrada` = value `"0"`.
* **Finalidade da emissão:** confirmado ao vivo — `<select>` comum, texto
  real da opção usada é **"NF-e normal"** = value `"1"` (não "Nota fiscal
  eletrônica normal", que era só a hipótese anterior).
* **Indicador de presença:** confirmado ao vivo — `<select>` comum, texto
  real da opção usada é **"Operação não presencial, pela Internet"**
  (com vírgula) = value `"2"`.
* **Demais indicadores:** mantidos no padrão do sistema, não alterados.

> Os três `<select>` acima tinham caminhos estruturais (`nth-child`) quase
> idênticos entre si no DOM real capturado em 20/08 — usar nth-child
> teria sido ambíguo. Por isso `emissao.py` localiza cada um pelo texto de
> uma `<option>` única daquele combobox ("Entrada", "NF-e complementar",
> "Teleatendimento") em vez de posição. Essas ainda não são hipóteses —
> já estão implementadas e preenchidas de verdade no código.

---

## 7. Local de retirada/entrega

Valores permaneceram no padrão durante o reconhecimento. Etapa tratada no
código como "avançar sem alterar" — seletores específicos ainda não
registrados (só serão necessários se a operação exigir mudança aqui).

---

## 8. Produtos — confirmado ao vivo em 20/08

Campos observados na etapa: descrição, código, CFOP, unidade comercial,
quantidade, valor unitário, benefício fiscal, código do benefício fiscal,
situação tributária do ICMS, origem da mercadoria.

**Descoberta estrutural importante:** a etapa de Produtos não é uma tela
única. É preciso clicar "Avançar" DUAS vezes por produto:

```
Dados do Produto (descrição/código/CFOP/unidade/qtd/valor/benefício)
  → Avançar
ICMS (situação tributária + origem da mercadoria)
  → Avançar
  → se houver mais produtos: botão "Adicionar Produto" reabre "Dados do
    Produto" pro próximo item
  → se não houver mais produtos: segue direto pra Transporte
```

### Confirmado

* Campo certo pra buscar produto é **"Código do Produto"**, não
  "Descrição do Produto" — a descrição é preenchida automaticamente depois.
  O campo tem `aria-controls` apontando pra uma listbox de sugestões com id
  dinâmico por sessão (ex: `415-suggestions`) — não confiar nesse id.
* CFOP: `<select>` com value `"5101"` = "Venda de produção do estabelecimento".
* Quantidade e Valor unitário: campos de texto simples, seletores
  estruturais confirmados (ver `emissao.py`).
* Benefício fiscal: radio "Sim" (label de texto simples, sem id estável —
  localizado por texto), seguido do input de código do benefício.
* Situação tributária do ICMS: `<select>` com value `"40"` =
  "Tributação Isenta, Não tributada ou Suspensão" (opções observadas no
  próprio HTML real: apenas essa opção 40/41/50 combinada).
* Origem da mercadoria: `<select>` com value `"0"` = "Nacional, exceto as
  indicadas nos códigos 3, 4, 5 e 8".
* Botão "Adicionar Produto" (pra mais de um item): `<button>` com texto
  próprio "Adicionar Produto" — localizado por role/nome, não por posição.

### Ainda não confirmado

* Se a 1ª sugestão da busca (quando aparece) é sempre a correta.
* Comportamento de PIS/COFINS/IPI — não apareceram como campos visíveis
  no reconhecimento ao vivo; hipótese é que sejam automáticos/derivados,
  mas isso não está confirmado.
* Editar/remover um produto já adicionado (só o fluxo de adicionar foi
  reconhecido).

---

## 9. Transporte — confirmado ao vivo em 20/08

* **Campo:** "Modalidade do Frete", `<select>` comum.
* **Modalidade usada:** value `"3"` = "Transporte Próprio por conta do
  Remetente".
* Demais opções do combobox (CIF, FOB, por conta de terceiros, do
  destinatário, sem ocorrência de transporte) ficaram visíveis no
  reconhecimento, mas só a opção 3 foi testada/usada até agora.

---

## 10. Validação fiscal pendente

### Confirmado no reconhecimento

* Indicador da IE do destinatário testado: Contribuinte
* Natureza da operação: Venda
* CFOP (descrição): Venda de produção do estabelecimento
* Benefício fiscal: Sim
* Existência de código de benefício fiscal (valor ainda não localizado)
* Modalidade de transporte: `3`
* Busca de produtos por código
* Existência de unidade comercial associada ao produto

### Ainda pendente de confirmação definitiva

* Código numérico do CFOP
* Código específico do benefício fiscal ⚠️ **bloqueador atual**
* Tipo de operação (Entrada/Saída)
* Finalidade da emissão
* Indicador de presença
* PIS, COFINS, IPI, origem da mercadoria
* Nome exato do campo de modalidade de transporte
* Demais indicadores mantidos no padrão

---

## 11. Sequência do fluxo manual (referência)

```text
Login
→ Produtor Rural
→ NFP-e
→ Emissão
→ Consentimento
→ Identificação do emitente
→ Destinatário
→ Identificação da operação
→ Local de retirada/entrega
→ Produtos            ← reconhecimento parou aqui (código de benefício fiscal)
→ Transporte
→ Validação/revisão   ← ainda não alcançado
→ Emissão             ← ainda não alcançado
→ Download dos documentos  ← ainda não alcançado
```

Sequência de reconhecimento desejada para cada produto (próximo passo):

`Produto → Código → Seleção → NCM → CFOP → Unidade → Quantidade → Valor
unitário → Benefício fiscal → Código do benefício → PIS → COFINS → IPI →
Origem da mercadoria → Validação do item`

---

## 12. Observação sobre seletores

Seletores copiados direto do DevTools (`nth-child`, cadeias longas) são
úteis pro reconhecimento inicial, mas frágeis. Na implementação (já
aplicado em `src/auth.py` e `src/flows/emissao.py` onde possível), a
prioridade é:

1. `id`
2. `name`
3. `label`
4. `placeholder`
5. `role`
6. texto visível
7. atributos estáveis
8. seletor CSS estrutural — só quando nenhuma das opções acima está disponível

Onde o código ainda usa seletor estrutural (ex: destinatário, CFOP), está
marcado com `⚠️ TODO` — funciona hoje pra essa sessão específica, mas deve
ser hardenizado assim que testarmos ao vivo.
