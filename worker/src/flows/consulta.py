"""RF20 — recuperação de XML/DANFE já emitidos pela consulta da NFP-e.

Este módulo é deliberadamente separado de ``emissao.py``: consultar uma nota
existente nunca pode reaproveitar o comando que cria uma nova emissão.
"""
from __future__ import annotations

import asyncio
import logging
import os
import re
import unicodedata
from datetime import datetime, timezone
from pathlib import Path
from typing import Awaitable, Callable

from playwright.async_api import Locator, Page, TimeoutError as PlaywrightTimeoutError

from ..auth import AmbienteEmissao, exigir_origem_fiscal, exigir_pagina_consulta
from .emissao import (
    FalhaDownloadDocumento,
    baixar_documento_por_acao,
    extrair_metadados_xml,
)


SELETOR_EMITENTE_CONSULTA = "article select.slds-select"
SELETOR_FILTRO_CHAVE = 'article select.slds-select:has(option[value="1"])'
SELETOR_CAMPO_CHAVE = "input.slds-input.slds-size_6-of-12:visible"
SELETOR_CONTAGEM_RESULTADO = "p.VuePagination__count"
# A tabela pode coexistir com outros componentes que também usam ``table``.
# A linha fiscal é identificada pelos dois documentos que já provam que a
# consulta retornou a nota pretendida. Assim, status e ações nunca devem ser
# buscados globalmente nem escolhidos pelo último ``td`` da página.
SELETOR_LINHA_RESULTADO = (
    'div.table-responsive table tbody tr:visible'
    ':has([title="DANFE"]):has([title="Obter XML da nota"])'
)
SELETOR_DANFE_RESULTADO = f'{SELETOR_LINHA_RESULTADO} [title="DANFE"]:visible'
SELETOR_XML_RESULTADO = (
    f'{SELETOR_LINHA_RESULTADO} [title="Obter XML da nota"]:visible'
)
SELETOR_CANCELAR_RESULTADO = (
    f'{SELETOR_LINHA_RESULTADO} button:has(i[title="Cancelar"]):visible'
)
# Evidência observada no portal: a situação é a segunda célula da mesma linha
# fiscal. O vínculo com ``SELETOR_LINHA_RESULTADO`` torna essa posição local à
# nota encontrada, em vez de uma posição absoluta entre tabelas da SPA.
SELETOR_STATUS_RESULTADO = f"{SELETOR_LINHA_RESULTADO} td:nth-child(2):visible"
SELETOR_MOTIVO_CANCELAMENTO = "article textarea.slds-input.slds-size_12-of-12:visible"
SELETOR_CONFIRMAR_CANCELAMENTO = (
    'article:has(textarea.slds-input.slds-size_12-of-12:visible) '
    'footer button:has-text("Confirmar"):visible'
)
TEXTO_SUCESSO_CANCELAMENTO = "Evento registrado e vinculado a NF-e"


class ConsultaFiscalInvalida(ValueError):
    """Dados insuficientes ou incompatíveis para uma consulta segura."""


class NotaConsultaNaoEncontrada(RuntimeError):
    """A consulta não retornou exatamente os documentos esperados."""


class CancelamentoFiscalRecusado(RuntimeError):
    """O portal respondeu que o cancelamento não foi realizado."""

    def __init__(self, mensagem_usuario: str) -> None:
        super().__init__(mensagem_usuario)
        self.mensagem_usuario = mensagem_usuario


class CancelamentoResultadoIncerto(RuntimeError):
    """A confirmação foi enviada, mas o resultado oficial não foi provado."""


class CancelamentoNaoEnviado(RuntimeError):
    """O fluxo falhou com certeza antes do clique fiscal de confirmação."""

    def __init__(self, mensagem_usuario: str) -> None:
        super().__init__(mensagem_usuario)
        self.mensagem_usuario = mensagem_usuario


def _acao_da_linha_resultado(page: Page, seletor: str) -> Locator:
    """Retorna a última ação visível, pertencente à única nota consultada.

    A consulta já exige exatamente ``Um registro``. Nessa tela, a Receita
    pode renderizar antes um ícone de cabeçalho, mas essa duplicação não é
    simétrica entre DANFE e XML. A ação da linha vem por último; com apenas uma
    ocorrência, ``last`` devolve essa própria ação.
    """

    return page.locator(seletor).last


