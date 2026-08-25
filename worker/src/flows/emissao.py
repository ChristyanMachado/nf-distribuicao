"""
RF13 (passos 4-10), RF15: preenchimento da NFP-e a partir do reconhecimento
manual de 13/08 (worker/RECON.md) e do reconhecimento ao vivo de 20/08,
contra o sistema real da Receita/PR.

Convertido para a API Async do Playwright em 20/08, para poder ser chamado
a partir do mesmo Context/Page Async usados em src/auth.py e main.py — o
projeto proíbe misturar Page Sync com Page Async (ver docs/ARCHITECTURE.md).

Princípio seguido neste arquivo (importante, não é só estilo de código):
seletor incerto é aceitável — vamos rodar em modo visível e corrigir o que
quebrar, é o fluxo normal de desenvolver com Playwright. DADO FISCAL
inventado não é aceitável — nunca preenchemos CFOP, código de benefício
fiscal, PIS/COFINS/IPI etc. com um valor chutado só para o fluxo continuar.
"""
from __future__ import annotations

import json
import logging
import os
import re
import threading
from datetime import datetime, timezone
from dataclasses import dataclass, field

from playwright.async_api import Page

# Protege input() de concorrência: com RF14 (3 sessões em paralelo), se dois
# clientes chegarem na conferência humana ao mesmo tempo, dois input()
# simultâneos disputam o mesmo terminal e a resposta pode ir pro cliente
# errado. O lock serializa — um prompt de cada vez, na ordem de chegada.
#
# ⚠️ Nota (20/08, pós-migração Async): com asyncio.gather() todas as tarefas
# rodam na MESMA thread (event loop único), diferente do ThreadPoolExecutor
# anterior. Um input() bloqueante já trava o loop inteiro sozinho, então
# esse lock virou redundante para o caso Async — mas inofensivo, e ainda
# necessário caso este módulo volte a ser chamado por múltiplas threads no
# futuro. Não removido por precaução; revisar se/quando validar_antes_de_emitir
# for chamada de fato pelo fluxo Async orquestrado.
_LOCK_CONFIRMACAO_HUMANA = threading.Lock()


class DadosFiscaisIncompletos(Exception):
    """
    Levantada quando falta um DADO (não um seletor) necessário para
    preencher um campo fiscal com segurança. Nunca deve ser contornada
    inventando o valor — a correção é obter o dado real e completar o
    cadastro do produto/tarefa.
    """


# ---------------------------------------------------------------------------
# Modelo de dados da tarefa — reflete exatamente os campos que o formulário
# da NFP-e pede, na ordem em que aparecem (RECON.md seções 4-9).
# ---------------------------------------------------------------------------


@dataclass
class Emitente:
    valor_select: str  # value do <option> em #div-identificacao select


@dataclass
class Destinatario:
    cnpj: str
    indicador_ie: str  # "CONTRIBUINTE" | "CONTRIBUINTE_ISENTO" | "NAO_CONTRIBUINTE"
    razao_social: str
    cep: str
    numero_endereco: str
    inscricao_estadual: str | None = None  # obrigatória quando indicador_ie == CONTRIBUINTE


@dataclass
class ItemTarefa:
    produto_descricao: str
    codigo_produto: str  # usado na busca do produto (RECON.md seção 8)
    unidade: str
    quantidade: float
    preco_unitario: float
    cfop_texto: str = "Venda de produção do estabelecimento"  # confirmado no reconhecimento
    cfop_codigo: str = "5101"  # confirmado — value do <option> (reconhecimento ao vivo 20/08)
    situacao_tributaria_icms: str = "40"  # confirmado — opções observadas: 40, 41, 50
    origem_mercadoria: str = "0"  # confirmado — 0 = Nacional
    possui_beneficio_fiscal: bool = True  # confirmado no reconhecimento
    # Confirmado 15/08: código único, compartilhado por todos os produtos
    # ("é do produto, todo produto tem que colocar ele... seria o mesmo pra
    # todos"). Valor real: PR810128.
    codigo_beneficio_fiscal: str | None = "PR810128"


@dataclass
class Tarefa:
    tarefa_id: str
    cliente_id: str
    emitente: Emitente
    destinatario: Destinatario
    itens: list[ItemTarefa] = field(default_factory=list)
    # Confirmados no reconhecimento ao vivo de 20/08 — o texto aqui precisa
    # bater exatamente com o texto visível da <option> real (usado como
    # âncora em _selecionar_select_por_opcao_ancora), não é só descritivo.
    natureza_operacao: str = "Venda"
    tipo_operacao: str = "Saída"
    finalidade_emissao: str = "NF-e normal"
    indicador_presenca: str = "Operação não presencial, pela Internet"
    modalidade_frete: str = "3"  # confirmado: "Transporte Próprio por conta do Remetente"


