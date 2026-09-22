"""Emissão e confirmação do resultado fiscal, sem abrir Chromium real."""
import asyncio
import logging

import pytest

from src.flows.emissao import (
    Destinatario,
    Emitente,
    EmissaoBloqueada,
    FalhaConfirmacaoEmissao,
    FalhaTransitoriaPortal,
    Tarefa,
    ValorFiscalDivergente,
    _formatar_decimal_portal,
    _preencher_decimal_portal,
    aguardar_icms_apos_produto,
    aguardar_autorizacao,
    avancar_identificacao_operacao,
    clicar_avancar_por_contexto,
    clicar_avancar_produto,
    emitir,
    selecionar_emitente,
)
from playwright.async_api import TimeoutError as PlaywrightTimeoutError


def _logger_silencioso() -> logging.Logger:
    logger = logging.getLogger("teste-emissao")
    logger.addHandler(logging.NullHandler())
    return logger


def _tarefa_fake(tarefa_id: str) -> Tarefa:
    return Tarefa(
        tarefa_id=tarefa_id,
        cliente_id="CLIENTE_TESTE",
        emitente=Emitente(valor_select="1"),
        destinatario=Destinatario(
            cnpj="00.000.000/0001-00",
            indicador_ie="CONTRIBUINTE",
            razao_social="Teste",
            cep="00000-000",
            numero_endereco="1",
        ),
    )


class BotaoEmitirFalso:
    def __init__(self) -> None:
        self.clicado = False

    async def click(self) -> None:
        self.clicado = True


class PaginaEmissaoFalsa:
    def __init__(self, url: str) -> None:
        self.url = url
        self.botao = BotaoEmitirFalso()

    def get_by_role(self, papel: str, *, name: str, exact: bool):
        assert papel == "button"
        assert name == "Emitir"
        assert exact is True
        return self.botao


def test_emitir_clica_somente_no_dominio_de_homologacao():
    pagina = PaginaEmissaoFalsa(
        "https://homologacao.nfae.fazenda.pr.gov.br/nfae/produtor/emitir/resumo"
    )

    asyncio.run(emitir(pagina, _tarefa_fake("T1"), _logger_silencioso(), ambiente="teste"))

    assert pagina.botao.clicado is True


def test_emitir_clica_no_dominio_de_producao_quando_ambiente_corresponde():
    pagina = PaginaEmissaoFalsa(
        "https://nfae.fazenda.pr.gov.br/nfae/produtor/emitir/resumo"
    )

    asyncio.run(emitir(pagina, _tarefa_fake("T1"), _logger_silencioso(), ambiente="normal"))

    assert pagina.botao.clicado is True


@pytest.mark.parametrize(
    ("url", "ambiente"),
    [
        ("https://nfae.fazenda.pr.gov.br/nfae/produtor/emitir/resumo", "teste"),
        ("https://homologacao.nfae.fazenda.pr.gov.br/nfae/produtor/emitir/resumo", "normal"),
        ("https://homologacao.nfae.fazenda.pr.gov.br.evil.example/nfae/x", "teste"),
    ],
)
def test_emitir_bloqueia_quando_host_e_ambiente_nao_correspondem(url, ambiente):
    pagina = PaginaEmissaoFalsa(url)

    with pytest.raises(EmissaoBloqueada, match="ambiente fiscal"):
        asyncio.run(
            emitir(
                pagina,
                _tarefa_fake("T1"),
                _logger_silencioso(),
                ambiente=ambiente,
            )
        )

    assert pagina.botao.clicado is False


class StatusFalso:
    first: "StatusFalso"

    def __init__(self, texto: str | None) -> None:
        self.first = self
        self.texto = texto
        self.aguardado = False

    def filter(self, *, has_text):
        assert has_text.fullmatch("AUTORIZADA")
        return self

    async def wait_for(self, *, state: str, timeout: int) -> None:
        assert state == "visible"
        assert timeout == 60_000
        self.aguardado = True
        if self.texto is None:
            await asyncio.Future()

    async def inner_text(self) -> str:
        assert self.texto is not None
        return self.texto


