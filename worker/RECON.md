# Reconhecimento manual do sistema fiscal

> **Status em 15/08 (atualização 2):** **código do benefício fiscal
> confirmado: `PR810128`** (fixo, o mesmo para todos os produtos). Isso
> encerra o único bloqueio de DADO fiscal que restava — o que falta agora
> é só descobrir SELETORES (onde clicar), não mais O QUE preencher. Isso
> muda a natureza do trabalho que falta: de "pesquisar informação" pra
> "testar ao vivo e observar o DOM".
>
> Também confirmados e já no código (`src/flows/emissao.py`):
> - **CFOP: `5101`**
> - **Modalidade de transporte "3" = "Transporte próprio por conta do remetente"**
> - **Situação tributária do ICMS: `40`** (opções observadas: 40, 41, 50)
> - **Origem da mercadoria: `0` = Nacional**
> - **Ordem confirmada:** benefício fiscal precisa ser preenchido ANTES de
>   situação tributária/origem — senão esses campos não funcionam direito.
> - **Cancelamento:** fica em Consultar → penúltimo botão "Cancelar" → pede
>   motivo. A Receita monitora volume de cancelamentos; ~3 foi tranquilo
>   historicamente, mas não é garantia.
>
> **Retomar em breve, nesta ordem:**
> 1. Copiar `tarefa_real.json.template` → `tarefa_real.json` (já no
>    `.gitignore`) e preencher com dados reais.
> 2. `HEADLESS=false python main.py tarefa_real.json` e observar — vários
>    seletores estão marcados `⚠️ TODO` no código porque ainda não foram
>    capturados. É normal quebrar em alguns pontos; corrigir olhando o
>    navegador aberto (é assim que se desenvolve com Playwright).
>
>    **Dica nova (15/08):** com `INSPECIONAR=true` no `.env` (já é o padrão
>    do `.env.example`), toda etapa que falhar abre o **Playwright
>    Inspector** sozinho, parado exatamente naquele ponto — usa a aba
>    "Explore" dele pra clicar no elemento certo e copiar o seletor gerado,
>    sem precisar reconstruir o cenário manualmente toda vez. Também tira
>    um screenshot automático em `downloads/erro_<etapa>_<timestamp>.png`.
>    Recomendado rodar com `CLIENTES_ATIVOS=CLIENTE_A` no primeiro teste,
>    pra não abrir vários Inspectors ao mesmo tempo.
> 3. Primeiro seletor que realmente bloqueia hoje: **campo de busca de
>    produto** (seção 8) — é o primeiro `TODO` que a execução alcança.
> 4. Demais seletores ainda faltando capturar, em ordem de aparição no
>    fluxo (priorizar `id` > `label` > `placeholder` > texto visível >
>    estrutural):
>    - Comboboxes de tipo de operação / finalidade / indicador de presença (seção 6)
>    - Campo de busca de produto (seção 8) ← tentativa automática via
>      combobox SLDS já no código; se não funcionar, é o primeiro ponto
>      que bloqueia hoje
>    - Campos de quantidade e valor unitário do produto (seção 8)
>    - Campo do código de benefício fiscal (seção 8) — dado já sabido, só falta o input
>    - Campos de situação tributária do ICMS e origem da mercadoria (seção 8)
>    - Campo de modalidade de transporte (seção 9)
>    - Botão final de emissão (seção 11) ← tentativa automática por nome
>      "Emitir" já no código
>    - Fluxo de cancelamento: Consultar → localizar nota → botão Cancelar
>
> **Também corrigido (16/08):** `validar_antes_de_emitir` usava `input()`
> sem proteção — com os 3 clientes em paralelo (RF14), dois prompts de
> confirmação simultâneos podiam disputar o mesmo terminal. Agora está
> serializado com um lock (testado com threads de verdade em
> `tests/test_emissao.py`, não só sintaxe).

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
  ⚠️ **Seletor do campo ainda não capturado** — TODO no código.
* **Inscrição estadual usada:** `9096853200`
* **Nome/Razão social usado:** `COOPERATIVA DOS AGRICULTORES FAMILIARES DOS MUN. DA AMENORTE`
* **País:** já vem preenchido como Brasil por padrão.
* **CEP usado:** `87209-064` — ao sair do campo, preenche endereço
  automaticamente (logradouro, bairro, UF, município).
* **Número usado:** `968`

> Regra fiscal (Contribuinte vs. isento vs. não contribuinte) ainda precisa
> validação documental antes de virar regra rígida — não travar a
> automação numa hipótese não confirmada.

---

## 6. Identificação da operação

* **Natureza da operação:** `Venda` — combobox confirmado: `#combobox-id-1`.
  No código, a opção é selecionada **pelo texto** (`get_by_text`), não por
  posição — o próprio reconhecimento já apontava esse risco
  (`li:nth-child(26)` era só provisório).
* **Tipo de operação:** hipótese `Saída` (fluxo de venda) — combobox ainda
  não identificado.
* **Finalidade da emissão:** hipótese `Nota fiscal eletrônica normal` —
  combobox ainda não identificado.
* **Indicador de presença:** hipótese `Operação não presencial pela
  internet` — combobox ainda não identificado.
* **Demais indicadores:** mantidos no padrão do sistema, não alterados.

> Nenhuma dessas hipóteses deve virar regra fixa sem validação fiscal
> documental — estão marcadas como `logger.warning(...)` no código, não
> preenchidas automaticamente ainda.

---

## 7. Local de retirada/entrega

Valores permaneceram no padrão durante o reconhecimento. Etapa tratada no
código como "avançar sem alterar" — seletores específicos ainda não
registrados (só serão necessários se a operação exigir mudança aqui).

---

## 8. Produtos — BLOQUEIO ATUAL

Campos observados na etapa: descrição, código, NCM, CFOP, unidade
comercial, quantidade, valor unitário, benefício fiscal, código do
benefício fiscal, PIS, COFINS, IPI, origem da mercadoria.

### Confirmado

* Produto pode ser localizado pelo **código** (preferível à descrição, que
  pode retornar múltiplas opções).
* Fluxo: `Código → busca → sugestões → seleção`.
* Existe **benefício fiscal** nesta operação (`possui_beneficio_fiscal = Sim`).
* Existe e é usado um **código de benefício fiscal** — mas o valor em si
  **não foi localizado**. Este é o bloqueio atual.
* CFOP confirmado por descrição: **"Venda de produção do estabelecimento"**
  (código numérico ainda não confirmado).
* Cadastro prévio de produtos deve conter: código, descrição, NCM, CFOP,
  unidade comercial, benefício fiscal, código do benefício fiscal.

### Ainda não confirmado

* Seletor do campo de busca de produto.
* Se a 1ª sugestão da busca é sempre a correta (observado no fluxo, mas não
  confirmado como regra estrutural).
* PIS, COFINS, IPI, origem da mercadoria — se são manuais, automáticos,
  padrão ou derivados de outro campo.
* Como adicionar/editar/remover mais de um produto na mesma nota.

**Não inventar nenhum desses valores na automação** — é exatamente por
isso que `preencher_item()` levanta `DadosFiscaisIncompletos` neste ponto
em vez de seguir adiante.

---

## 9. Transporte

* **Modalidade de frete/transporte usada:** `3` (confirmado no fluxo, mas
  o **nome exato do campo** ainda precisa ser conferido na interface).
* Ainda não confirmado: se o valor `3` é sempre igual, se há campo
  obrigatório adicional, se a etapa pode simplesmente ser avançada em
  todos os casos.

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