# Campos de nível superior do JSON que não são passados direto pro
# construtor de Tarefa (são tratados/aninhados à parte por carregar_tarefa_de_json).
_CAMPOS_JSON_ESPECIAIS = {"_comentario", "emitente", "destinatario", "itens"}


def carregar_tarefa_de_json(caminho: str) -> Tarefa:
    """
    Carrega uma Tarefa a partir de um arquivo no formato de
    tarefa_real.json.template. Não inventa nenhum valor: qualquer campo
    obrigatório ausente estoura TypeError na construção do dataclass, o que
    é o comportamento certo (falhar explicitamente em vez de assumir).
    """
    with open(caminho, "r", encoding="utf-8") as arquivo:
        dados = json.load(arquivo)

    emitente = Emitente(**dados["emitente"])
    destinatario = Destinatario(**dados["destinatario"])
    itens = [ItemTarefa(**item) for item in dados.get("itens", [])]

    campos_restantes = {
        chave: valor for chave, valor in dados.items() if chave not in _CAMPOS_JSON_ESPECIAIS
    }

    return Tarefa(
        emitente=emitente,
        destinatario=destinatario,
        itens=itens,
        **campos_restantes,
    )


# ---------------------------------------------------------------------------
# Mapeamento texto de opção -> value real do <option>, confirmado via
# reconhecimento ao vivo de 20/08 direto no HTML dos <select> reais.
# ---------------------------------------------------------------------------

TIPO_OPERACAO_OPCOES = {
    "Entrada": "0",
    "Saída": "1",
}
FINALIDADE_EMISSAO_OPCOES = {
    "NF-e normal": "1",
    "NF-e complementar": "2",
    "NF-e de ajuste": "3",
    "Devolução de Mercadoria": "4",
}
INDICADOR_PRESENCA_OPCOES = {
    "Não se aplica": "0",
    "Operação presencial": "1",
    "Operação não presencial, pela Internet": "2",
    "Operação não presencial, Teleatendimento": "3",
    "Operação não presencial, outros": "9",
}

# Âncoras únicas por combobox: um texto que só existe naquele <select>
# específico, usado para localizá-lo sem depender da estrutura/posição do
# layout (mais robusto que nth-child, e não exige um id estável).
_ANCORA_TIPO_OPERACAO = "Entrada"
_ANCORA_FINALIDADE_EMISSAO = "NF-e complementar"
_ANCORA_INDICADOR_PRESENCA = "Teleatendimento"


# ---------------------------------------------------------------------------
# Passos do fluxo
# ---------------------------------------------------------------------------


async def clicar_avancar(page: Page, logger: logging.Logger) -> None:
    botoes = page.get_by_role("button", name="Avançar")

    total = await botoes.count()

    logger.info(f"Botões 'Avançar' encontrados: {total}")

    candidatos = []

    for i in range(total):
        botao = botoes.nth(i)

        if await botao.is_visible() and await botao.is_enabled():
            candidatos.append(botao)

    if len(candidatos) != 1:
        raise RuntimeError(
            f"Esperado exatamente 1 botão 'Avançar' visível e habilitado, "
            f"encontrados {len(candidatos)}."
        )

    await candidatos[0].click()

    logger.info("Avançar clicado — aguardando 1 segundos para a interface estabilizar")

    await page.wait_for_timeout(1000)

async def clicar_avancar_produto(
    page: Page,
    logger: logging.Logger
) -> None:
    """
    Avança dentro da etapa de produtos.

    A tela de produtos pode manter mais de um botão 'Avançar'
    visível/habilitado ao mesmo tempo. Nesse caso, usamos o último
    candidato visível/habilitado, que corresponde ao botão da etapa
    atualmente ativa.
    """

    botoes = page.get_by_role(
        "button",
        name="Avançar"
    )

    total = await botoes.count()

    candidatos = []

    for i in range(total):
        botao = botoes.nth(i)

        if await botao.is_visible() and await botao.is_enabled():
            candidatos.append(botao)

    logger.info(
        f"Botões 'Avançar' visíveis e habilitados na etapa de produtos: "
        f"{len(candidatos)}"
    )

    if len(candidatos) == 0:
        raise RuntimeError(
            "Nenhum botão 'Avançar' visível e habilitado "
            "encontrado na etapa de produtos."
        )

    # Assim como no transporte, o último botão corresponde à etapa atual.
    await candidatos[-1].click()

    logger.info(
        "Avançar da etapa de produtos clicado — aguardando 1 segundo"
    )

    await page.wait_for_timeout(1000)


