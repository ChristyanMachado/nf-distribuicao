# Handoff — Estado Atual

## Atualização de contexto — 24/08/2026

O marco anterior `59da6cc` implementou a relação emitente por tarefa no Web. O teste/demonstração mais recente confirmou preenchimento em homologação com múltiplos contextos, sem clicar em **Emitir**. A carga local (transmissão e outros programas) afetou a velocidade, mas falhas continuaram isoladas por contexto.

Decisões de domínio registradas em `docs/REUNIAO-2026-08-22.md`:

- execução automática de tarefas entre 00:00 e 06:00;
- relação N:N entre emitentes e clientes, escolhida por tarefa;
- preço padrão por produto+cliente, com override promocional;
- relatório operacional bruto separado do financeiro líquido futuro.

### Atenções antes da próxima implementação

1. A relação N:N foi implementada e a migração `web/src/db/migrations/0001_emitente_por_tarefa.sql` foi aplicada ao banco de teste. Ela mantém `clientes.emitente_id` apenas como legado. Os logins de emitentes não foram alterados.
2. O Worker ainda usa dados hardcoded para a demonstração. Priorizar contrato de tarefa + carregamento do banco/fila em vez de adicionar novos valores fixos.
3. Confirmar visualmente o relatório após aplicar a migração. A causa de troca cancelada no KPI foi corrigida e coberta por teste unitário.
4. Antes de ligar a emissão, reconhecer a tela final em homologação e apenas identificar (sem clicar) o botão de emitir.
5. Não integrar Web e Worker por leitura direta improvisada. Primeiro definir e testar o contrato de tarefa, estados e reserva/retorno; ver `docs/ROADMAP.md`.

### Implementado nesta rodada — 24/08/2026

- Corrigida a separação entre smoke test e preenchimento: autenticação ou
  navegação sem `tarefa_real.json` não tenta mais alterar uma tarefa ausente.
- `CLIENTE_X_EMITENTE` deixou de ser obrigatório para login/navegação; é
  validado com mensagem clara apenas quando há preenchimento completo.
- `AMBIENTE_EMISSAO` agora é repassado por `main.py` para
  `navegar_ate_emissao()`. Assim, o valor configurado controla de fato o
  caminho de homologação/produção.
- Atualizados `.env.example` e testes unitários. Testes do Worker: **37
  passando**; `compileall` e `git diff --check` também passaram.

Próxima implementação recomendada: documentar e implementar o contrato de
leitura de tarefas Web → Worker, inicialmente com uma fonte local/testável e
sem emissão real. O detalhamento por fases está em `docs/ROADMAP.md`.

### Continuação — contrato e implantação proposta

- Criado `worker/src/contrato_tarefa.py`: valida o contrato versionado v1 e
  converte o payload seguro para o modelo fiscal, sem banco, navegador ou
  credenciais.
- Cobertos em teste: payload válido, versão desconhecida, código fiscal de
  produto ausente, endereço ausente, referência de credencial ausente, IE
  obrigatória e benefício fiscal sem código.
- Testes do Worker após esta alteração: **44 passando**, sem navegador,
  banco ou credenciais.
- Criado `docs/DEPLOYMENT.md`: recomenda Web no Vercel e Worker persistente
  em VM/container. Oracle Always Free é opção de piloto, sujeita a uma prova
  de capacidade; não confundir com uma garantia de produção.

### Implementado nesta rodada — 22/08/2026

- tabela N:N `cliente_emitentes`, com migração dos vínculos antigos;
- `tarefas.emitente_id`, gravado no momento da distribuição;
- tarefas pendentes agora são agrupadas por cliente + emitente + data;
- cadastro de cliente permite habilitar múltiplos emitentes;
- distribuição exige a escolha de emitente para cada cliente com quantidade faturável;
- listagem de tarefas exibe o emitente escolhido;
- 25 testes unitários, verificação de tipos e build de produção passaram.

