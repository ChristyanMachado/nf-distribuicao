"""
RF13 — autenticação e navegação no sistema fiscal.

Versão Async do Playwright.

A autenticação é executada dentro de um BrowserContext independente
por tarefa, permitindo que múltiplos emitentes sejam autenticados
simultaneamente sem compartilhar cookies, localStorage ou sessão.

Nesta etapa estamos validando somente:
    Login -> confirmação de login

A navegação até a emissão permanece implementada aqui, mas será
testada separadamente após a autenticação estar validada.
"""

from __future__ import annotations

import logging
import re
from typing import Literal
from urllib.parse import urlsplit

from playwright.async_api import (
    Page,
    TimeoutError as PlaywrightTimeoutError,
)

from .config import CredencialCliente


URL_LOGIN = "https://receita.pr.gov.br/login"

SELETOR_CAMPO_USUARIO = "#cpfusuario"

# Confirmado no reconhecimento manual:
# elemento presente somente após login bem-sucedido.
SELETOR_POS_LOGIN = "#icons"

# Confirmado no teste ao vivo: checkbox apresentado ao chegar na emissão.
# O mesmo seletor vale pros dois ambientes (normal e teste) — a tela de
# consentimento é idêntica nos dois.
SELETOR_POS_NAVEGACAO_EMISSAO = "#div-consentimento input[type=checkbox]"
URL_EMISSAO = re.compile(r"^https://nfae\.fazenda\.pr\.gov\.br/nfae/produtor/emitir/")

# ---------------------------------------------------------------------------
# Ambiente de TESTE (homologação) — "NFP-e TESTES" da Receita PR.
#
# Adicionado em 21/08: as tentativas de desenvolvimento no ambiente normal
# ficam registradas no histórico fiscal do governo mesmo sem finalizar a
# emissão. Esse ambiente de homologação existe justamente pra evitar isso
# durante o desenvolvimento — mesmo fluxo de tela, sem valor fiscal.
# ---------------------------------------------------------------------------

AmbienteEmissao = Literal["normal", "teste"]

# Confirmado no reconhecimento de 21/08 (menu lateral, após "NFP-e").
SELETOR_MENU_NFPE_TESTES = "#menulateral412 > div:nth-child(4) > a"
# Confirmado — "Emissão - TESTE" dentro do submenu NFP-e TESTES.
SELETOR_MENU_EMISSAO_TESTE = "#menuLink1131"
# Domínio de homologação é diferente do de produção (nfae.fazenda.pr.gov.br
# -> homologacao.nfae.fazenda.pr.gov.br). Credenciais e dados fiscais nunca
# devem trafegar em HTTP; um downgrade agora falha de modo fechado.
URL_EMISSAO_TESTE = re.compile(
    r"^https://homologacao\.nfae\.fazenda\.pr\.gov\.br/nfae/produtor/emitir/"
)

# Consulta histórica reconhecida em 01/09/2026. O HTML do portal anuncia o
# link com ``http://``; o Worker não segue esse primeiro salto inseguro. Após
# abrir os submenus necessários, ele acessa diretamente a mesma rota em HTTPS.
SELETOR_MENU_CONSULTA_TESTE = "#menuLink1132"
URL_CONSULTA_TESTE_TEXTO = (
    "https://homologacao.nfae.fazenda.pr.gov.br/nfae/produtor/consulta"
)
URL_CONSULTA_TESTE = re.compile(
    r"^https://homologacao\.nfae\.fazenda\.pr\.gov\.br/nfae/produtor/consulta/?(?:[?#].*)?$"
)
SELETOR_POS_NAVEGACAO_CONSULTA = "article select.slds-select"


class FalhaAutenticacao(Exception):
    """Levantada quando o login não é confirmado dentro do timeout."""


class FalhaIdentidadeAutenticada(Exception):
    """Levantada quando a área autenticada não exibe a identidade esperada."""


class FalhaNavegacaoEmissao(Exception):
    """Levantada quando a tela de emissão não é confirmada após a navegação."""


class FalhaNavegacaoConsulta(Exception):
    """Levantada quando a consulta de homologação não é confirmada."""


def _pagina_login_permanece_oficial(valor: str) -> bool:
    """Confere a origem final antes de inserir qualquer credencial.

    A URL inicial já é validada pela configuração, mas uma resposta HTTP pode
    redirecionar a Page. Conferir novamente depois de ``goto`` evita entregar
    CPF/senha a um host adulterado por DNS, proxy ou mudança inesperada no
    portal. A consulta e o caminho podem mudar legitimamente; a origem não.
    """

    try:
        url = urlsplit(valor)
        porta = url.port
    except (TypeError, ValueError):
        return False

    return (
        url.scheme == "https"
        and url.hostname == "receita.pr.gov.br"
        and porta in {None, 443}
        and url.username is None
        and url.password is None
    )