async def aceitar_consentimento(page: Page, logger: logging.Logger) -> None:
    logger.info("Aceitando consentimento inicial")
    # Confirmado via reconhecimento ao vivo 20/08.
    await page.locator("#div-consentimento input[type=checkbox]").check()


async def selecionar_emitente(page: Page, emitente: Emitente, logger: logging.Logger) -> None:
    logger.info(f"Selecionando emitente (value={emitente.valor_select})")
    # Seletor simplificado (<select> dentro de #div-identificacao) —
    # reconfirmado como válido no reconhecimento ao vivo de 20/08.
    await page.locator("#div-identificacao select").select_option(value=emitente.valor_select)

    # O sistema preenche razão social/CNPJ/endereço automaticamente após a
    # seleção (RECON.md seção 4). Esperar a rede assentar é mais confiável
    # que um tempo fixo.
    await page.wait_for_load_state("networkidle", timeout=5000)

    await clicar_avancar(page, logger)




async def preencher_destinatario(
    page: Page,
    destinatario: Destinatario,
    logger: logging.Logger
) -> None:
    logger.info(f"Preenchendo destinatário: {destinatario.razao_social}")

    # Tipo de identificação: CNPJ.
    await page.get_by_text("CNPJ", exact=True).first.click()

    # Campo CNPJ visível.
    campo_cnpj = page.locator(
        "div.slds-form-element.slds-col.slds-size_3-of-12 "
        "input:not([type=radio]):visible"
    ).first

    await campo_cnpj.fill(destinatario.cnpj)

    # Confirmado: somente o fluxo CONTRIBUINTE foi reconhecido.
    if destinatario.indicador_ie != "CONTRIBUINTE":
        raise DadosFiscaisIncompletos(
            "Só o fluxo CONTRIBUINTE (1 — Contribuinte ICMS, que já vem "
            "selecionado por padrão) foi reconhecido no sistema real. "
            "Reconhecer os demais casos antes de usar."
        )

    # Inscrição Estadual.
    if destinatario.inscricao_estadual:
        await page.locator(
            "div.slds-grid.slds-wrap.slds-gutters "
            "> div:nth-child(7) input:visible"
        ).fill(destinatario.inscricao_estadual)

    # Razão Social.
    await page.locator(
        "div.slds-form-element.slds-col.slds-size_12-of-12 "
        "input:visible"
    ).first.fill(destinatario.razao_social)

    # ================================================================
    # CEP
    # ================================================================

    cep = page.locator(
        "#div-endereco div.slds-form-element.slds-col.slds-size_12-of-12 "
        "input:visible"
    ).first

    await cep.wait_for(state="visible")

    logger.info("Preenchendo CEP")

    await cep.fill(destinatario.cep)

    logger.info(
        f"CEP preenchido: {await cep.input_value()!r}"
    )

    # IMPORTANTE:
    #
    # Não usamos Enter aqui.
    #
    # O comportamento observado indica que Enter pode estar submetendo
    # o formulário e causando o "reload" que está fazendo a interface
    # desaparecer/reaparecer.
    #
    # O fluxo original utilizava Tab para sair do campo e disparar a
    # atualização do CEP.
    await cep.press("Tab")

    logger.info(
        "Tab pressionado no CEP — aguardando processamento do endereço"
    )

    # ================================================================
    # CARREGAMENTO DO CEP
    # ================================================================

    loading = page.locator(
        "#app > div.slds-align_absolute-center.loading"
    )

    # Primeiro tentamos observar o início do carregamento.
    #
    # O timeout é curto de propósito: se a consulta for extremamente
    # rápida e o loading já tiver desaparecido, não devemos considerar
    # isso uma falha.
    try:
        await loading.wait_for(
            state="visible",
            timeout=3000
        )

        logger.info(
            "Loading do CEP apareceu — aguardando desaparecer"
        )

        await loading.wait_for(
            state="hidden",
            timeout=15000
        )

        logger.info(
            "Loading do CEP desapareceu"
        )

    except Exception as erro:
        logger.info(
            f"Loading não foi observado diretamente: {erro}"
        )

    # Margem adicional solicitada para garantir que a interface termine
    # de atualizar depois do desaparecimento do loading.
    logger.info(
        "Aguardando 1 segundo após o processamento do CEP"
    )

    await page.wait_for_timeout(1000)

    # ================================================================
    # NÚMERO
    # ================================================================

    # Localizamos o elemento NOVAMENTE.
    #
    # Isso é proposital: a aplicação pode recriar os inputs durante
    # a consulta do CEP.
    numero = page.locator(
        "#div-endereco input.slds-input"
    ).nth(2)

    await numero.wait_for(
        state="visible",
        timeout=10000
    )

    logger.info(
        "Campo Número localizado após processamento do CEP"
    )

    await numero.fill(
        str(destinatario.numero_endereco)
    )

    logger.info(
        f"Número preenchido: {await numero.input_value()!r}"
    )

    # ================================================================
    # ESPERA EXTRA — 1 SEGUNDOS
    # ================================================================

    logger.info(
        "Aguardando 1 segundos antes de clicar em Avançar"
    )

    await page.wait_for_timeout(1000)

    # Confirma explicitamente que o valor ainda está no campo.
    valor_numero = await numero.input_value()

    logger.info(
        f"Número imediatamente antes do Avançar: {valor_numero!r}"
    )

    if valor_numero != str(destinatario.numero_endereco):
        raise RuntimeError(
            "O número do endereço desapareceu ou foi alterado antes "
            "do Avançar. "
            f"Esperado={str(destinatario.numero_endereco)!r}, "
            f"encontrado={valor_numero!r}."
        )

    logger.info(
        "Número confirmado no campo — clicando em Avançar"
    )

    await clicar_avancar(page, logger)

    # ================================================================
    # PRÓXIMA ETAPA
    # ================================================================

    logger.info(
        "Aguardando próxima etapa..."
    )

    await page.locator("#combobox-id-1").wait_for(
        state="visible",
        timeout=10000
    )

    logger.info(
        "Próxima etapa carregada"
    )