`npm run db:generate` e `npm run db:migrate` continuam falhando nesta máquina
devido ao erro do sistema operacional (`uv_os_get_passwd ... ENOMEM`). A
migração foi aplicada por um executor direto que usa a mesma transação e o
mesmo histórico/hash do Drizzle, sem expor credenciais. Validação posterior:
1 emitente preservado, 2 relações cliente↔emitente e zero tarefas ou
distribuições sem emitente.

Também foi corrigido o cálculo de **Perdido em trocas**: trocas associadas a
tarefa cancelada não entram mais no KPI. A correção grava o emitente na
distribuição, relaciona distribuição→tarefa no relatório e filtra
`CANCELADA` no cálculo.

---

Última alteração — preenchimento completo da NFP-e em homologação validado

O teste ao vivo de 21/08/2026 foi concluído com sucesso no ambiente de TESTE (homologação), sem clicar em Emitir.

Resultado validado ao vivo

O fluxo completo de preenchimento percorreu:

Login → Produtor Rural → NFP-e → NFP-e TESTES → Emissão - TESTE → Consentimento → Emitente → Destinatário → Identificação da operação → Local de retirada/entrega → Produtos → ICMS → tela Adicionar Produto/Avançar → Transporte

Foram validados:

1 produto: preenchimento completo até Transporte.

2 produtos: mesmo fluxo, usando Adicionar Produto entre os itens, com sucesso.

Transporte: Modalidade do Frete = 3 selecionado e Avançar executado com sucesso.

O fluxo termina antes de validar_antes_de_emitir() / emitir() de propósito.

Log final validado:

PREENCHIMENTO COMPLETO OK — parado antes de 'Emitir' (não implementado/testado de propósito)
Concluído com sucesso
AUTENTICAÇÃO OK

Principais correções implementadas durante o reconhecimento ao vivo

1. Destinatário / CEP e número

O CEP dispara uma atualização dinâmica da seção de endereço e pode recriar/apagar o campo Número. O fluxo validado ficou:

CEP → Tab → aguarda loading → 1s → localiza Número novamente → preenche Número → valida valor → Avançar

O indicador de carregamento observado foi:

#app > div.slds-align_absolute-center.loading

Não usar Enter no CEP: durante os testes, Enter podia submeter o formulário em vez de apenas disparar a atualização.

2. Produto / Código do Produto

O seletor genérico input.default-input.slds-input[aria-controls] encontrou três autocompletes visíveis e foi abandonado.

O seletor final usa o label como âncora:

label("Código do Produto") → pai → input.default-input.slds-input

Fluxo validado:

click → fill(código) → ArrowDown → Enter

3. Campos do produto

Foi confirmado que Unidade Comercial, Quantidade Comercial e Valor Unitário Comercial são três campos distintos no mesmo layout. Não usar nth-child genérico para quantidade/valor.

Os campos passaram a ser localizados pelo respectivo label:

Unidade Comercial → autocomplete → ArrowDown + Enter

Quantidade Comercial → input do bloco do label

Valor Unitário Comercial → input do bloco do label

4. Benefício fiscal

Localização pelo legend Possui benefício fiscal? e seleção de Sim dentro do bloco.

Código do benefício pelo label Código de Benefício Fiscal na UF e input do bloco correspondente.

Valor usado e validado no ambiente de teste: PR810128.

5. ICMS

Ambos os campos passaram a usar label → pai → select.slds-select:

Situação Tributária ICMS → value 40

Origem da mercadoria → value 0

6. Fluxo real de múltiplos produtos

Foi corrigida uma interpretação anterior do fluxo. A etapa de Produtos possui uma tela intermediária depois do segundo Avançar de cada item:

Produto
  ↓ Avançar
ICMS
  ↓ Avançar
Tela: Adicionar Produto / Avançar
  ├─ outro produto → Adicionar Produto → próximo Produto
  └─ último produto → Avançar → Transporte

Portanto:

preencher_item() preenche um único produto e termina na tela Adicionar Produto / Avançar.

preencher_produtos() decide se chama Adicionar Produto ou se clica Avançar para Transporte.

