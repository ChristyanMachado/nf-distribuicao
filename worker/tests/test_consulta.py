"""Testes puros do início da recuperação fiscal, sem acessar a Receita."""
from __future__ import annotations

import asyncio
import logging

import pytest
from playwright.async_api import TimeoutError as PlaywrightTimeoutError

from src.flows.consulta import (
    ConsultaFiscalInvalida,
    NotaConsultaNaoEncontrada,
    SELETOR_CAMPO_CHAVE,
    SELETOR_CONTAGEM_RESULTADO,
    SELETOR_DANFE_RESULTADO,
    SELETOR_EMITENTE_CONSULTA,
    SELETOR_FILTRO_CHAVE,
    SELETOR_XML_RESULTADO,
    pesquisar_nota_por_chave,
    preparar_filtro_chave,
    selecionar_emitente_consulta,
    validar_chave_acesso,
)


class SelectFalso:
    def __init__(self, valores: list[str]) -> None:
        self.valores = valores
        self.selecionado: str | None = None

    async def select_option(self, *, value: str, timeout: int) -> None:
        assert timeout == 15_000
        if value not in self.valores:
            raise PlaywrightTimeoutError("opção não apareceu")
        self.selecionado = value

    async def input_value(self) -> str:
        return self.selecionado or ""


class PaginaFalsa:
    def __init__(self, valores: list[str]) -> None:
        self.campo = SelectFalso(valores)

    def locator(self, seletor: str) -> SelectFalso:
        assert seletor.startswith(SELETOR_EMITENTE_CONSULTA)
        return self.campo


def _logger() -> logging.Logger:
    logger = logging.getLogger("teste_consulta")
    logger.handlers.clear()
    logger.addHandler(logging.NullHandler())
    return logger


def test_seleciona_emitente_exato_sem_depender_da_posicao() -> None:
    pagina = PaginaFalsa(["", "outro", "emitente-esperado"])

    asyncio.run(
        selecionar_emitente_consulta(pagina, "emitente-esperado", _logger())
    )

    assert pagina.campo.selecionado == "emitente-esperado"


def test_recusa_emitente_ausente_na_sessao() -> None:
    with pytest.raises(ConsultaFiscalInvalida, match="não está disponível"):
        asyncio.run(
            selecionar_emitente_consulta(
                PaginaFalsa(["", "outro"]), "esperado", _logger()
            )
        )


@pytest.mark.parametrize("chave", ["", "1" * 43, "1" * 45, "A" * 44])
def test_chave_de_acesso_exige_44_digitos(chave: str) -> None:
    with pytest.raises(ConsultaFiscalInvalida, match="chave de acesso válida"):
        validar_chave_acesso(chave)


def test_chave_de_acesso_valida_e_preservada() -> None:
    chave = "1" * 44
    assert validar_chave_acesso(chave) == chave


def test_identificador_do_emitente_nao_pode_injetar_seletor() -> None:
    with pytest.raises(ConsultaFiscalInvalida, match="identificador NFP-e"):
        asyncio.run(
            selecionar_emitente_consulta(
                PaginaFalsa([]), 'x"] select', _logger()
            )
        )


class ElementoConsultaFalso:
    def __init__(self, *, expirar: bool = False) -> None:
        self.expirar = expirar
        self.valor = ""
        self.filtro_texto = None
        self.clicado = False

    async def select_option(self, *, value: str, timeout: int) -> None:
        assert (value, timeout) == ("1", 15_000)

    async def wait_for(self, *, state: str, timeout: int) -> None:
        assert state == "visible"
        if self.expirar:
            raise PlaywrightTimeoutError("resultado ausente")

    async def fill(self, valor: str) -> None:
        self.valor = valor

    async def input_value(self) -> str:
        return self.valor

    async def click(self, *, timeout: int) -> None:
        assert timeout == 15_000
        self.clicado = True

    def filter(self, *, has_text):
        self.filtro_texto = has_text
        return self


class PaginaPesquisaFalsa:
    def __init__(self, *, sem_resultado: bool = False) -> None:
        self.filtro = ElementoConsultaFalso()
        self.campo = ElementoConsultaFalso()
        self.contagem = ElementoConsultaFalso(expirar=sem_resultado)
        self.danfe = ElementoConsultaFalso()
        self.xml = ElementoConsultaFalso()
        self.botao = ElementoConsultaFalso()

    def locator(self, seletor: str) -> ElementoConsultaFalso:
        return {
            SELETOR_FILTRO_CHAVE: self.filtro,
            SELETOR_CAMPO_CHAVE: self.campo,
            SELETOR_CONTAGEM_RESULTADO: self.contagem,
            SELETOR_DANFE_RESULTADO: self.danfe,
            SELETOR_XML_RESULTADO: self.xml,
        }[seletor]

    def get_by_role(
        self, papel: str, *, name: str, exact: bool
    ) -> ElementoConsultaFalso:
        assert (papel, name, exact) == ("button", "Consultar", True)
        return self.botao


def test_pesquisa_chave_sem_pontos_e_confirma_documentos() -> None:
    pagina = PaginaPesquisaFalsa()
    chave = "1" * 44

    asyncio.run(pesquisar_nota_por_chave(pagina, chave, _logger()))

    assert pagina.campo.valor == chave
    assert pagina.botao.clicado is True
    assert pagina.contagem.filtro_texto.fullmatch("Um registro")


def test_prepara_filtro_sem_preencher_nem_consultar() -> None:
    pagina = PaginaPesquisaFalsa()

    campo = asyncio.run(preparar_filtro_chave(pagina, _logger()))

    assert campo is pagina.campo
    assert pagina.campo.valor == ""
    assert pagina.botao.clicado is False


def test_pesquisa_sem_resultado_falha_sem_expor_chave() -> None:
    chave = "1" * 44

    with pytest.raises(NotaConsultaNaoEncontrada) as falha:
        asyncio.run(
            pesquisar_nota_por_chave(
                PaginaPesquisaFalsa(sem_resultado=True), chave, _logger()
            )
        )

    assert chave not in str(falha.value)