async def selecionar_combobox_por_texto(
    page: Page, combobox_selector: str, texto: str, logger: logging.Logger
) -> None:
    """
    Helper genérico para os comboboxes estilo SLDS (Salesforce Lightning) —
    ex: Natureza da operação, campo de texto com dropdown/listbox.
    Localiza a opção pelo TEXTO em vez de posição.
    """
    await page.locator(combobox_selector).click()
    await page.get_by_text(texto, exact=True).click()


async def _selecionar_select_por_opcao_ancora(
    page: Page, texto_ancora: str, valor: str, logger: logging.Logger
) -> None:
    """
    Localiza um <select> comum (não-combobox SLDS) através de uma <option>
    com texto ÚNICO daquele combobox específico ("âncora"), e seleciona a
    opção desejada pelo VALUE. Mais robusto que nth-child porque depende só
    do conteúdo do próprio <select>, não da posição no layout — os três
    comboboxes de Identificação da Operação (Tipo/Finalidade/Indicador)
    tinham caminhos estruturais praticamente idênticos no reconhecimento ao
    vivo de 20/08, o que tornaria nth-child frágil e ambíguo.
    """
    select = page.locator("select").filter(
        has=page.locator("option", has_text=texto_ancora)
    )
    await select.select_option(value=valor)


async def preencher_identificacao_operacao(page: Page, tarefa: Tarefa, logger: logging.Logger) -> None:
    logger.info(f"Identificação da operação: natureza={tarefa.natureza_operacao}")

    # Confirmado: #combobox-id-1 é a Natureza da operação (campo de texto
    # com listbox, não um <select> comum).
    await selecionar_combobox_por_texto(page, "#combobox-id-1", tarefa.natureza_operacao, logger)

    # Confirmado no reconhecimento ao vivo 20/08 — os três abaixo já são
    # <select> comuns de verdade (não comboboxes SLDS), com value/texto de
    # opção confirmados em TIPO_OPERACAO_OPCOES / FINALIDADE_EMISSAO_OPCOES /
    # INDICADOR_PRESENCA_OPCOES.
    logger.info(f"Tipo de operação: {tarefa.tipo_operacao}")
    await _selecionar_select_por_opcao_ancora(
        page, _ANCORA_TIPO_OPERACAO, TIPO_OPERACAO_OPCOES[tarefa.tipo_operacao], logger
    )

    logger.info(f"Finalidade da emissão: {tarefa.finalidade_emissao}")
    await _selecionar_select_por_opcao_ancora(
        page, _ANCORA_FINALIDADE_EMISSAO, FINALIDADE_EMISSAO_OPCOES[tarefa.finalidade_emissao], logger
    )

    logger.info(f"Indicador de presença: {tarefa.indicador_presenca}")
    await _selecionar_select_por_opcao_ancora(
        page, _ANCORA_INDICADOR_PRESENCA, INDICADOR_PRESENCA_OPCOES[tarefa.indicador_presenca], logger
    )

    await clicar_avancar(page, logger)


async def avancar_local_retirada(page: Page, logger: logging.Logger) -> None:
    """RECON.md seção 7 — valores padrão observados, sem alteração necessária."""
    logger.info("Local de retirada/entrega: mantendo padrão do sistema")
    await clicar_avancar(page, logger)