class PaginaAutorizadaFalsa:
    url = "https://homologacao.nfae.fazenda.pr.gov.br/nfae/produtor/emitir/resumo"

    def __init__(self) -> None:
        self.status = StatusFalso("AUTORIZADA")
        self.rejeitada = StatusFalso(None)

    def locator(self, seletor: str) -> StatusFalso:
        assert seletor == "span.autorizada"
        return self.status

    def get_by_text(self, _padrao, *, exact: bool) -> StatusFalso:
        assert exact is True
        return self.rejeitada


def test_aguarda_status_autorizada_confirmado_em_homologacao():
    pagina = PaginaAutorizadaFalsa()

    asyncio.run(
        aguardar_autorizacao(
            pagina,
            _tarefa_fake("T1"),
            _logger_silencioso(),
            ambiente="teste",
        )
    )

    assert pagina.status.aguardado is True


def test_aguarda_status_autorizada_confirmado_em_producao():
    pagina = PaginaAutorizadaFalsa()
    pagina.url = "https://nfae.fazenda.pr.gov.br/nfae/produtor/emitir/resumo"

    asyncio.run(
        aguardar_autorizacao(
            pagina,
            _tarefa_fake("T1"),
            _logger_silencioso(),
            ambiente="normal",
        )
    )

    assert pagina.status.aguardado is True


class PaginaRejeitadaFalsa(PaginaAutorizadaFalsa):
    def __init__(self) -> None:
        self.status = StatusFalso(None)
        self.rejeitada = StatusFalso("REJEITADA")


def test_resultado_rejeitado_nao_e_tratado_como_autorizado():
    pagina = PaginaRejeitadaFalsa()

    with pytest.raises(FalhaConfirmacaoEmissao, match="REJEITADA"):
        asyncio.run(
            aguardar_autorizacao(
                pagina,
                _tarefa_fake("T1"),
                _logger_silencioso(),
                ambiente="teste",
            )
        )


class BotaoAvancarFalso:
    def __init__(
        self,
        *,
        visivel: bool = True,
        habilitado: bool = True,
        profundidade_contexto: int | None = None,
        falhas_click: int = 0,
        ao_clicar=None,
    ) -> None:
        self.visivel = visivel
        self.habilitado = habilitado
        self.clicado = False
        self.profundidade_contexto = profundidade_contexto
        self.falhas_click = falhas_click
        self.ao_clicar = ao_clicar
        self.tentativas = 0

    async def is_visible(self) -> bool:
        return self.visivel

    async def is_enabled(self) -> bool:
        return self.habilitado

    async def click(self) -> None:
        self.tentativas += 1
        if self.falhas_click:
            self.falhas_click -= 1
            if self.ao_clicar:
                self.ao_clicar()
            raise PlaywrightTimeoutError("portal em re-renderização")
        self.clicado = True
        if self.ao_clicar:
            self.ao_clicar()

    async def evaluate(self, _expressao, _termos):
        return self.profundidade_contexto


class ColecaoBotoesFalsa:
    def __init__(self, botoes: list[BotaoAvancarFalso]) -> None:
        self.botoes = botoes

    async def count(self) -> int:
        return len(self.botoes)

    def nth(self, indice: int) -> BotaoAvancarFalso:
        return self.botoes[indice]


class PaginaSequenciaFalsa:
    def __init__(self, botoes: list[BotaoAvancarFalso]) -> None:
        self.colecao = ColecaoBotoesFalsa(botoes)

    def get_by_role(self, papel: str, *, name: str):
        assert papel == "button"
        assert name == "Avançar"
        return self.colecao


class AncoraRetiradaFalsa:
    first: "AncoraRetiradaFalsa"

    def __init__(self, pagina) -> None:
        self.first = self
        self.pagina = pagina

    async def wait_for(self, *, state: str, timeout: int) -> None:
        assert state == "visible"
        assert timeout in {10_000, 15_000}
        if not self.pagina.retirada_visivel:
            raise PlaywrightTimeoutError("retirada ainda não apareceu")


class PaginaOperacaoFalsa(PaginaSequenciaFalsa):
    def __init__(self, botao: BotaoAvancarFalso) -> None:
        super().__init__([botao])
        self.retirada_visivel = False
        self.ancora_retirada = AncoraRetiradaFalsa(self)

    def get_by_text(self, _padrao):
        return self.ancora_retirada


class SelectEmitenteFalso:
    def __init__(self, eventos: list[object]) -> None:
        self.eventos = eventos

    async def select_option(self, *, value: str) -> None:
        self.eventos.append(("selecionar", value))


