"""
RF13 (passos 4-10), RF15: preenchimento da NFP-e a partir do reconhecimento
manual de 13/08 (worker/RECON.md), contra o sistema real da Receita/PR.

Princípio seguido neste arquivo (importante, não é só estilo de código):
seletor incerto é aceitável — vamos rodar em modo visível amanhã e corrigir
o que quebrar, é o fluxo normal de desenvolver com Playwright. DADO FISCAL
inventado não é aceitável — nunca preenchemos CFOP, código de benefício
fiscal, PIS/COFINS/IPI etc. com um valor chutado só para o fluxo continuar.
Por isso a função de produtos PARA deliberadamente (DadosFiscaisIncompletos)
no código de benefício fiscal, que ainda não foi localizado.
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
    cfop_codigo: str = "5101"  # confirmado na transcrição bruta de 15/08 (value do <option>)
    situacao_tributaria_icms: str = "40"  # confirmado 15/08 — opções observadas: 40, 41, 50
    origem_mercadoria: str = "0"  # confirmado 15/08 — 0 = Nacional
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
    # Confirmados no reconhecimento, mas o próprio RECON.md pede validação
    # documental antes de virar regra definitiva (seção 10) — mantidos como
    # default editável, não como constante fixa no meio do código.
    natureza_operacao: str = "Venda"
    tipo_operacao: str = "Saída"
    finalidade_emissao: str = "Nota fiscal eletrônica normal"
    indicador_presenca: str = "Operação não presencial pela internet"
    modalidade_frete: str = "3"  # confirmado 15/08: "Transporte próprio por conta do remetente"


# ---------------------------------------------------------------------------
# Passos do fluxo
# ---------------------------------------------------------------------------


def clicar_avancar(page: Page, logger: logging.Logger) -> None:
    page.get_by_role("button", name="Avançar").click()


def aceitar_consentimento(page: Page, logger: logging.Logger) -> None:
    logger.info("Aceitando consentimento inicial")
    page.locator("#div-consentimento input[type=checkbox]").check()


def selecionar_emitente(page: Page, emitente: Emitente, logger: logging.Logger) -> None:
    logger.info(f"Selecionando emitente (value={emitente.valor_select})")
    # ⚠️ Seletor estrutural longo no reconhecimento — simplificado para o
    # <select> dentro de #div-identificacao. Confirmar amanhã se é o único
    # <select> da seção; se não for, restringir mais.
    page.locator("#div-identificacao select").select_option(value=emitente.valor_select)

    # O sistema preenche razão social/CNPJ/endereço automaticamente após a
    # seleção (RECON.md seção 4). Esperar a rede assentar é mais confiável
    # que um tempo fixo — TODO: trocar por wait_for_selector de um campo
    # específico assim que soubermos qual, se o auto-preenchimento não
    # disparar requisição de rede (nesse caso o networkidle não ajuda).
    page.wait_for_load_state("networkidle", timeout=5000)

    clicar_avancar(page, logger)


def preencher_destinatario(page: Page, destinatario: Destinatario, logger: logging.Logger) -> None:
    logger.info(f"Preenchendo destinatário: {destinatario.razao_social}")

    # Tipo de identificação: CNPJ (confirmado). Heurística por texto — mais
    # robusta que o seletor estrutural bruto do reconhecimento.
    page.get_by_text("CNPJ", exact=True).first.click()

    # ⚠️ TODO confirmar amanhã: qual input recebe o CNPJ (o reconhecimento só
    # capturou o seletor estrutural). Usando a posição documentada por ora.
    campo_cnpj = page.locator(
        "div.slds-form-element.slds-col.slds-size_3-of-12 input"
    ).first
    campo_cnpj.fill(destinatario.cnpj)

    # Confirmado em 14/08: "1 — Contribuinte ICMS (informar a IE do
    # destinatário)" é a opção usada no fluxo real. Localizando pelo texto
    # (não por posição) — seletor exato do combobox ainda não capturado,
    # então usamos get_by_text como fallback razoável.
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

    page.locator("#div-endereco div:nth-child(2) input").fill(destinatario.cep)
    # Sair do campo para disparar o preenchimento automático por CEP (RECON.md seção 5)
    page.keyboard.press("Tab")
    page.wait_for_load_state("networkidle", timeout=5000)

    page.locator(
        "#div-endereco div.slds-form-element.slds-col.slds-size_1-of-12 input"
    ).fill(destinatario.numero_endereco)

    clicar_avancar(page, logger)


def selecionar_combobox_por_texto(page: Page, combobox_selector: str, texto: str, logger: logging.Logger) -> None:
    """
    Helper genérico para os comboboxes estilo SLDS (Salesforce Lightning).
    Localiza a opção pelo TEXTO em vez de posição (nth-child) — é
    exatamente a melhoria que o próprio RECON.md (seção 6) recomenda sobre
    o seletor bruto copiado do DevTools.
    """
    page.locator(combobox_selector).click()
    page.get_by_text(texto, exact=True).click()


def preencher_identificacao_operacao(page: Page, tarefa: Tarefa, logger: logging.Logger) -> None:
    logger.info(f"Identificação da operação: natureza={tarefa.natureza_operacao}")

    # Confirmado: #combobox-id-1 é a Natureza da operação.
    selecionar_combobox_por_texto(page, "#combobox-id-1", tarefa.natureza_operacao, logger)

    # ⚠️ TODO: ids dos comboboxes de tipo de operação, finalidade e
    # indicador de presença não foram capturados no reconhecimento — só a
    # hipótese de valor (RECON.md seção 6). Puramente cosmético/estrutural
    # o quanto der pra inferir (#combobox-id-2/3/4) não é seguro assumir
    # sem confirmar ao vivo amanhã.
    logger.warning(
        "Tipo de operação / finalidade / indicador de presença: seletores "
        "ainda não confirmados — preencher manualmente no primeiro teste "
        "ao vivo e capturar os ids reais (prováveis #combobox-id-2/3/4)."
    )

    clicar_avancar(page, logger)


def avancar_local_retirada(page: Page, logger: logging.Logger) -> None:
    """RECON.md seção 7 — valores padrão observados, sem alteração necessária."""
    logger.info("Local de retirada/entrega: mantendo padrão do sistema")
    clicar_avancar(page, logger)


def buscar_produto(page: Page, item: ItemTarefa, logger: logging.Logger) -> None:
    """
    RECON.md seção 8 — busca por código é preferível à busca por descrição.

    Tentativa com base educada: todo o formulário usa componentes SLDS
    (Salesforce Lightning) — o mesmo padrão de combobox que já funciona pra
    "Venda" na identificação da operação. É razoável supor que a busca de
    produto seja um combobox/lookup SLDS parecido: digita, aparece uma
    lista, clica na opção. Não é confirmado — se a estrutura real for
    diferente, isso falha rápido e limpo (INSPECIONAR=true assume dali).
    """
    logger.info(f"Buscando produto por código: {item.codigo_produto}")
    try:
        campo_busca = page.get_by_role("combobox", name=re.compile("produto", re.IGNORECASE))
        campo_busca.fill(item.codigo_produto)
        page.get_by_role("option").first.click()
        logger.info(f"Produto selecionado via combobox: {item.codigo_produto}")
        return
    except Exception as e:  # noqa: BLE001 — tentativa educada, não é o seletor confirmado
        logger.warning(
            f"Tentativa automática de busca de produto não funcionou ({e}). "
            "Seletor real ainda não confirmado — usar o Inspector (INSPECIONAR=true) "
            "pra capturar o campo certo."
        )
        raise DadosFiscaisIncompletos(
            "Seletor do campo de busca de produto ainda não reconhecido "
            "(tentativa automática via combobox SLDS falhou)."
        ) from e


def preencher_item(page: Page, item: ItemTarefa, logger: logging.Logger) -> None:
    """
    RECON.md seção 8 — após selecionar o produto: CFOP, quantidade, valor
    unitário, benefício fiscal. Para aqui, de propósito, no código do
    benefício fiscal: é o ÚNICO dado que falta (não seletor) para fechar a
    etapa de produtos com segurança.

    Ordem confirmada na transcrição bruta de 15/08: situação tributária do
    ICMS e origem da mercadoria só ficam disponíveis/corretas DEPOIS do
    benefício fiscal ser preenchido — por isso vêm depois no fluxo abaixo,
    não em paralelo.
    """
    buscar_produto(page, item, logger)  # já levanta DadosFiscaisIncompletos hoje

    logger.info(f"Selecionando CFOP: {item.cfop_codigo} ({item.cfop_texto})")
    # Confirmado 15/08: value do <option> é "5101" — muito mais robusto que
    # localizar por texto ou posição. ⚠️ O <select> em si ainda usa o
    # seletor estrutural do reconhecimento original (RECON.md seção 8).
    page.locator(
        "#app > div:nth-child(1) > div > div.slds-tabs_default__content > div > div > div > div > div:nth-child(2) "
        "> div.slds-form-element.slds-col.slds-size_12-of-12 > div.slds-form-element__control > div > select"
    ).select_option(value=item.cfop_codigo)

    logger.info(f"Quantidade: {item.quantidade} · Valor unitário: R$ {item.preco_unitario}")
    # TODO: seletores dos campos de quantidade/valor unitário ainda não capturados.

    if not item.possui_beneficio_fiscal:
        return

    logger.info(f"Código do benefício fiscal: {item.codigo_beneficio_fiscal}")
    # TODO: seletor do campo ainda não capturado — o DADO já está confirmado
    # (PR810128, fixo para todos os produtos), só falta achar o input.

    # A partir daqui, só funciona DEPOIS do benefício fiscal preenchido (confirmado 15/08).
    logger.info(f"Situação tributária do ICMS: {item.situacao_tributaria_icms}")
    # TODO: seletor ainda não capturado. Opções observadas: 40, 41, 50.

    logger.info(f"Origem da mercadoria: {item.origem_mercadoria}")
    # TODO: seletor ainda não capturado. 0 = Nacional (confirmado 15/08).


def preencher_produtos(page: Page, tarefa: Tarefa, logger: logging.Logger) -> None:
    for item in tarefa.itens:
        preencher_item(page, item, logger)


def preencher_transporte(page: Page, tarefa: Tarefa, logger: logging.Logger) -> None:
    """
    RECON.md seção 9 — modalidade de frete. Confirmado na transcrição bruta
    de 15/08: valor "3" = "Transporte próprio por conta do remetente".
    """
    logger.info(f"Transporte: modalidade={tarefa.modalidade_frete} (Transporte próprio por conta do remetente)")
    # ⚠️ TODO: seletor do campo ainda não capturado — só o valor e o
    # significado estão confirmados.
    raise DadosFiscaisIncompletos(
        "Seletor do campo de modalidade de transporte ainda não reconhecido "
        "(o valor '3' = Transporte próprio por conta do remetente já está confirmado)."
    )


def validar_antes_de_emitir(page: Page, tarefa: Tarefa, logger: logging.Logger) -> bool:
    """RF15 — Modo 2: interrompe aqui e aguarda confirmação humana."""
    logger.info(f"[{tarefa.tarefa_id}] Dados preenchidos. Aguardando conferência humana.")
    with _LOCK_CONFIRMACAO_HUMANA:
        resposta = input(f"Conferir tarefa {tarefa.tarefa_id} e confirmar emissão? [s/N] ")
    return resposta.strip().lower() == "s"


def emitir(page: Page, tarefa: Tarefa, logger: logging.Logger) -> None:
    """Fluxo final confirmado em 15/08: Produtos → Transporte → Resumo total → botão Emitir."""
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