# ---------------------------------------------------------------------------
# Produtos — seletores confirmados no reconhecimento ao vivo de 20/08.
#
# Descoberta importante deste reconhecimento: a etapa de produtos NÃO é uma
# tela única. Ela tem DOIS "Avançar" internos:
#   1) Descrição/Código/CFOP/Unidade/Quantidade/Valor/Benefício fiscal
#      -> Avançar
#   2) ICMS: Situação tributária + Origem da mercadoria
#      -> Avançar
# Só depois desse segundo Avançar é que aparece (se houver mais produtos) o
# botão "Adicionar Produto", que reabre o formulário do passo 1 para o
# próximo item. O último Avançar (sem mais produtos a adicionar) segue para
# Transporte. Isso mudou a estrutura de preencher_item()/preencher_produtos()
# abaixo — antes elas assumiam uma tela única.
# ---------------------------------------------------------------------------

# Base comum dos seletores estruturais da seção "Dados do Produto" —
# confirmada ao vivo, mas ainda é um caminho estrutural (⚠️ frágil a
# mudanças de layout — reconfirmar se algo aqui parar de funcionar).
_BASE_DADOS_PRODUTO = (
    "#app > div:nth-child(1) > div > div.slds-tabs_default__content > div > div > div > div > div:nth-child(2)"
)


async def buscar_produto(
    page: Page,
    item: ItemTarefa,
    logger: logging.Logger
) -> None:
    """
    Busca o produto pelo Código do Produto.

    Fluxo confirmado manualmente:
        1. Localizar o campo pelo label "Código do Produto"
        2. Clicar no input
        3. Preencher o código
        4. ArrowDown
        5. Enter
    """

    codigo = str(item.codigo_produto).strip()

    logger.info(f"Buscando produto por código: {codigo}")

    # Localiza o label pelo texto e sobe para o div que contém
    # tanto o label quanto o input correspondente.
    campo_codigo = (
        page.locator("label")
        .filter(has_text="Código do Produto")
        .locator("..")
        .locator('input.default-input.slds-input')
    )

    await campo_codigo.wait_for(
        state="visible",
        timeout=10000
    )

    logger.info("Campo Código do Produto localizado")

    # Clica no campo.
    await campo_codigo.click()

    # Preenche o código.
    await campo_codigo.fill(codigo)

    logger.info(
        f"Código preenchido: {await campo_codigo.input_value()!r}"
    )

    # Seleciona a primeira sugestão.
    await campo_codigo.press("ArrowDown")

    logger.info("ArrowDown pressionado")

    # Confirma a sugestão.
    await campo_codigo.press("Enter")

    logger.info(
        f"Produto '{codigo}' selecionado"
    )

    # Aguarda o sistema preencher os dados automáticos do produto.
    await page.wait_for_timeout(1000)

    logger.info("Dados automáticos do produto aguardados")
    