class AncoraDestinatarioFalsa:
    first: "AncoraDestinatarioFalsa"

    def __init__(self, eventos: list[object]) -> None:
        self.first = self
        self.eventos = eventos

    async def wait_for(self, *, state: str, timeout: int) -> None:
        self.eventos.append(("aguardar_destinatario", state, timeout))


class PaginaSelecaoEmitenteFalsa(PaginaSequenciaFalsa):
    def __init__(self) -> None:
        self.eventos: list[object] = []
        super().__init__([BotaoAvancarFalso()])
        self.select = SelectEmitenteFalso(self.eventos)
        self.ancora_destinatario = AncoraDestinatarioFalsa(self.eventos)

    def locator(self, seletor: str):
        assert seletor == "#div-identificacao select"
        return self.select

    async def wait_for_load_state(self, estado: str, *, timeout: int) -> None:
        self.eventos.append(("rede", estado, timeout))

    async def wait_for_timeout(self, timeout: int) -> None:
        self.eventos.append(("estabilizar", timeout))

    def get_by_text(self, texto: str, *, exact: bool):
        assert texto == "CNPJ"
        assert exact is True
        return self.ancora_destinatario


def test_selecionar_emitente_estabiliza_spa_e_confirma_destinatario() -> None:
    pagina = PaginaSelecaoEmitenteFalsa()

    asyncio.run(
        selecionar_emitente(
            pagina,
            Emitente(valor_select="emitente-1"),
            _logger_silencioso(),
        )
    )

    assert pagina.eventos == [
        ("selecionar", "emitente-1"),
        ("rede", "networkidle", 5000),
        ("estabilizar", 3000),
        ("aguardar_destinatario", "visible", 10000),
    ]
    assert pagina.colecao.botoes[0].clicado is True


def test_avancar_por_contexto_escolhe_o_ancestral_mais_proximo():
    antigo = BotaoAvancarFalso(profundidade_contexto=8)
    atual = BotaoAvancarFalso(profundidade_contexto=2)
    pagina = PaginaSequenciaFalsa([antigo, atual])

    asyncio.run(
        clicar_avancar_por_contexto(
            pagina,
            ("local de retirada",),
            _logger_silencioso(),
        )
    )

    assert antigo.clicado is False
    assert atual.clicado is True


def test_timeout_do_click_com_etapa_seguinte_visivel_nao_repete() -> None:
    pagina = None

    def mostrar_retirada() -> None:
        pagina.retirada_visivel = True

    botao = BotaoAvancarFalso(
        profundidade_contexto=2,
        falhas_click=1,
        ao_clicar=mostrar_retirada,
    )
    pagina = PaginaOperacaoFalsa(botao)

    asyncio.run(avancar_identificacao_operacao(pagina, _logger_silencioso()))

    assert botao.tentativas == 1


def test_timeout_sem_transicao_falha_sem_repetir_click() -> None:
    botao = BotaoAvancarFalso(profundidade_contexto=2, falhas_click=1)
    pagina = PaginaOperacaoFalsa(botao)

    with pytest.raises(RuntimeError, match="não foi repetido"):
        asyncio.run(avancar_identificacao_operacao(pagina, _logger_silencioso()))

    assert botao.tentativas == 1


def test_click_concluido_sem_etapa_seguinte_e_falha_transitoria() -> None:
    botao = BotaoAvancarFalso(profundidade_contexto=2)
    pagina = PaginaOperacaoFalsa(botao)

    with pytest.raises(FalhaTransitoriaPortal, match="não abriu a etapa de retirada"):
        asyncio.run(avancar_identificacao_operacao(pagina, _logger_silencioso()))

    assert botao.tentativas == 1


@pytest.mark.parametrize(
    ("valor", "casas", "esperado"),
    [(2.0, 3, "2"), (2.5, 3, "2,5"), (10.25, 2, "10,25"), (0.1, 2, "0,1")],
)
def test_formata_decimal_sem_ponto_zero_interpretado_pela_mascara(
    valor: float,
    casas: int,
    esperado: str,
) -> None:
    assert _formatar_decimal_portal(valor, casas) == esperado