async def baixar_documentos_consulta(
    page: Page,
    *,
    chave_acesso: str,
    numero: str,
    download_dir: str,
    tarefa_id: str,
    logger: logging.Logger,
) -> dict[str, str]:
    """Baixa XML/DANFE da única nota localizada e prova sua identidade.

    O XML é baixado primeiro porque contém a chave e o número oficiais. O DANFE
    só é aceito depois dessa comparação. A operação local é atômica: qualquer
    falha remove os artefatos recuperados nesta tentativa.
    """

    chave = validar_chave_acesso(chave_acesso)
    numero_limpo = numero.strip()
    if not numero_limpo.isdigit() or len(numero_limpo) > 20:
        raise ConsultaFiscalInvalida("O número da nota para recuperação é inválido.")

    instante = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    base = Path(download_dir)
    xml_path = str(base / f"recuperado_xml_nota-{numero_limpo}_{instante}.xml")
    pdf_path = str(base / f"recuperado_danfe_nota-{numero_limpo}_{instante}.pdf")
    criados: list[str] = []
    try:
        criados.append(
            await baixar_documento_por_acao(
                page=page,
                acionador=_acao_da_linha_resultado(page, SELETOR_XML_RESULTADO),
                destino=xml_path,
                extensao="xml",
                tarefa_id=tarefa_id,
                rotulo="XML recuperado",
                logger=logger,
            )
        )
        metadados = extrair_metadados_xml(xml_path)
        if metadados.chave_acesso != chave or metadados.numero != numero_limpo:
            raise FalhaDownloadDocumento(
                "O XML recuperado não corresponde à nota pesquisada."
            )
        logger.info("XML recuperado corresponde à chave pesquisada")

        criados.append(
            await baixar_documento_por_acao(
                page=page,
                acionador=_acao_da_linha_resultado(page, SELETOR_DANFE_RESULTADO),
                destino=pdf_path,
                extensao="pdf",
                tarefa_id=tarefa_id,
                rotulo="DANFE recuperado",
                logger=logger,
            )
        )
    except Exception:
        for caminho in criados:
            try:
                os.unlink(caminho)
            except FileNotFoundError:
                pass
        raise
    return {"xml_path": xml_path, "pdf_path": pdf_path}


def _normalizar_motivo_cancelamento(motivo: str) -> str:
    normalizado = re.sub(r"\s+", " ", motivo).strip()
    if not normalizado:
        raise ConsultaFiscalInvalida("O motivo do cancelamento não foi informado.")
    if len(normalizado) > 255 or any(ord(c) < 32 or ord(c) == 127 for c in normalizado):
        raise ConsultaFiscalInvalida("O motivo do cancelamento possui formato inválido.")
    return normalizado


def _normalizar_status_portal(texto: str) -> str:
    """Normaliza apenas diferenças de apresentação do status da Receita.

    Espaços, quebras de linha, capitalização e acentos não alteram a
    classificação. Não há correspondência parcial: somente os estados exatos
    ``autorizada`` e ``cancelada`` recebem tratamento especial.
    """

    sem_acentos = "".join(
        caractere
        for caractere in unicodedata.normalize("NFKD", texto)
        if not unicodedata.combining(caractere)
    )
    return re.sub(r"\s+", " ", sem_acentos).strip().casefold()


def _resumir_status_para_log(texto: str) -> str:
    """Mantém o diagnóstico útil e evita registrar texto inesperadamente longo."""

    return texto[:120] + ("…" if len(texto) > 120 else "")


