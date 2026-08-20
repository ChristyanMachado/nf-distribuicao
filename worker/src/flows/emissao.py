"""
RF13 (passos 4-10), RF15: preenchimento da NFP-e a partir do reconhecimento
manual de 13/08 (worker/RECON.md) e do reconhecimento ao vivo de 20/08,
contra o sistema real da Receita/PR.

Princípio seguido neste arquivo (importante, não é só estilo de código):
seletor incerto é aceitável — vamos rodar em modo visível e corrigir o que
quebrar, é o fluxo normal de desenvolver com Playwright. DADO FISCAL
inventado não é aceitável — nunca preenchemos CFOP, código de benefício
fiscal, PIS/COFINS/IPI etc. com um valor chutado só para o fluxo continuar.
"""
from __future__ import annotations

import logging
import re
import threading
from dataclasses import dataclass, field

from playwright.sync_api import Page

# Protege input() de concorrência: com RF14 (3 sessões em paralelo), se dois
# clientes chegarem na conferência humana ao mesmo tempo, dois input()
# simultâneos disputam o mesmo terminal e a resposta pode ir pro cliente
# errado. O lock serializa — um prompt de cada vez, na ordem de chegada.
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


def clicar_avancar(page: Page, logger: logging.Logger) -> None:
    page.get_by_role("button", name="Avançar").click()


def aceitar_consentimento(page: Page, logger: logging.Logger) -> None:
    logger.info("Aceitando consentimento inicial")
    # Confirmado via reconhecimento ao vivo 20/08.
    page.locator("#div-consentimento input[type=checkbox]").check()


def selecionar_emitente(page: Page, emitente: Emitente, logger: logging.Logger) -> None:
    logger.info(f"Selecionando emitente (value={emitente.valor_select})")
    # Seletor simplificado (<select> dentro de #div-identificacao) —
    # reconfirmado como válido no reconhecimento ao vivo de 20/08.
    page.locator("#div-identificacao select").select_option(value=emitente.valor_select)

    # O sistema preenche razão social/CNPJ/endereço automaticamente após a
    # seleção (RECON.md seção 4). Esperar a rede assentar é mais confiável
    # que um tempo fixo.
    page.wait_for_load_state("networkidle", timeout=5000)

    clicar_avancar(page, logger)


def preencher_destinatario(page: Page, destinatario: Destinatario, logger: logging.Logger) -> None:
    logger.info(f"Preenchendo destinatário: {destinatario.razao_social}")

    # Tipo de identificação: CNPJ (confirmado, inclusive no reconhecimento
    # ao vivo de 20/08 — label "CNPJ" com id dinâmico por sessão, por isso
    # localizamos pelo texto e não pelo id).
    page.get_by_text("CNPJ", exact=True).first.click()

    # Confirmado 20/08 (classe slds-form-element.slds-col.slds-size_3-of-12;
    # a classe slds-has-error observada no reconhecimento é só estado de
    # validação do momento da captura, não faz parte do seletor estável).
    campo_cnpj = page.locator(
        "div.slds-form-element.slds-col.slds-size_3-of-12 input"
    ).first
    campo_cnpj.fill(destinatario.cnpj)

    # ⚠️ DISCREPÂNCIA A CONFIRMAR (20/08): o reconhecimento ao vivo mais
    # recente foi direto do clique em "CNPJ" para o campo de Inscrição
    # Estadual, sem passar por uma seleção explícita de "Contribuinte ICMS
    # (informar a IE do destinatário)". Está mantido abaixo por ser o único
    # fluxo já confirmado anteriormente (14/08), mas se travar aqui no
    # próximo teste ao vivo, o mais provável é que este clique deva ser
    # removido — não decidir isso sem repetir o teste observando a tela.
    if destinatario.indicador_ie != "CONTRIBUINTE":
        raise DadosFiscaisIncompletos(
            "Só o fluxo CONTRIBUINTE (1 — Contribuinte ICMS) foi reconhecido "
            "no sistema real. Reconhecer os demais casos antes de usar."
        )
    page.get_by_text(
        "Contribuinte ICMS (informar a IE do destinatário)", exact=False
    ).click()

    if destinatario.inscricao_estadual:
        page.locator(
            "div.slds-grid.slds-wrap.slds-gutters > div:nth-child(7) input"
        ).fill(destinatario.inscricao_estadual)

    page.locator(
        "div.slds-form-element.slds-col.slds-size_12-of-12 input"
    ).first.fill(destinatario.razao_social)

    # Confirmado 20/08: campo de CEP é o único slds-size_12-of-12 dentro de
    # #div-endereco (o antigo "div:nth-child(2)" era só uma hipótese de
    # posição). O campo de Número usa slds-size_1-of-12, já confirmado antes.
    page.locator(
        "#div-endereco div.slds-form-element.slds-col.slds-size_12-of-12 input"
    ).fill(destinatario.cep)
    # Sair do campo para disparar o preenchimento automático por CEP (RECON.md seção 5)
    page.keyboard.press("Tab")
    page.wait_for_load_state("networkidle", timeout=5000)

    page.locator(
        "#div-endereco div.slds-form-element.slds-col.slds-size_1-of-12 input"
    ).fill(destinatario.numero_endereco)

    clicar_avancar(page, logger)