async def validar_identidade_autenticada(
    page: Page,
    credencial: CredencialCliente,
    logger: logging.Logger,
) -> None:
    """Confirma a identidade pós-login sem expor o texto esperado nos logs.

    ``CLIENTE_X_IDENTIDADE_ESPERADA`` deve conter um texto que o portal exibe
    na área autenticada, como o nome do emitente. A validação é opcional
    durante a transição: quando a variável não está definida, o login segue,
    mas o log deixa claro que a identidade não foi comprovada.
    """

    identidade_esperada = credencial.identidade_esperada
    if not identidade_esperada:
        logger.warning(
            "[%s] Identidade pós-login não validada: "
            "configure %s_IDENTIDADE_ESPERADA no .env.",
            credencial.cliente_id,
            credencial.cliente_id,
        )
        return

    try:
        await page.get_by_text(identidade_esperada, exact=False).wait_for(
            state="visible",
            timeout=10000,
        )
    except PlaywrightTimeoutError as exc:
        raise FalhaIdentidadeAutenticada(
            f"[{credencial.cliente_id}] A área autenticada não exibiu a "
            "identidade configurada. Verifique a credencial, o texto "
            "esperado no .env ou a interface do portal."
        ) from exc

    logger.info("[%s] Identidade pós-login confirmada", credencial.cliente_id)


async def realizar_login(
    page: Page,
    url_base: str,
    credencial: CredencialCliente,
    logger: logging.Logger,
) -> None:
    """
    Realiza a autenticação no sistema fiscal.

    A função recebe uma Page pertencente exclusivamente ao contexto
    do emitente/tarefa atual.
    """

    logger.info(
        "[%s] Abrindo %s",
        credencial.cliente_id,
        url_base,
    )

    await page.goto(
        url_base,
        wait_until="domcontentloaded",
    )

    # Defesa em profundidade: ``url_base`` pode estar correto e ainda assim
    # a navegação terminar em outra origem por redirecionamento. Não registrar
    # a URL final, pois query strings também podem carregar identificadores.
    if not _pagina_login_permanece_oficial(page.url):
        raise FalhaAutenticacao(
            f"[{credencial.cliente_id}] A página de login saiu da origem "
            "HTTPS oficial da Receita/PR. Credenciais não foram preenchidas."
        )

    logger.info(
        "[%s] Preenchendo credenciais",
        credencial.cliente_id,
    )

    # RNF02: se o Playwright falhar exatamente nestas duas linhas (elemento
    # sumiu, timeout etc.), a mensagem de erro do Playwright pode, em
    # algumas versões, ecoar o valor que estava sendo digitado no log de
    # chamadas. Por isso o try/except abaixo troca a exceção por uma
    # mensagem própria, sem encadear a original (`from None`) e sem nunca
    # formatar `str(exc)` — CPF e senha nunca chegam a este ponto do log.
    try:
        await page.locator(SELETOR_CAMPO_USUARIO).fill(credencial.login)
    except Exception:
        raise FalhaAutenticacao(
            f"[{credencial.cliente_id}] Falha ao preencher o campo de usuário "
            f"({SELETOR_CAMPO_USUARIO}) — elemento não encontrado ou timeout."
        ) from None

    try:
        await page.get_by_placeholder("Senha").fill(credencial.senha)
    except Exception:
        raise FalhaAutenticacao(
            f"[{credencial.cliente_id}] Falha ao preencher o campo de senha "
            "— elemento não encontrado ou timeout."
        ) from None

    await page.get_by_role(
        "button",
        name="Login",
    ).click()

    logger.info(
        "[%s] Aguardando confirmação de login",
        credencial.cliente_id,
    )

    try:
        await page.wait_for_selector(
            SELETOR_POS_LOGIN,
            timeout=15000,
        )

    except PlaywrightTimeoutError as exc:
        raise FalhaAutenticacao(
            f"[{credencial.cliente_id}] "
            "Login não confirmado em 15s — "
            "usuário/senha incorretos ou o site mudou o "
            f"elemento pós-login ({SELETOR_POS_LOGIN})."
        ) from exc

    logger.info(
        "[%s] Login confirmado",
        credencial.cliente_id,
    )

    await validar_identidade_autenticada(page, credencial, logger)