async def cancelar_nota_consultada(
    page: Page,
    *,
    motivo: str,
    ambiente: AmbienteEmissao,
    logger: logging.Logger,
    antes_confirmar: Callable[[], Awaitable[None]] | None = None,
) -> None:
    """Cancela a única nota consultada e exige a prova na resposta atual.

    O clique em ``Confirmar`` não é tratado como sucesso. Se a resposta oficial
    não puder ser provada na tela resultante, o chamador deve encaminhar a
    operação para conferência humana e nunca repeti-la automaticamente.

    A situação da linha é lida antes de qualquer ação. Se o portal já informar
    ``Cancelada``, o estado desejado está provado e o comando não é reenviado.
    """

    motivo_limpo = _normalizar_motivo_cancelamento(motivo)
    exigir_pagina_consulta(page.url, ambiente)

    logger.info("Cancelamento: conferindo a situação atual da nota")
    try:
        status = page.locator(SELETOR_STATUS_RESULTADO)
        await status.wait_for(state="visible", timeout=15_000)
        texto_status_bruto = await status.inner_text(timeout=5_000)
    except PlaywrightTimeoutError as exc:
        raise CancelamentoFiscalRecusado(
            "Não foi possível confirmar a situação atual da nota no portal fiscal. Tente novamente ou chame o suporte."
        ) from exc

    texto_status = _normalizar_status_portal(texto_status_bruto)
    classificacao = (
        "CANCELADA"
        if texto_status == "cancelada"
        else "AUTORIZADA"
        if texto_status == "autorizada"
        else "DESCONHECIDA"
    )
    logger.info(
        "Cancelamento: situação da linha fiscal lida "
        "(seletor=%s, bruto=%r, normalizado=%r, classificação=%s)",
        SELETOR_STATUS_RESULTADO,
        _resumir_status_para_log(texto_status_bruto),
        texto_status,
        classificacao,
    )

    if texto_status == "cancelada":
        logger.info(
            "Nota já aparece como Cancelada no portal; cancelamento não será reenviado"
        )
        return
    if texto_status != "autorizada":
        raise CancelamentoFiscalRecusado(
            "A nota não aparece como Autorizada no portal. Confira sua situação antes de tentar cancelar."
        )

    acao = page.locator(SELETOR_CANCELAR_RESULTADO).last
    try:
        logger.info("Cancelamento: aguardando a ação da linha consultada")
        await acao.wait_for(state="visible", timeout=15_000)
        await acao.click(timeout=15_000)
        logger.info("Cancelamento: formulário aberto; aguardando o campo de motivo")
        campo = page.locator(SELETOR_MOTIVO_CANCELAMENTO).last
        await campo.wait_for(state="visible", timeout=15_000)
        await campo.fill(motivo_limpo)
        if (await campo.input_value()).strip() != motivo_limpo:
            raise ConsultaFiscalInvalida(
                "O portal alterou o motivo antes da confirmação do cancelamento."
            )
        logger.info("Motivo do cancelamento preenchido (conteúdo omitido)")
    except PlaywrightTimeoutError as exc:
        raise CancelamentoFiscalRecusado(
            "A ação de cancelamento não ficou disponível no portal fiscal. A nota pode não permitir mais essa operação."
        ) from exc

    # Abrir o formulário pode trocar a rota da SPA. Exigir a rota /consulta
    # neste ponto bloqueava uma transição legítima antes mesmo do clique. A
    # proteção sensível permanece fechada sobre HTTPS + host fiscal exato.
    try:
        exigir_origem_fiscal(page.url, ambiente)
    except Exception as exc:
        raise CancelamentoNaoEnviado(
            "O formulário saiu da origem fiscal oficial antes da confirmação. O cancelamento não foi enviado."
        ) from exc

    # O botão fica ancorado ao mesmo article que contém o motivo. Um locator
    # global por role pode colidir com outro "Confirmar" responsivo da SPA.
    confirmar = page.locator(SELETOR_CONFIRMAR_CANCELAMENTO).last
    try:
        logger.info(
            "Cancelamento: aguardando o botão Confirmar ficar visível e habilitado"
        )
        await confirmar.wait_for(state="visible", timeout=15_000)
        if not await confirmar.is_enabled(timeout=5_000):
            raise CancelamentoNaoEnviado(
                "O portal não habilitou a confirmação. O cancelamento não foi enviado."
            )
    except PlaywrightTimeoutError as exc:
        raise CancelamentoNaoEnviado(
            "O botão de confirmação não ficou disponível. O cancelamento não foi enviado."
        ) from exc

    if antes_confirmar is not None:
        try:
            await antes_confirmar()
        except Exception as exc:
            raise CancelamentoNaoEnviado(
                "A posse da tarefa não pôde ser confirmada. O cancelamento não foi enviado."
            ) from exc

    # A partir do início deste clique, uma interrupção pode ser ambígua: o
    # portal pode ter recebido o comando mesmo sem responder ao navegador.
    logger.info("Cancelamento: enviando a confirmação fiscal")
    try:
        await confirmar.click(timeout=15_000)
    except Exception as exc:
        raise CancelamentoResultadoIncerto(
            "O navegador iniciou a confirmação, mas não comprovou a conclusão do clique. Confira a nota diretamente na Receita antes de tentar novamente."
        ) from exc
    logger.info(
        "Cancelamento: clique em Confirmar concluído pelo navegador; aguardando a prova oficial na tela atual"
    )

    try:
        sucesso = page.get_by_text(TEXTO_SUCESSO_CANCELAMENTO, exact=False).first
        await sucesso.wait_for(state="visible", timeout=20_000)
    except Exception as exc:
        # Não há prazo legal codificado. A mensagem do portal é apenas usada
        # para orientar o usuário; ausência de prova permanece resultado incerto.
        texto = ""
        try:
            texto = await page.locator("body").inner_text(timeout=5_000)
        except Exception:
            pass
        texto_normalizado = re.sub(r"\s+", " ", texto).strip().lower()
        if "prazo de cancelamento" in texto_normalizado:
            raise CancelamentoFiscalRecusado(
                "O portal recusou o cancelamento. A nota pode ser antiga demais para cancelamento conforme as regras aplicáveis."
            ) from exc
        if any(sinal in texto_normalizado for sinal in ("cancelamento não", "erro ao cancelar", "rejeição")):
            raise CancelamentoFiscalRecusado(
                "O portal informou que o cancelamento não foi realizado. Revise a nota ou chame o suporte."
            ) from exc
        raise CancelamentoResultadoIncerto(
            "A confirmação foi enviada, mas o resultado não apareceu na tela. Confira a nota diretamente na Receita antes de tentar novamente."
        ) from exc

    logger.info("Cancelamento confirmado pela mensagem oficial do portal")