async def preencher_item(
    page: Page,
    item: ItemTarefa,
    logger: logging.Logger
) -> None:
    """
    Preenche um item da NFP-e.

    Fluxo:
        1. Código do Produto
        2. CFOP
        3. Unidade Comercial
        4. Quantidade Comercial
        5. Valor Unitário Comercial
        6. Benefício fiscal
        7. Avançar
        8. ICMS
        9. Avançar
    """

    # ================================================================
    # PRODUTO
    # ================================================================

    await buscar_produto(page, item, logger)

    # ================================================================
    # CFOP
    # ================================================================

    logger.info(
        f"Selecionando CFOP: {item.cfop_codigo} "
        f"({item.cfop_texto})"
    )

    cfop = (
        page.locator("label")
        .filter(has_text="CFOP")
        .locator("..")
        .locator("select.slds-select")
    )

    await cfop.wait_for(
        state="visible",
        timeout=10000
    )

    await cfop.select_option(
        value=item.cfop_codigo
    )

    logger.info(
        f"CFOP selecionado: {await cfop.input_value()!r}"
    )

    # ================================================================
    # UNIDADE COMERCIAL
    # ================================================================

    logger.info(
        f"Unidade Comercial: {item.unidade}"
    )

    unidade = (
        page.locator("label")
        .filter(has_text="Unidade Comercial")
        .locator("..")
        .locator("input.default-input.slds-input")
    )

    await unidade.wait_for(
        state="visible",
        timeout=10000
    )

    await unidade.click()

    await unidade.fill(
        str(item.unidade)
    )

    logger.info(
        f"Unidade preenchida: "
        f"{await unidade.input_value()!r}"
    )

    # A Unidade Comercial é um autocomplete, assim como o Código do
    # Produto. Selecionamos a primeira sugestão com ArrowDown + Enter.
    await unidade.press("ArrowDown")

    logger.info(
        "ArrowDown pressionado na Unidade Comercial"
    )

    await unidade.press("Enter")

    logger.info(
        f"Unidade Comercial '{item.unidade}' selecionada"
    )

    # Pequena margem para a interface concluir a seleção.
    await page.wait_for_timeout(500)

    # ================================================================
    # QUANTIDADE COMERCIAL
    # ================================================================

    logger.info(
        f"Quantidade Comercial: {item.quantidade}"
    )

    quantidade = (
        page.locator("label")
        .filter(has_text="Quantidade Comercial")
        .locator("..")
        .locator("input.slds-input")
    )

    await quantidade.wait_for(
        state="visible",
        timeout=10000
    )

    await quantidade.fill(
        str(item.quantidade)
    )

    logger.info(
        f"Quantidade preenchida: "
        f"{await quantidade.input_value()!r}"
    )

    # ================================================================
    # VALOR UNITÁRIO COMERCIAL
    # ================================================================

    logger.info(
        f"Valor Unitário Comercial: R$ {item.preco_unitario}"
    )

    valor_unitario = (
        page.locator("label")
        .filter(has_text="Valor Unitário Comercial")
        .locator("..")
        .locator("input.slds-input")
    )

    await valor_unitario.wait_for(
        state="visible",
        timeout=10000
    )

    await valor_unitario.fill(
        str(item.preco_unitario)
    )

    logger.info(
        f"Valor unitário preenchido: "
        f"{await valor_unitario.input_value()!r}"
    )

        # ================================================================
    # BENEFÍCIO FISCAL
    # ================================================================

    if not item.possui_beneficio_fiscal:
        await clicar_avancar(
            page,
            logger
        )
        return

    logger.info(
        "Marcando 'Possui benefício fiscal? Sim'"
    )

    # Localiza o bloco pelo texto "Possui benefício fiscal?"
    # e seleciona o radio "Sim" dentro dele.
    beneficio = (
        page.locator("legend")
        .filter(has_text="Possui benefício fiscal?")
        .locator("..")
    )

    sim = beneficio.get_by_text(
        "Sim",
        exact=True
    )

    await sim.click()

    logger.info(
        "Opção 'Sim' selecionada para benefício fiscal"
    )

    # ================================================================
    # CÓDIGO DO BENEFÍCIO FISCAL
    # ================================================================

    logger.info(
        f"Código do benefício fiscal: "
        f"{item.codigo_beneficio_fiscal}"
    )

    codigo_beneficio = (
        page.locator("label")
        .filter(has_text="Código de Benefício Fiscal na UF")
        .locator("..")
        .locator("input.default-input.slds-input")
    )

    await codigo_beneficio.wait_for(
        state="visible",
        timeout=10000
    )

    await codigo_beneficio.click()

    await codigo_beneficio.fill(
        item.codigo_beneficio_fiscal or ""
    )

    logger.info(
        f"Código de benefício preenchido: "
        f"{await codigo_beneficio.input_value()!r}"
    )
    # ================================================================
    # 1º AVANÇAR — DADOS DO PRODUTO → ICMS
    # ================================================================

    await clicar_avancar(
        page,
        logger
    )

    # ================================================================
    # ICMS — SITUAÇÃO TRIBUTÁRIA
    # ================================================================

    situacao_tributaria = (
        page.locator("label")
        .filter(has_text="Situação Tributária ICMS")
        .locator("..")
        .locator("select.slds-select")
    )

    await situacao_tributaria.wait_for(
        state="visible",
        timeout=10000
    )

    await situacao_tributaria.select_option(
        value=item.situacao_tributaria_icms
    )

    logger.info(
        f"Situação Tributária ICMS selecionada: "
        f"{await situacao_tributaria.input_value()!r}"
    )

    # ================================================================
    # ICMS — ORIGEM DA MERCADORIA
    # ================================================================

    origem_mercadoria = (
        page.locator("label")
        .filter(has_text="Origem da mercadoria")
        .locator("..")
        .locator("select.slds-select")
    )

    await origem_mercadoria.wait_for(
        state="visible",
        timeout=10000
    )

    await origem_mercadoria.select_option(
        value=item.origem_mercadoria
    )

    logger.info(
        f"Origem da mercadoria selecionada: "
        f"{await origem_mercadoria.input_value()!r}"
    )

    # ================================================================
    # 2º AVANÇAR — FINALIZA ITEM
    # ================================================================
    
    await clicar_avancar(
        page,
        logger
    )  
    