async def navegar_ate_emissao(
    page: Page,
    logger: logging.Logger,
    ambiente: AmbienteEmissao = "teste",
) -> None:
    """
    RF13 — passo 3.

    Caminho (normal):
        Login -> Produtor Rural -> NFP-e -> Emissão

    Caminho (teste/homologação, 21/08):
        Login -> Produtor Rural -> NFP-e -> NFP-e TESTES -> Emissão - TESTE

    Os dois primeiros cliques (Produtor Rural, NFP-e) são idênticos nos
    dois ambientes — só o que vem depois de "NFP-e" muda. O parâmetro
    `ambiente` decide qual caminho seguir; o padrão é "teste" para impedir
    que um teste de desenvolvimento acesse produção por acidente.
    """

    logger.info("Navegando: Produtor Rural -> NFP-e -> %s", "Emissão" if ambiente == "normal" else "NFP-e TESTES -> Emissão - TESTE")

    # Confirmado no teste ao vivo em 19/08. Localizar pelo papel e texto é
    # mais resistente que a posição estrutural ``a:nth-child(44)``.
    logger.info("Navegação: abrindo menu Produtor Rural")
    await page.get_by_role(
        "link",
        name="Produtor Rural",
        exact=True,
    ).click()

    logger.info("Navegação: abrindo NFP-e")
    await page.get_by_role("link", name="NFP-e", exact=True).click()

    if ambiente == "teste":
        # ⚠️ Log alto de propósito (WARNING, não INFO) — precisa ficar
        # óbvio em qualquer leitura de log que esta execução não usou o
        # sistema fiscal de produção.
        logger.warning(
            "AMBIENTE DE TESTE (NFP-e TESTES / homologação) — nenhuma "
            "operação real será registrada no histórico fiscal."
        )
        logger.info("Navegação: abrindo submenu NFP-e TESTES")
        await page.locator(SELETOR_MENU_NFPE_TESTES).click()

        logger.info("Navegação: abrindo Emissão - TESTE")
        await page.locator(SELETOR_MENU_EMISSAO_TESTE).click()

        url_esperada = URL_EMISSAO_TESTE
    else:
        logger.info("Navegação: abrindo Emissão")
        await page.locator("#menuLink1119").click()

        url_esperada = URL_EMISSAO

    try:
        await page.wait_for_url(
            url_esperada,
            wait_until="domcontentloaded",
            timeout=30000,
        )
        await page.wait_for_selector(
            SELETOR_POS_NAVEGACAO_EMISSAO,
            state="visible",
            timeout=30000,
        )
    except PlaywrightTimeoutError as exc:
        raise FalhaNavegacaoEmissao(
            f"A tela de emissão (ambiente={ambiente}) não foi confirmada em "
            "30s após a navegação. Verifique os seletores de menu ou o "
            "seletor pós-navegação."
        ) from exc

    logger.info("Área de emissão carregada (ambiente=%s)", ambiente)


async def navegar_ate_consulta_teste(
    page: Page,
    logger: logging.Logger,
) -> None:
    """Abre a consulta histórica exclusivamente na homologação NFP-e.

    A consulta de produção ainda não foi reconhecida e, portanto, não existe
    parâmetro para ativá-la por engano. O acesso final é feito diretamente em
    HTTPS porque o ``href`` observado no portal usa HTTP.
    """

    logger.info(
        "Navegando: Produtor Rural -> NFP-e -> NFP-e TESTES -> Consulta - TESTE"
    )
    await page.get_by_role("link", name="Produtor Rural", exact=True).click()
    await page.get_by_role("link", name="NFP-e", exact=True).click()
    await page.locator(SELETOR_MENU_NFPE_TESTES).click()

    link_consulta = page.locator(SELETOR_MENU_CONSULTA_TESTE)
    await link_consulta.wait_for(state="visible", timeout=30_000)
    href = await link_consulta.get_attribute("href")
    if href is None or not re.match(
        r"^https?://homologacao\.nfae\.fazenda\.pr\.gov\.br/nfae/produtor/consulta/?$",
        href,
    ):
        raise FalhaNavegacaoConsulta(
            "O link de consulta de homologação mudou ou não pertence à Receita PR."
        )

    try:
        await page.goto(URL_CONSULTA_TESTE_TEXTO, wait_until="domcontentloaded")
        await page.wait_for_url(
            URL_CONSULTA_TESTE,
            wait_until="domcontentloaded",
            timeout=30_000,
        )
        await page.wait_for_selector(
            SELETOR_POS_NAVEGACAO_CONSULTA,
            state="visible",
            timeout=30_000,
        )
    except PlaywrightTimeoutError as exc:
        raise FalhaNavegacaoConsulta(
            "A consulta NFP-e TESTE não foi confirmada em 30s. "
            "O portal pode estar indisponível ou ter mudado a tela."
        ) from exc

    logger.warning(
        "CONSULTA EM AMBIENTE DE TESTE confirmada; nenhuma emissão será iniciada."
    )
