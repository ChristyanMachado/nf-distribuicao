"""Testes puros do início da recuperação fiscal, sem acessar a Receita."""
from __future__ import annotations

import asyncio
import logging
import os
import time
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest
from playwright.async_api import TimeoutError as PlaywrightTimeoutError

from src.flows.consulta import (
    CancelamentoFiscalRecusado,
    CancelamentoNaoEnviado,
    CancelamentoResultadoIncerto,
    ConsultaFiscalInvalida,
    FalhaDownloadDocumento,
    NotaConsultaNaoEncontrada,
    SELETOR_CAMPO_CHAVE,
    SELETOR_CONFIRMAR_CANCELAMENTO,
    SELETOR_CONTAGEM_RESULTADO,
    SELETOR_DANFE_RESULTADO,
    SELETOR_EMITENTE_CONSULTA,
    SELETOR_FILTRO_CHAVE,
    SELETOR_XML_RESULTADO,
    SELETOR_CANCELAR_RESULTADO,
    SELETOR_MOTIVO_CANCELAMENTO,
    SELETOR_STATUS_RESULTADO,
    TEXTO_SUCESSO_CANCELAMENTO,
    baixar_documentos_consulta,
    cancelar_nota_consultada,
    pesquisar_nota_por_chave,
    preparar_filtro_chave,
    localizar_xml_autorizado_mais_recente,
    _normalizar_status_portal,
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
        self.ultimo = False

    async def select_option(self, *, value: str, timeout: int) -> None:
        assert (value, timeout) == ("1", 15_000)

    async def wait_for(self, *, state: str, timeout: int) -> None:
        assert state == "visible"
        if self.expirar:
            raise PlaywrightTimeoutError("resultado ausente")

    async def fill(self, valor: str) -> None:
        self.valor = valor

    async def click(self, *, timeout: int | None = None) -> None:
        if timeout is not None:
            assert timeout == 15_000
            self.clicado = True

    async def press(self, tecla: str) -> None:
        assert tecla in {"Control+A", "Tab"}

    async def input_value(self) -> str:
        return self.valor

    def filter(self, *, has_text):
        self.filtro_texto = has_text
        return self

    @property
    def first(self):
        return self

    @property
    def last(self):
        self.ultimo = True
        return self


class PaginaPesquisaFalsa:
    def __init__(self, *, sem_resultado: bool = False) -> None:
        self.filtro = ElementoConsultaFalso()
        self.campo = ElementoConsultaFalso()
        self.contagem = ElementoConsultaFalso(expirar=sem_resultado)
        self.danfe = ElementoConsultaFalso()
        self.xml = ElementoConsultaFalso()
        self.botao = ElementoConsultaFalso()
        self.keyboard = TecladoConsultaFalso(self.campo)
        self.pausado = False

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

    async def pause(self) -> None:
        self.pausado = True


class TecladoConsultaFalso:
    def __init__(self, campo: ElementoConsultaFalso) -> None:
        self.campo = campo

    async def insert_text(self, valor: str) -> None:
        self.campo.valor = valor


def test_pesquisa_chave_sem_pontos_e_confirma_documentos() -> None:
    pagina = PaginaPesquisaFalsa()
    chave = "1" * 44

    asyncio.run(pesquisar_nota_por_chave(pagina, chave, _logger()))

    assert pagina.campo.valor == chave
    assert pagina.botao.clicado is True
    assert pagina.contagem.filtro_texto.fullmatch("Um registro")


def test_pesquisa_pausa_imediatamente_depois_de_consultar() -> None:
    pagina = PaginaPesquisaFalsa()

    asyncio.run(
        pesquisar_nota_por_chave(
            pagina,
            "1" * 44,
            _logger(),
            pausar_apos_clique=True,
        )
    )

    assert pagina.botao.clicado is True
    assert pagina.pausado is True


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


def test_localiza_xml_mais_recente_sem_aceitar_outros_arquivos(tmp_path) -> None:
    antigo = tmp_path / "xml_cliente_antigo.xml"
    recente = tmp_path / "xml_cliente_recente.xml"
    (tmp_path / "danfe_cliente.pdf").write_bytes(b"%PDF-")
    antigo.write_text("antigo", encoding="utf-8")
    recente.write_text("recente", encoding="utf-8")
    agora = time.time()
    os.utime(antigo, (agora - 10, agora - 10))
    os.utime(recente, (agora, agora))

    assert localizar_xml_autorizado_mais_recente(str(tmp_path)) == str(recente)


def test_localizar_xml_falha_quando_diretorio_esta_vazio(tmp_path) -> None:
    with pytest.raises(ConsultaFiscalInvalida, match="Nenhum XML autorizado"):
        localizar_xml_autorizado_mais_recente(str(tmp_path))


def test_download_consulta_confere_xml_antes_de_baixar_danfe(tmp_path) -> None:
    pagina = PaginaPesquisaFalsa()
    chave = "1" * 44
    numero = "123"
    baixar = AsyncMock(
        side_effect=[
            str(tmp_path / "recuperado.xml"),
            str(tmp_path / "recuperado.pdf"),
        ]
    )

    with (
        patch("src.flows.consulta.baixar_documento_por_acao", baixar),
        patch(
            "src.flows.consulta.extrair_metadados_xml",
            return_value=SimpleNamespace(chave_acesso=chave, numero=numero),
        ),
    ):
        resultado = asyncio.run(
            baixar_documentos_consulta(
                pagina,
                chave_acesso=chave,
                numero=numero,
                download_dir=str(tmp_path),
                tarefa_id="CLIENTE_A",
                logger=_logger(),
            )
        )

    assert baixar.await_count == 2
    assert resultado["xml_path"].endswith(".xml")
    assert resultado["pdf_path"].endswith(".pdf")
    assert baixar.await_args_list[0].kwargs["acionador"] is pagina.xml
    assert baixar.await_args_list[1].kwargs["acionador"] is pagina.danfe
    assert pagina.xml.ultimo is True
    assert pagina.danfe.ultimo is True


def test_download_consulta_recusa_xml_de_outra_nota(tmp_path) -> None:
    pagina = PaginaPesquisaFalsa()
    chave = "1" * 44
    baixar = AsyncMock(return_value=str(tmp_path / "recuperado.xml"))

    with (
        patch("src.flows.consulta.baixar_documento_por_acao", baixar),
        patch(
            "src.flows.consulta.extrair_metadados_xml",
            return_value=SimpleNamespace(chave_acesso="2" * 44, numero="123"),
        ),
    ):
        with pytest.raises(FalhaDownloadDocumento, match="não corresponde"):
            asyncio.run(
                baixar_documentos_consulta(
                    pagina,
                    chave_acesso=chave,
                    numero="123",
                    download_dir=str(tmp_path),
                    tarefa_id="CLIENTE_A",
                    logger=_logger(),
                )
            )

    assert baixar.await_count == 1


class ElementoCancelamentoFalso:
    def __init__(
        self,
        *,
        expirar: bool = False,
        texto: str = "",
        habilitado: bool = True,
        ao_clicar=None,
        erro_clique: Exception | None = None,
    ) -> None:
        self.expirar = expirar
        self.texto = texto
        self.habilitado = habilitado
        self.ao_clicar = ao_clicar
        self.erro_clique = erro_clique
        self.valor = ""
        self.clicado = False

    @property
    def first(self):
        return self

    @property
    def last(self):
        return self

    async def wait_for(self, *, state: str, timeout: int) -> None:
        assert state == "visible"
        if self.expirar:
            raise PlaywrightTimeoutError("ausente")

    async def click(self, *, timeout: int) -> None:
        self.clicado = True
        if self.ao_clicar is not None:
            self.ao_clicar()
        if self.erro_clique is not None:
            raise self.erro_clique

    async def is_enabled(self, *, timeout: int) -> bool:
        assert timeout == 5_000
        return self.habilitado

    async def fill(self, valor: str) -> None:
        self.valor = valor

    async def input_value(self) -> str:
        return self.valor

    async def inner_text(self, *, timeout: int) -> str:
        return self.texto


class PaginaCancelamentoFalsa:
    def __init__(
        self,
        *,
        sucesso: bool = True,
        texto_erro: str = "",
        status: str = "Autorizada",
        url_apos_acao: str = "https://homologacao.nfae.fazenda.pr.gov.br/nfae/produtor/cancelamento",
        confirmar_expira: bool = False,
        confirmar_habilitado: bool = True,
        erro_clique_confirmar: Exception | None = None,
    ) -> None:
        self.url = "https://homologacao.nfae.fazenda.pr.gov.br/nfae/produtor/consulta"
        self.acao = ElementoCancelamentoFalso(
            ao_clicar=lambda: setattr(self, "url", url_apos_acao)
        )
        self.campo = ElementoCancelamentoFalso()
        self.confirmar = ElementoCancelamentoFalso(
            expirar=confirmar_expira,
            habilitado=confirmar_habilitado,
            erro_clique=erro_clique_confirmar,
        )
        self.sucesso = ElementoCancelamentoFalso(expirar=not sucesso)
        self.body = ElementoCancelamentoFalso(texto=texto_erro)
        self.status = ElementoCancelamentoFalso(texto=status)
        self.recarregada = False

    def locator(self, seletor: str):
        return {
            SELETOR_CANCELAR_RESULTADO: self.acao,
            SELETOR_CONFIRMAR_CANCELAMENTO: self.confirmar,
            SELETOR_MOTIVO_CANCELAMENTO: self.campo,
            SELETOR_STATUS_RESULTADO: self.status,
            "body": self.body,
        }[seletor]

    def get_by_text(self, texto: str, *, exact: bool):
        assert texto == TEXTO_SUCESSO_CANCELAMENTO
        assert exact is False
        return self.sucesso

    async def reload(self, *, wait_until: str, timeout: int) -> None:
        assert (wait_until, timeout) == ("domcontentloaded", 30_000)
        self.recarregada = True


def test_cancelamento_conclui_na_tela_atual_com_mensagem_oficial() -> None:
    pagina = PaginaCancelamentoFalsa()

    asyncio.run(cancelar_nota_consultada(
        pagina, motivo="Dados incorretos", ambiente="teste", logger=_logger()
    ))

    assert pagina.acao.clicado is True
    assert pagina.campo.valor == "Dados incorretos"
    assert pagina.confirmar.clicado is True
    assert pagina.recarregada is False


@pytest.mark.parametrize(
    ("texto", "esperado"),
    [
        (" Autorizada ", "autorizada"),
        ("\nAUTORIZADA\t", "autorizada"),
        ("Situação desconhecida", "situacao desconhecida"),
    ],
)
def test_normaliza_status_do_portal_sem_correspondencia_parcial(
    texto: str,
    esperado: str,
) -> None:
    assert _normalizar_status_portal(texto) == esperado


def test_cancelamento_aceita_autorizada_com_espacos_e_quebras_de_linha() -> None:
    pagina = PaginaCancelamentoFalsa(status=" \n  AUTORIZADA\t ")

    asyncio.run(cancelar_nota_consultada(
        pagina, motivo="Dados incorretos", ambiente="teste", logger=_logger()
    ))

    assert pagina.confirmar.clicado is True


def test_cancelamento_registra_status_bruto_normalizado_e_classificacao(
    caplog: pytest.LogCaptureFixture,
) -> None:
    logger = logging.getLogger("teste_status_cancelamento")
    with caplog.at_level(logging.INFO, logger=logger.name):
        asyncio.run(cancelar_nota_consultada(
            PaginaCancelamentoFalsa(status="\n Autorizada \t"),
            motivo="Dados incorretos",
            ambiente="teste",
            logger=logger,
        ))

    assert "bruto='\\n Autorizada \\t'" in caplog.text
    assert "normalizado='autorizada'" in caplog.text
    assert "classificação=AUTORIZADA" in caplog.text


def test_cancelamento_ja_confirmado_nao_e_enviado_novamente() -> None:
    pagina = PaginaCancelamentoFalsa(status="  Cancelada  ")

    asyncio.run(cancelar_nota_consultada(
        pagina, motivo="Dados incorretos", ambiente="teste", logger=_logger()
    ))

    assert pagina.acao.clicado is False
    assert pagina.confirmar.clicado is False
    assert pagina.recarregada is False


def test_cancelamento_antigo_usa_retorno_do_portal_sem_inventar_prazo() -> None:
    pagina = PaginaCancelamentoFalsa(
        sucesso=False,
        texto_erro="Prazo de cancelamento superior ao previsto na legislação",
    )

    with pytest.raises(CancelamentoFiscalRecusado, match="pode ser antiga demais"):
        asyncio.run(cancelar_nota_consultada(
            pagina, motivo="Dados incorretos", ambiente="teste", logger=_logger()
        ))


def test_cancelamento_sem_confirmacao_fica_incerto_e_nao_presume_sucesso() -> None:
    pagina = PaginaCancelamentoFalsa(sucesso=False)

    with pytest.raises(CancelamentoResultadoIncerto, match="Confira a nota"):
        asyncio.run(cancelar_nota_consultada(
            pagina, motivo="Dados incorretos", ambiente="teste", logger=_logger()
        ))


def test_cancelamento_formulario_em_nova_rota_oficial_pode_confirmar() -> None:
    pagina = PaginaCancelamentoFalsa(
        url_apos_acao="https://homologacao.nfae.fazenda.pr.gov.br/nfae/produtor/evento/cancelar"
    )

    asyncio.run(cancelar_nota_consultada(
        pagina, motivo="Dados incorretos", ambiente="teste", logger=_logger()
    ))

    assert pagina.confirmar.clicado is True


def test_cancelamento_bloqueia_origem_inesperada_antes_de_confirmar() -> None:
    pagina = PaginaCancelamentoFalsa(
        url_apos_acao="https://nfae.fazenda.pr.gov.br.evil.example/cancelar"
    )

    with pytest.raises(CancelamentoNaoEnviado, match="não foi enviado"):
        asyncio.run(cancelar_nota_consultada(
            pagina, motivo="Dados incorretos", ambiente="teste", logger=_logger()
        ))

    assert pagina.confirmar.clicado is False


def test_cancelamento_sem_botao_confirmar_e_falha_certa() -> None:
    pagina = PaginaCancelamentoFalsa(confirmar_expira=True)

    with pytest.raises(CancelamentoNaoEnviado, match="não foi enviado"):
        asyncio.run(cancelar_nota_consultada(
            pagina, motivo="Dados incorretos", ambiente="teste", logger=_logger()
        ))

    assert pagina.confirmar.clicado is False


def test_cancelamento_erro_durante_clique_permanece_incerto() -> None:
    pagina = PaginaCancelamentoFalsa(
        erro_clique_confirmar=PlaywrightTimeoutError("resposta interrompida")
    )

    with pytest.raises(CancelamentoResultadoIncerto, match="Confira a nota"):
        asyncio.run(cancelar_nota_consultada(
            pagina, motivo="Dados incorretos", ambiente="teste", logger=_logger()
        ))

    assert pagina.confirmar.clicado is True


def test_cancelamento_recusa_situacao_que_nao_seja_autorizada() -> None:
    pagina = PaginaCancelamentoFalsa(status="Denegada")

    with pytest.raises(CancelamentoFiscalRecusado, match="não aparece como Autorizada"):
        asyncio.run(cancelar_nota_consultada(
            pagina, motivo="Dados incorretos", ambiente="teste", logger=_logger()
        ))

    assert pagina.acao.clicado is False
    assert pagina.confirmar.clicado is False


def test_cancelamento_recusa_pagina_de_outro_ambiente_antes_do_clique() -> None:
    pagina = PaginaCancelamentoFalsa()

    with pytest.raises(Exception, match="origem e o ambiente fiscal não correspondem"):
        asyncio.run(cancelar_nota_consultada(
            pagina, motivo="Dados incorretos", ambiente="normal", logger=_logger()
        ))

    assert pagina.acao.clicado is False
    assert pagina.confirmar.clicado is False