async def preencher_produtos(
    page: Page,
    tarefa: Tarefa,
    logger: logging.Logger
) -> None:
    """
    Preenche todos os produtos.

    Fluxo real da aplicação:

        Produto
            ↓
        Avançar
            ↓
        ICMS
            ↓
        Avançar
            ↓
        Tela "Adicionar Produto / Avançar"
            ├── outro produto → Adicionar Produto → próximo Produto
            └── último produto → Avançar → Transporte
    """

    total = len(tarefa.itens)

    for indice, item in enumerate(tarefa.itens, start=1):
        logger.info(
            f"Produto {indice}/{total}: {item.produto_descricao}"
        )

        await preencher_item(
            page,
            item,
            logger
        )

        # ------------------------------------------------------------
        # Ainda existem produtos para preencher.
        # ------------------------------------------------------------
        if indice < total:
            logger.info(
                "Produto concluído — clicando 'Adicionar Produto' "
                f"para o produto {indice + 1}/{total}"
            )

            adicionar_produto = page.get_by_role(
                "button",
                name="Adicionar Produto"
            )

            await adicionar_produto.wait_for(
                state="visible",
                timeout=10000
            )

            await adicionar_produto.click()

            logger.info(
                "Novo formulário de produto aberto"
            )

            await page.wait_for_timeout(1000)

        # ------------------------------------------------------------
        # Último produto.
        # Estamos na tela "Adicionar Produto / Avançar".
        # Aqui NÃO clicamos em "Adicionar Produto".
        # Clicamos em "Avançar" para ir para Transporte.
        # ------------------------------------------------------------
        else:
            logger.info(
                "Último produto concluído — "
                "clicando 'Avançar' para Transporte"
            )

            botoes = page.get_by_role(
                "button",
                name="Avançar"
            )

            total_botoes = await botoes.count()

            candidatos = []

            for i in range(total_botoes):
                botao = botoes.nth(i)

                if (
                    await botao.is_visible()
                    and await botao.is_enabled()
                ):
                    candidatos.append(botao)

            logger.info(
                f"Botões 'Avançar' visíveis e habilitados "
                f"na tela pós-produto: {len(candidatos)}"
            )

            if len(candidatos) != 1:
                raise RuntimeError(
                    "Esperado exatamente 1 botão 'Avançar' "
                    "na tela de Adicionar Produto/Transporte, "
                    f"mas encontrados {len(candidatos)}."
                )

            await candidatos[0].click()

            logger.info(
                "Avançar pós-produto clicado — aguardando Transporte"
            )

            await page.wait_for_timeout(1000)
    
    
async def preencher_transporte(
    page: Page,
    tarefa: Tarefa,
    logger: logging.Logger
) -> None:
    logger.info(
        f"Transporte: modalidade={tarefa.modalidade_frete}"
    )

    # Localiza diretamente o label da Modalidade do Frete.
    label_frete = page.locator("label").filter(
        has_text="Modalidade do Frete"
    )

    await label_frete.wait_for(
        state="visible",
        timeout=10000
    )

    logger.info("Tela de transporte carregada")

    modalidade_frete = (
        label_frete
        .locator("..")
        .locator("select.slds-select")
    )

    await modalidade_frete.wait_for(
        state="visible",
        timeout=10000
    )

    await modalidade_frete.select_option(
        value=tarefa.modalidade_frete
    )

    logger.info(
        f"Modalidade do Frete selecionada: "
        f"{await modalidade_frete.input_value()!r}"
    )

    # Avançar específico da tela de Transporte.
    botoes = page.get_by_role(
        "button",
        name="Avançar"
    )

    candidatos = []

    for i in range(await botoes.count()):
        botao = botoes.nth(i)

        if await botao.is_visible() and await botao.is_enabled():
            candidatos.append(botao)

    logger.info(
        f"Botões 'Avançar' visíveis e habilitados no transporte: "
        f"{len(candidatos)}"
    )

    if not candidatos:
        raise RuntimeError(
            "Nenhum botão 'Avançar' visível e habilitado no transporte."
        )

    await candidatos[-1].click()

    logger.info(
        "Avançar do transporte clicado — aguardando 1 segundo"
    )

    await page.wait_for_timeout(1000)

def validar_antes_de_emitir(page: Page, tarefa: Tarefa, logger: logging.Logger) -> bool:
    """
    RF15 — Modo 2: interrompe aqui e aguarda confirmação humana.

    Permanece síncrona de propósito (não faz nenhuma chamada ao Playwright,
    só input() protegido por lock) — ver nota junto de _LOCK_CONFIRMACAO_HUMANA
    sobre o comportamento desse lock agora que a orquestração é Async.
    """
    logger.info(f"[{tarefa.tarefa_id}] Dados preenchidos. Aguardando conferência humana.")
    with _LOCK_CONFIRMACAO_HUMANA:
        resposta = input(f"Conferir tarefa {tarefa.tarefa_id} e confirmar emissão? [s/N] ")
    return resposta.strip().lower() == "s"