def localizar_xml_autorizado_mais_recente(download_dir: str) -> str:
    """Localiza o XML autorizado mais recente sem expor seu conteúdo.

    Este auxiliar existe para o ensaio humano emissão → consulta. Ele só aceita
    arquivos regulares criados pelo padrão de nomes do Worker e recusa links.
    A autorização e a chave ainda são validadas pelo parser fiscal antes do uso.
    """

    diretorio = Path(download_dir)
    if not diretorio.is_dir() or diretorio.is_symlink():
        raise ConsultaFiscalInvalida(
            "O diretório privado de downloads não está disponível para consulta."
        )
    candidatos = [
        caminho
        for caminho in diretorio.glob("xml_*.xml")
        if caminho.is_file() and not caminho.is_symlink()
    ]
    if not candidatos:
        raise ConsultaFiscalInvalida(
            "Nenhum XML autorizado local foi encontrado para o ensaio de consulta."
        )
    return str(max(candidatos, key=lambda caminho: caminho.stat().st_mtime_ns))


async def selecionar_emitente_consulta(
    page: Page,
    valor_select_nfpe: str,
    logger: logging.Logger,
) -> None:
    """Seleciona exatamente o emitente original da nota.

    Mesmo que a tela mostre apenas uma opção hoje, nunca escolhemos por posição:
    o ``value`` persistido no cadastro do emitente é estável e evita recuperar
    documentos sob a sessão fiscal errada caso novas opções apareçam.
    """

    valor = valor_select_nfpe.strip()
    if not re.fullmatch(r"[A-Za-z0-9._:-]{1,120}", valor):
        raise ConsultaFiscalInvalida(
            "O identificador NFP-e do emitente é inválido; revise o cadastro."
        )

    # A tela ganha outros selects conforme carrega os filtros. Restringir pelo
    # value esperado evita strict-mode ambiguity e não depende da ordem visual.
    campo = page.locator(
        f'{SELETOR_EMITENTE_CONSULTA}:has(option[value="{valor}"])'
    )
    try:
        # A SPA publica o <select> antes de terminar de carregar suas opções.
        # select_option espera a opção exata existir, sem uma pausa fixa.
        await campo.select_option(value=valor, timeout=15_000)
    except PlaywrightTimeoutError as exc:
        raise ConsultaFiscalInvalida(
            "O emitente original não está disponível nesta sessão fiscal."
        ) from exc

    if await campo.input_value() != valor:
        raise ConsultaFiscalInvalida(
            "A seleção do emitente original não foi confirmada pela tela."
        )
    logger.info("Emitente original selecionado para consulta fiscal")