class CampoDecimalFalso:
    def __init__(self, valor_final: str) -> None:
        self.valor_final = valor_final
        self.eventos: list[object] = []

    async def click(self) -> None:
        self.eventos.append("click")

    async def press(self, tecla: str) -> None:
        self.eventos.append(tecla)

    async def input_value(self) -> str:
        return self.valor_final


class TecladoDecimalFalso:
    def __init__(self, eventos: list[object]) -> None:
        self.eventos = eventos

    async def insert_text(self, texto: str) -> None:
        self.eventos.append(("insert_text", texto))


class PaginaDecimalFalsa:
    def __init__(self, eventos: list[object]) -> None:
        self.keyboard = TecladoDecimalFalso(eventos)


def test_decimal_e_digitado_como_humano_e_confirmado_apos_blur() -> None:
    campo = CampoDecimalFalso("10,25")
    pagina = PaginaDecimalFalsa(campo.eventos)

    asyncio.run(
        _preencher_decimal_portal(
            pagina, campo, 10.25, casas=2, nome_campo="o valor unitário"
        )
    )

    assert campo.eventos == [
        "click",
        "Control+A",
        ("insert_text", "10,25"),
        "Tab",
    ]


def test_decimal_divergente_bloqueia_antes_de_avancar() -> None:
    campo = CampoDecimalFalso("100,00")
    pagina = PaginaDecimalFalsa(campo.eventos)

    with pytest.raises(ValorFiscalDivergente, match="parou antes de avançar"):
        asyncio.run(
            _preencher_decimal_portal(
                pagina, campo, 10.0, casas=2, nome_campo="o valor unitário"
            )
        )

def test_avancar_por_contexto_recusa_empate():
    pagina = PaginaSequenciaFalsa([
        BotaoAvancarFalso(profundidade_contexto=2),
        BotaoAvancarFalso(profundidade_contexto=2),
    ])

    with pytest.raises(RuntimeError, match="mais de um botão"):
        asyncio.run(
            clicar_avancar_por_contexto(
                pagina,
                ("local de retirada",),
                _logger_silencioso(),
            )
        )


def test_avancar_produto_clica_no_ultimo_botao_da_subetapa_ativa():
    anterior = BotaoAvancarFalso()
    atual = BotaoAvancarFalso()
    pagina = PaginaSequenciaFalsa([anterior, atual])

    asyncio.run(clicar_avancar_produto(pagina, _logger_silencioso()))

    assert anterior.clicado is False
    assert atual.clicado is True


def test_avancar_produto_recusa_ausencia_de_botao_seguro():
    pagina = PaginaSequenciaFalsa([BotaoAvancarFalso(visivel=False)])

    with pytest.raises(RuntimeError, match="Nenhum botão 'Avançar'"):
        asyncio.run(clicar_avancar_produto(pagina, _logger_silencioso()))


class SituacaoTributariaLentaFalsa:
    def __init__(self, falhas: int) -> None:
        self.falhas = falhas
        self.esperas: list[tuple[str, int]] = []

    async def wait_for(self, *, state: str, timeout: int) -> None:
        self.esperas.append((state, timeout))
        if self.falhas:
            self.falhas -= 1
            raise PlaywrightTimeoutError("portal ainda não apresentou o ICMS")


def test_icms_apos_produto_mantem_caminho_rapido_de_dez_segundos():
    situacao = SituacaoTributariaLentaFalsa(falhas=0)

    asyncio.run(aguardar_icms_apos_produto(situacao, _logger_silencioso()))

    assert situacao.esperas == [("visible", 10_000)]


def test_icms_apos_produto_tolera_vinte_segundos_adicionais_sem_novo_clique():
    situacao = SituacaoTributariaLentaFalsa(falhas=1)

    asyncio.run(aguardar_icms_apos_produto(situacao, _logger_silencioso()))

    assert situacao.esperas == [
        ("visible", 10_000),
        ("visible", 20_000),
    ]


def test_icms_apos_produto_propaga_timeout_depois_de_trinta_segundos():
    situacao = SituacaoTributariaLentaFalsa(falhas=2)

    with pytest.raises(PlaywrightTimeoutError):
        asyncio.run(aguardar_icms_apos_produto(situacao, _logger_silencioso()))

    assert situacao.esperas == [
        ("visible", 10_000),
        ("visible", 20_000),
    ]