async def emitir(page: Page, tarefa: Tarefa, logger: logging.Logger) -> None:
    """Fluxo final: Produtos → Transporte → Resumo total → botão Emitir."""
    logger.info(f"[{tarefa.tarefa_id}] Emitindo nota")
    try:
        await page.get_by_role("button", name="Emitir", exact=True).click()
        logger.info(f"[{tarefa.tarefa_id}] Botão de emissão clicado")
    except Exception as e:  # noqa: BLE001 — tentativa educada, não é seletor confirmado
        logger.warning(f"Botão 'Emitir' não encontrado ({e}) — confirmar seletor com o Inspector.")
        raise NotImplementedError("Botão de emissão não está disponível.") from e


async def cancelar_nota(page: Page, numero_nota: str, motivo: str, logger: logging.Logger) -> None:
    """
    Fluxo confirmado em 15/08: Consultar → localizar a nota pelo número →
    penúltimo botão é "Cancelar" → pede um motivo/justificativa.

    ⚠️ Usar com moderação: a Receita monitora volume de cancelamentos e
    entra em contato quando o padrão parece suspeito. No relato do
    reconhecimento, até ~3 cancelamentos foi tranquilo historicamente —
    não tratar isso como limite seguro garantido, só como referência.
    """
    logger.warning(f"Cancelando nota {numero_nota} — motivo: {motivo}")
    # TODO: seletores de navegação até "Consultar", localização da nota e
    # botão "Cancelar" ainda não capturados.
    raise NotImplementedError("Fluxo de cancelamento ainda não reconhecido (seletores).")


class FalhaDownloadDocumento(RuntimeError):
    """O sistema fiscal não entregou um XML ou DANFE baixável."""


async def baixar_documentos(page: Page, tarefa: Tarefa, download_dir: str, logger: logging.Logger) -> dict[str, str]:
    """RF18 — baixa XML e DANFE autorizados e devolve caminhos locais seguros.

    `expect_download()` recebe o download diretamente do navegador automatizado;
    o aviso visual de arquivo potencialmente perigoso do Chromium não exige uma
    confirmação humana adicional quando o contexto usa ``accept_downloads``.
    O botão ``Visualizar DANFE`` foi observado baixando um PDF, apesar do nome.
    """
    logger.info("[%s] Baixando XML e DANFE", tarefa.tarefa_id)
    os.makedirs(download_dir, exist_ok=True)

    xml_path = await _baixar_documento(
        page=page,
        nome_botao="Baixar XML",
        destino=_caminho_documento(download_dir, tarefa.tarefa_id, "xml", "xml"),
        tarefa_id=tarefa.tarefa_id,
        logger=logger,
    )
    pdf_path = await _baixar_documento(
        page=page,
        nome_botao="Visualizar DANFE",
        destino=_caminho_documento(download_dir, tarefa.tarefa_id, "danfe", "pdf"),
        tarefa_id=tarefa.tarefa_id,
        logger=logger,
    )
    return {"xml_path": xml_path, "pdf_path": pdf_path}


async def _baixar_documento(
    *,
    page: Page,
    nome_botao: str,
    destino: str,
    tarefa_id: str,
    logger: logging.Logger,
) -> str:
    try:
        async with page.expect_download(timeout=30_000) as evento_download:
            await page.get_by_role("button", name=nome_botao, exact=True).click()
        download = await evento_download.value
        if await download.failure():
            raise FalhaDownloadDocumento("O navegador informou falha no download.")
        await download.save_as(destino)
    except FalhaDownloadDocumento:
        raise
    except Exception as exc:  # noqa: BLE001 — não registrar resposta fiscal bruta
        raise FalhaDownloadDocumento(
            f"[{tarefa_id}] Não foi possível baixar o documento fiscal solicitado."
        ) from exc

    try:
        os.chmod(destino, 0o600)
    except OSError:
        # ACLs da VM complementam a proteção quando o SO não usa permissões POSIX.
        pass
    logger.info("[%s] %s salvo", tarefa_id, nome_botao)
    return destino


def _caminho_documento(download_dir: str, tarefa_id: str, tipo: str, extensao: str) -> str:
    """Gera nome estável, sem usar o nome genérico fornecido pela Receita."""
    identificador = re.sub(r"[^A-Za-z0-9_-]+", "-", tarefa_id).strip("-") or "tarefa"
    instante = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    return os.path.join(download_dir, f"{tipo}_{identificador}_{instante}.{extensao}")