def validar_chave_acesso(chave_acesso: str) -> str:
    """Aceita somente a chave oficial de 44 dígitos, sem registrá-la em log."""

    chave = chave_acesso.strip()
    if not re.fullmatch(r"\d{44}", chave):
        raise ConsultaFiscalInvalida(
            "A nota não possui uma chave de acesso válida para consulta."
        )
    return chave


async def pesquisar_nota_por_chave(
    page: Page,
    chave_acesso: str,
    logger: logging.Logger,
    *,
    pausar_apos_clique: bool = False,
) -> None:
    """Pesquisa uma nota conhecida e confirma um único resultado baixável.

    A chave nunca aparece em logs. O método somente prepara o resultado; os
    downloads serão ligados à fila/Storage em uma etapa separada.
    """

    chave = validar_chave_acesso(chave_acesso)
    etapa = "preparar o filtro"
    pausa_executada = False
    try:
        campo = await preparar_filtro_chave(page, logger)
        etapa = "inserir a chave"
        # ``fill`` falhou no input dinâmico do portal durante o primeiro ensaio
        # ao vivo. Foco + seleção + inserção em um único evento reproduzem a
        # colagem manual e deixam a SPA aplicar seus próprios handlers.
        await campo.click()
        await asyncio.sleep(0.2)
        await campo.press("Control+A")
        await page.keyboard.insert_text(chave)
        logger.info("Chave inserida no campo de consulta (conteúdo omitido)")
        etapa = "confirmar o campo"
        if await campo.input_value() != chave:
            raise ConsultaFiscalInvalida(
                "A chave de acesso foi alterada pela tela antes da consulta."
            )
        logger.info("Campo da chave confirmado pela tela")
        etapa = "clicar em Consultar"
        await page.get_by_role(
            "button", name="Consultar", exact=True
        ).click(timeout=15_000)
        logger.info("Consulta enviada ao portal")
        if pausar_apos_clique:
            logger.warning(
                "Consultar foi clicado. Confira a tela e clique em Resume para "
                "o Worker validar o resultado."
            )
            pausa_executada = True
            await page.pause()
        etapa = "confirmar o resultado"
        contagem = page.locator(SELETOR_CONTAGEM_RESULTADO).filter(
            has_text=re.compile(r"^\s*Um registro\s*$", re.IGNORECASE)
        ).first
        await contagem.wait_for(state="visible", timeout=30_000)
        logger.info("Contagem da consulta confirmada como um registro")
        etapa = "confirmar o ícone DANFE"
        await _acao_da_linha_resultado(page, SELETOR_DANFE_RESULTADO).wait_for(
            state="visible", timeout=15_000
        )
        logger.info("Ação DANFE disponível no resultado")
        etapa = "confirmar o ícone XML"
        await _acao_da_linha_resultado(page, SELETOR_XML_RESULTADO).wait_for(
            state="visible", timeout=15_000
        )
        logger.info("Ação XML disponível no resultado")
    except Exception as exc:
        logger.error("Consulta interrompida ao %s", etapa)
        if pausar_apos_clique and not pausa_executada:
            logger.warning(
                "Abrindo o Inspector no ponto da falha; a chave permanece omitida."
            )
            await page.pause()
        if isinstance(exc, ConsultaFiscalInvalida):
            raise
        if isinstance(exc, PlaywrightTimeoutError):
            raise NotaConsultaNaoEncontrada(
                "A Receita não retornou um único resultado com XML e DANFE."
            ) from exc
        raise

    logger.info("Nota localizada por chave; XML e DANFE estão disponíveis")


async def preparar_filtro_chave(
    page: Page,
    logger: logging.Logger,
) -> Locator:
    """Ativa o filtro por chave e devolve o campo ainda vazio."""

    filtro = page.locator(SELETOR_FILTRO_CHAVE)
    try:
        await filtro.select_option(value="1", timeout=15_000)
        campo = page.locator(SELETOR_CAMPO_CHAVE).first
        await campo.wait_for(state="visible", timeout=15_000)
    except PlaywrightTimeoutError as exc:
        raise ConsultaFiscalInvalida(
            "O filtro por chave de acesso não ficou disponível na consulta."
        ) from exc

    logger.info("Filtro por chave de acesso preparado (campo vazio)")
    return campo