Esse comportamento foi validado com dois produtos reais de teste.

7. Botão Avançar nas etapas de Produto

As etapas de produto podem apresentar mais de um botão Avançar em alguns estados. Foi criado fluxo específico para produtos, em vez de alterar o helper global usado nas demais etapas.

8. Transporte

O campo foi validado pelo padrão:

label("Modalidade do Frete") → pai → select.slds-select

Valor testado:

3 = Transporte Próprio por conta do Remetente

Também foi necessário tratar o Avançar da etapa de transporte separadamente porque a tela pode conter mais de um botão com o mesmo nome em alguns estados.

Regra de seletores consolidada

O reconhecimento ao vivo confirmou que os componentes desse formulário reutilizam classes e estruturas. A estratégia que funcionou melhor foi:

label/legend → elemento pai → input/select

Para autocompletes:

label → pai → input → click → fill → ArrowDown → Enter

Evitar cadeias longas de nth-child sempre que um label, role, texto ou outro atributo estável estiver disponível.

Ambiente de teste

AMBIENTE_EMISSAO=teste continua sendo o padrão.

Caminho:

Login → Produtor Rural → NFP-e → NFP-e TESTES → Emissão - TESTE

O fluxo usa o ambiente de homologação da Receita PR e o teste atual não executa a emissão.

Estado atual do projeto

Funcionando e validado ao vivo:

autenticação

navegação até homologação

consentimento

emitente

destinatário

CEP + sincronização do endereço

número do endereço

identificação da operação

local de retirada/entrega

busca/seleção de produto

CFOP

unidade comercial

quantidade

valor unitário

benefício fiscal

código do benefício

situação tributária ICMS

origem da mercadoria

múltiplos produtos

transição para Transporte

modalidade do frete

transição após Transporte

Ainda não implementado/testado:

tela de resumo/validação fiscal final em detalhe

botão Emitir

download de PDF/XML

cancelamento

fluxo completo de emissão real

Próximo passo

Reconhecer a tela de Resumo/Validação final no ambiente de teste, documentar seus campos/validações e identificar o botão de emissão sem clicar nele.

Depois disso, implementar o fluxo de download de documentos e somente então decidir como conduzir o teste controlado de emissão.

Histórico anterior

Ambiente de TESTE (homologação) + correção de bug real

O teste ao vivo de 20/08 confirmou que tentativas no ambiente fiscal normal ficam registradas no histórico do governo mesmo sem clicar em Emitir. Por isso foi criado e ligado por padrão o ambiente de homologação (NFP-e TESTES → Emissão - TESTE).

src/auth.py: navegar_ate_emissao() ganhou ambiente: Literal["normal", "teste"] = "teste".

src/config.py: adicionada AMBIENTE_EMISSAO com default "teste".

main.py: passa o ambiente para a navegação e registra warning explícito quando está em teste.

worker/RECON.md: adicionada a seção do ambiente de teste.

O bug inicial do CNPJ também foi confirmado e corrigido: o seletor amplo pegava o radio de CPF em vez do input de CNPJ. A solução foi restringir o input com :not([type=radio]) e :visible.

Revisão de segurança, robustez e desempenho

Mantidas as correções já documentadas para:

CredencialCliente.__repr__() sem vazamento de credenciais.

mensagens protegidas em erros de preenchimento de login.

INSPECIONAR=true sem page.pause() em headless.

src/utils/debug.py convertido para Async.

MAX_CONCORRENCIA via asyncio.Semaphore.

isolamento por BrowserContext.

fechamento de contextos/browser em finally.

falha isolada de uma tarefa sem derrubar as demais.

Migração para Async Playwright

O projeto foi migrado de Sync Playwright + ThreadPoolExecutor para:

Async Playwright + 1 Browser + N BrowserContexts + asyncio.gather()

Não misturar Page Sync com Page Async.

Regra de colaboração

Antes de alterar código:

git status
git diff

Após alterar:

testar
documentar
atualizar este arquivo

Ler docs/AI-CONTEXT.md antes de decisões arquiteturais.