def selecionar_combobox_por_texto(page: Page, combobox_selector: str, texto: str, logger: logging.Logger) -> None:
    """
    Helper genérico para os comboboxes estilo SLDS (Salesforce Lightning) —
    ex: Natureza da operação, campo de texto com dropdown/listbox.
    Localiza a opção pelo TEXTO em vez de posição.
    """
    page.locator(combobox_selector).click()
    page.get_by_text(texto, exact=True).click()


def _selecionar_select_por_opcao_ancora(
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
    select.select_option(value=valor)


def preencher_identificacao_operacao(page: Page, tarefa: Tarefa, logger: logging.Logger) -> None:
    logger.info(f"Identificação da operação: natureza={tarefa.natureza_operacao}")

    # Confirmado: #combobox-id-1 é a Natureza da operação (campo de texto
    # com listbox, não um <select> comum).
    selecionar_combobox_por_texto(page, "#combobox-id-1", tarefa.natureza_operacao, logger)

    # Confirmado no reconhecimento ao vivo 20/08 — os três abaixo já são
    # <select> comuns de verdade (não comboboxes SLDS), com value/texto de
    # opção confirmados em TIPO_OPERACAO_OPCOES / FINALIDADE_EMISSAO_OPCOES /
    # INDICADOR_PRESENCA_OPCOES.
    logger.info(f"Tipo de operação: {tarefa.tipo_operacao}")
    _selecionar_select_por_opcao_ancora(
        page, _ANCORA_TIPO_OPERACAO, TIPO_OPERACAO_OPCOES[tarefa.tipo_operacao], logger
    )

    logger.info(f"Finalidade da emissão: {tarefa.finalidade_emissao}")
    _selecionar_select_por_opcao_ancora(
        page, _ANCORA_FINALIDADE_EMISSAO, FINALIDADE_EMISSAO_OPCOES[tarefa.finalidade_emissao], logger
    )

    logger.info(f"Indicador de presença: {tarefa.indicador_presenca}")
    _selecionar_select_por_opcao_ancora(
        page, _ANCORA_INDICADOR_PRESENCA, INDICADOR_PRESENCA_OPCOES[tarefa.indicador_presenca], logger
    )

    clicar_avancar(page, logger)


def avancar_local_retirada(page: Page, logger: logging.Logger) -> None:
    """RECON.md seção 7 — valores padrão observados, sem alteração necessária."""
    logger.info("Local de retirada/entrega: mantendo padrão do sistema")
    clicar_avancar(page, logger)


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


def buscar_produto(page: Page, item: ItemTarefa, logger: logging.Logger) -> None:
    """
    RECON.md seção 8 — confirmado ao vivo 20/08: o campo certo é "Código do
    Produto" (não "Descrição do Produto" — a descrição é preenchida
    automaticamente depois de digitar o código). O campo tem um
    aria-controls apontando pra uma listbox de sugestões com id dinâmico
    por sessão (ex: "415-suggestions"), por isso não dá pra confiar nesse
    id — localizamos pela posição confirmada dentro da seção de produto.
    """
    logger.info(f"Buscando produto por código: {item.codigo_produto}")

    campo_codigo = page.locator(
        f"{_BASE_DADOS_PRODUTO} > div:nth-child(2) > div.slds-form-element__control > div > div > input"
    )
    campo_codigo.fill(item.codigo_produto)

    # Tentativa educada: se aparecer uma sugestão (autocomplete), clicar na
    # primeira. Alguns sistemas SLDS preenchem por match exato sem precisar
    # de clique — por isso isso é best-effort, não uma etapa obrigatória.
    try:
        page.get_by_role("option").first.click(timeout=3000)
        logger.info("Sugestão de produto selecionada via clique.")
    except Exception:  # noqa: BLE001 — best-effort, não é seletor confirmado
        logger.info(
            "Nenhuma sugestão clicável apareceu após preencher o código — "
            "seguindo o fluxo assumindo preenchimento automático."
        )

    page.wait_for_load_state("networkidle", timeout=5000)


def preencher_item(page: Page, item: ItemTarefa, logger: logging.Logger) -> None:
    """
    RECON.md seção 8 — confirmado ao vivo 20/08. Preenche o produto,
    clica Avançar (fecha a 1ª sub-tela de produto), preenche ICMS e clica
    Avançar de novo (fecha a 2ª sub-tela). Depois disso é que o chamador
    decide se clica "Adicionar Produto" (mais itens) ou segue pra Transporte.
    """
    buscar_produto(page, item, logger)

    logger.info(f"Selecionando CFOP: {item.cfop_codigo} ({item.cfop_texto})")
    page.locator(
        f"{_BASE_DADOS_PRODUTO} > div.slds-form-element.slds-col.slds-size_12-of-12"
        " > div.slds-form-element__control > div > select"
    ).select_option(value=item.cfop_codigo)

    logger.info(f"Quantidade: {item.quantidade}")
    page.locator(
        f"{_BASE_DADOS_PRODUTO} > div.slds-form-element.slds-col.slds-size_4-of-12"
        " > div.slds-form-element__control > input"
    ).fill(str(item.quantidade))

    logger.info(f"Valor unitário: R$ {item.preco_unitario}")
    page.locator(
        f"{_BASE_DADOS_PRODUTO} > div:nth-child(8) > div.slds-form-element__control > input"
    ).fill(str(item.preco_unitario))

    if not item.possui_beneficio_fiscal:
        clicar_avancar(page, logger)
        return

    logger.info("Marcando 'Possui benefício fiscal? Sim'")
    page.get_by_text("Sim", exact=True).first.click()

    logger.info(f"Código do benefício fiscal: {item.codigo_beneficio_fiscal}")
    page.locator(
        f"{_BASE_DADOS_PRODUTO} > div:nth-child(11)"
        " > div.slds-form-element.slds-col.slds-size_8-of-12"
        " > div.slds-form-element__control > div > div > input"
    ).fill(item.codigo_beneficio_fiscal or "")

    # 1º Avançar: fecha "Dados do Produto", abre a sub-tela "ICMS".
    clicar_avancar(page, logger)

    logger.info(f"Situação tributária do ICMS: {item.situacao_tributaria_icms}")
    page.locator(
        f"{_BASE_DADOS_PRODUTO} > div.slds-grid.slds-wrap"
        " > div > div.slds-form-element__control > div > select"
    ).select_option(value=item.situacao_tributaria_icms)

    logger.info(f"Origem da mercadoria: {item.origem_mercadoria}")
    page.locator(
        f"{_BASE_DADOS_PRODUTO} > div.slds-grid.slds-wrap.slds-gutters"
        " > div:nth-child(1) > div.slds-form-element__control > div > select"
    ).select_option(value=item.origem_mercadoria)

    # 2º Avançar: fecha a sub-tela "ICMS" deste item.
    clicar_avancar(page, logger)


def preencher_produtos(page: Page, tarefa: Tarefa, logger: logging.Logger) -> None:
    """
    Confirmado ao vivo 20/08: entre um item e outro é preciso clicar
    "Adicionar Produto" pra reabrir o formulário — não é automático. Depois
    do ÚLTIMO item, não se clica nesse botão: o Avançar final de
    preencher_item() já segue para Transporte.
    """
    total = len(tarefa.itens)
    for indice, item in enumerate(tarefa.itens, start=1):
        logger.info(f"Produto {indice}/{total}: {item.produto_descricao}")
        preencher_item(page, item, logger)

        if indice < total:
            logger.info("Clicando 'Adicionar Produto' para o próximo item")
            page.get_by_role("button", name="Adicionar Produto").click()


def preencher_transporte(page: Page, tarefa: Tarefa, logger: logging.Logger) -> None:
    """
    RECON.md seção 9 — confirmado ao vivo 20/08: campo "Modalidade do
    Frete", value "3" = "Transporte Próprio por conta do Remetente".
    """
    logger.info(
        f"Transporte: modalidade={tarefa.modalidade_frete} "
        "(Transporte Próprio por conta do Remetente)"
    )
    page.locator(
        "#app > div:nth-child(1) > div > div.slds-tabs_default__content"
        " > div.slds-panel__section.slds-size_12-of-12"
        " > div:nth-child(2) > div > div.slds-form-element__control > div > select"
    ).select_option(value=tarefa.modalidade_frete)

    clicar_avancar(page, logger)


def validar_antes_de_emitir(page: Page, tarefa: Tarefa, logger: logging.Logger) -> bool:
    """RF15 — Modo 2: interrompe aqui e aguarda confirmação humana."""
    logger.info(f"[{tarefa.tarefa_id}] Dados preenchidos. Aguardando conferência humana.")
    with _LOCK_CONFIRMACAO_HUMANA:
        resposta = input(f"Conferir tarefa {tarefa.tarefa_id} e confirmar emissão? [s/N] ")
    return resposta.strip().lower() == "s"


def emitir(page: Page, tarefa: Tarefa, logger: logging.Logger) -> None:
    """Fluxo final: Produtos → Transporte → Resumo total → botão Emitir."""
    logger.info(f"[{tarefa.tarefa_id}] Emitindo nota")
    try:
        page.get_by_role("button", name=re.compile("emitir", re.IGNORECASE)).click()
        logger.info(f"[{tarefa.tarefa_id}] Botão de emissão clicado (tentativa por nome 'Emitir')")
    except Exception as e:  # noqa: BLE001 — tentativa educada, não é seletor confirmado
        logger.warning(f"Botão 'Emitir' não encontrado por nome ({e}) — confirmar seletor com o Inspector.")
        raise NotImplementedError("Botão de emissão ainda não confirmado.") from e


def cancelar_nota(page: Page, numero_nota: str, motivo: str, logger: logging.Logger) -> None:
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


def baixar_documentos(page: Page, tarefa: Tarefa, download_dir: str, logger: logging.Logger) -> dict:
    """RF18 — retorna os caminhos locais do PDF/XML baixados."""
    logger.info(f"[{tarefa.tarefa_id}] Baixando PDF/XML")
    # TODO: capturar via page.expect_download() — etapa ainda não alcançada
    # no reconhecimento manual.
    raise NotImplementedError("Etapa de download ainda não reconhecida.")
