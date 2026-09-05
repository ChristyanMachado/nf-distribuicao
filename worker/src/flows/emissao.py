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

import asyncio
import json
import logging
import os
import re
import unicodedata
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from datetime import datetime, timezone
from dataclasses import dataclass, field
from urllib.parse import urlsplit
from xml.etree import ElementTree

from playwright.async_api import Locator, Page, TimeoutError as PlaywrightTimeoutError

class DadosFiscaisIncompletos(Exception):
    """
    Levantada quando falta um DADO (não um seletor) necessário para
    preencher um campo fiscal com segurança. Nunca deve ser contornada
    inventando o valor — a correção é obter o dado real e completar o
    cadastro do produto/tarefa.
    """


class EmissaoBloqueada(RuntimeError):
    """A trava de homologação impediu o clique fiscal."""


class FalhaConfirmacaoEmissao(RuntimeError):
    """A Receita não exibiu a confirmação de autorização esperada."""


class AcessoPortalNegado(RuntimeError):
    """O portal recusou o módulo seguinte antes de iniciar a emissão."""


class ValorFiscalDivergente(RuntimeError):
    """O campo mascarado exibiu um número diferente do contrato da tarefa."""


def _formatar_decimal_portal(valor: float, casas: int) -> str:
    """Formata sem o ``.0`` que a máscara da NFP-e interpreta como dígito.

    A aplicação fiscal usa vírgula decimal e aplica a máscara a cada tecla.
    Enviar ``str(2.0)`` podia virar 20; quantidade e preço ampliados juntos
    multiplicavam o total por 100. O texto abaixo imita a digitação humana.
    """

    decimal = Decimal(str(valor))
    escala = Decimal(1).scaleb(-casas)
    normalizado = decimal.quantize(escala, rounding=ROUND_HALF_UP)
    texto = format(normalizado, "f").rstrip("0").rstrip(".")
    return (texto or "0").replace(".", ",")


def _ler_decimal_portal(texto: str) -> Decimal:
    """Interpreta o valor visível sem aceitar conteúdo inesperado da página."""

    limpo = texto.strip().replace("\u00a0", "").replace(" ", "")
    if not re.fullmatch(r"-?\d+(?:[.,]\d+)?", limpo):
        raise ValorFiscalDivergente(
            "A Receita exibiu um formato numérico inesperado no produto."
        )
    try:
        return Decimal(limpo.replace(",", "."))
    except InvalidOperation as exc:
        raise ValorFiscalDivergente(
            "A Receita não confirmou o número preenchido no produto."
        ) from exc


async def _preencher_decimal_portal(
    page: Page,
    campo: Locator,
    valor: float,
    *,
    casas: int,
    nome_campo: str,
) -> None:
    """Cola como usuário e confirma o número após a máscara e o blur.

    A SPA posiciona inicialmente o cursor antes do zero e, logo depois do
    clique, move-o para o fim. Digitar antes dessa reação preserva o zero e
    amplia o valor. Esperamos o campo estabilizar, selecionamos tudo e usamos
    ``insert_text`` em um único evento, equivalente ao comportamento observado
    com Ctrl+V, sem acessar o clipboard do sistema operacional.
    """

    texto = _formatar_decimal_portal(valor, casas)
    esperado = Decimal(str(valor)).quantize(
        Decimal(1).scaleb(-casas),
        rounding=ROUND_HALF_UP,
    )
    await campo.click()
    # O portal reposiciona o cursor de forma assíncrona depois do foco. Uma
    # pausa curta e localizada evita disputar essa reação sem desacelerar as
    # demais etapas do formulário.
    await asyncio.sleep(0.35)
    await campo.press("Control+A")
    await page.keyboard.insert_text(texto)
    await campo.press("Tab")
    await asyncio.sleep(0.15)
    observado = _ler_decimal_portal(await campo.input_value()).quantize(
        Decimal(1).scaleb(-casas),
        rounding=ROUND_HALF_UP,
    )
    if observado != esperado:
        raise ValorFiscalDivergente(
            f"A Receita alterou {nome_campo}; o Worker parou antes de avançar."
        )


@dataclass(frozen=True)
class MetadadosDocumentoFiscal:
    chave_acesso: str
    numero: str
    protocolo: str
    codigo_status: str


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
    # Nome operacional do mercado, quando o contrato Web o fornecer. No JSON
    # local ele é opcional e a razão social continua sendo o fallback seguro.
    nome_cliente: str | None = None
    # Nome do emissor para desambiguar notas do mesmo cliente emitidas por
    # empresas diferentes. No teste local o value do select é o fallback.
    nome_emitente: str | None = None
    # Número sequencial do lote/distribuição. Só será definitivo quando vier
    # do banco; tarefa_real.json pode omiti-lo durante a fase local.
    numero_distribuicao: int | None = None
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
    _validar_metadados_arquivo(campos_restantes)

    return Tarefa(
        emitente=emitente,
        destinatario=destinatario,
        itens=itens,
        **campos_restantes,
    )


def _validar_metadados_arquivo(campos: dict[str, object]) -> None:
    """Valida somente os metadados usados para nomear artefatos locais."""
    nome_cliente = campos.get("nome_cliente")
    if nome_cliente is not None:
        if not isinstance(nome_cliente, str) or not nome_cliente.strip() or len(nome_cliente.strip()) > 160:
            raise ValueError("nome_cliente deve ser um texto preenchido de até 160 caracteres.")
        campos["nome_cliente"] = nome_cliente.strip()

    nome_emitente = campos.get("nome_emitente")
    if nome_emitente is not None:
        if not isinstance(nome_emitente, str) or not nome_emitente.strip() or len(nome_emitente.strip()) > 160:
            raise ValueError("nome_emitente deve ser um texto preenchido de até 160 caracteres.")
        campos["nome_emitente"] = nome_emitente.strip()

    numero_distribuicao = campos.get("numero_distribuicao")
    if numero_distribuicao is not None:
        if (
            isinstance(numero_distribuicao, bool)
            or not isinstance(numero_distribuicao, int)
            or not 1 <= numero_distribuicao <= 1_000_000_000
        ):
            raise ValueError("numero_distribuicao deve ser um inteiro positivo válido.")


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

    logger.info("Avançar clicado")


async def clicar_avancar_por_contexto(
    page: Page,
    termos_contexto: tuple[str, ...],
    logger: logging.Logger,
) -> None:
    """Seleciona o Avançar cujo ancestral mais próximo contém a etapa.

    Só retornamos distâncias na árvore DOM; nenhum texto da página ou dado
    fiscal é registrado. A seleção falha fechada se dois botões tiverem a mesma
    proximidade, em vez de clicar por tentativa.
    """
    botoes = page.get_by_role("button", name="Avançar")
    candidatos = []
    termos = [
        unicodedata.normalize("NFKD", termo)
        .encode("ascii", "ignore")
        .decode("ascii")
        .lower()
        for termo in termos_contexto
    ]
    for indice in range(await botoes.count()):
        botao = botoes.nth(indice)
        if not await botao.is_visible() or not await botao.is_enabled():
            continue
        profundidade = await botao.evaluate(
            """(elemento, termos) => {
                let atual = elemento.parentElement;
                for (let nivel = 1; atual && nivel <= 12; nivel += 1) {
                    const texto = (atual.textContent || "")
                        .normalize("NFD")
                        .replace(/[\u0300-\u036f]/g, "")
                        .toLowerCase();
                    if (termos.some((termo) => texto.includes(termo))) return nivel;
                    atual = atual.parentElement;
                }
                return null;
            }""",
            termos,
        )
        if profundidade is not None:
            candidatos.append((int(profundidade), botao))

    if not candidatos:
        raise RuntimeError("Nenhum botão Avançar pertence à etapa esperada.")
    menor_profundidade = min(profundidade for profundidade, _ in candidatos)
    melhores = [
        botao
        for profundidade, botao in candidatos
        if profundidade == menor_profundidade
    ]
    logger.info(
        "Candidatos Avançar no contexto esperado: %d (melhores: %d)",
        len(candidatos),
        len(melhores),
    )
    if len(melhores) != 1:
        raise RuntimeError("A etapa apresentou mais de um botão Avançar equivalente.")
    await melhores[0].click()
    logger.info("Avançar identificado pelo contexto da etapa clicado")


async def clicar_avancar_apos_texto(
    page: Page,
    padrao_texto: re.Pattern[str],
    logger: logging.Logger,
) -> None:
    """Resolve o botão posterior à única âncora visível da etapa."""
    ancoras = page.get_by_text(padrao_texto)
    visiveis = []
    for indice in range(await ancoras.count()):
        ancora = ancoras.nth(indice)
        if await ancora.is_visible():
            visiveis.append(ancora)

    logger.info(
        "Âncoras visíveis da etapa: %d",
        len(visiveis),
    )
    if len(visiveis) != 1:
        raise RuntimeError("A etapa não apresentou uma âncora visível única.")
    botao = visiveis[0].locator(
        "xpath=following::button[normalize-space()='Avançar'][1]"
    )
    if (
        await botao.count() != 1
        or not await botao.is_visible()
        or not await botao.is_enabled()
    ):
        raise RuntimeError("A âncora da etapa não identificou um Avançar seguro.")
    await botao.click()
    logger.info("Avançar posterior à âncora da etapa clicado")

async def clicar_avancar_produto(
    page: Page,
    logger: logging.Logger
) -> None:
    """Avança na subetapa de produto mais recente preservada pela SPA.

    Este é o comportamento preexistente do fluxo: o último candidato visível e
    habilitado corresponde à subetapa ativa de Produto/ICMS.
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

    await candidatos[-1].click()
    logger.info("Avançar da etapa de produtos clicado")


async def aceitar_consentimento(page: Page, logger: logging.Logger) -> None:
    logger.info("Aceitando consentimento inicial")
    # Confirmado via reconhecimento ao vivo 20/08.
    await page.locator("#div-consentimento input[type=checkbox]").check()


async def selecionar_emitente(page: Page, emitente: Emitente, logger: logging.Logger) -> None:
    logger.info("Selecionando emitente configurado para a tarefa")
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
    logger.info("Preenchendo destinatário da tarefa")

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

    logger.info("CEP preenchido; aguardando dados automáticos do endereço")

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

    except PlaywrightTimeoutError:
        logger.info("Loading do CEP não chegou a ser observado")
    else:
        try:
            await loading.wait_for(state="hidden", timeout=15000)
        except PlaywrightTimeoutError as exc:
            raise RuntimeError("A consulta de CEP permaneceu carregando além do limite seguro.") from exc
        logger.info("Loading do CEP desapareceu")

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

    logger.info("Número do endereço preenchido")

    # Confirma explicitamente que o valor ainda está no campo.
    valor_numero = await numero.input_value()

    logger.info("Número do endereço confirmado antes de avançar")

    if valor_numero != str(destinatario.numero_endereco):
        raise RuntimeError(
            "O número do endereço desapareceu ou foi alterado antes do Avançar."
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
    logger.info("Preenchendo identificação da operação")

    # Confirmado: #combobox-id-1 é a Natureza da operação (campo de texto
    # com listbox, não um <select> comum).
    await selecionar_combobox_por_texto(page, "#combobox-id-1", tarefa.natureza_operacao, logger)

    # Confirmado no reconhecimento ao vivo 20/08 — os três abaixo já são
    # <select> comuns de verdade (não comboboxes SLDS), com value/texto de
    # opção confirmados em TIPO_OPERACAO_OPCOES / FINALIDADE_EMISSAO_OPCOES /
    # INDICADOR_PRESENCA_OPCOES.
    logger.info("Tipo de operação selecionado")
    await _selecionar_select_por_opcao_ancora(
        page, _ANCORA_TIPO_OPERACAO, TIPO_OPERACAO_OPCOES[tarefa.tipo_operacao], logger
    )

    logger.info("Finalidade da emissão selecionada")
    await _selecionar_select_por_opcao_ancora(
        page, _ANCORA_FINALIDADE_EMISSAO, FINALIDADE_EMISSAO_OPCOES[tarefa.finalidade_emissao], logger
    )

    logger.info("Indicador de presença selecionado")
    await _selecionar_select_por_opcao_ancora(
        page, _ANCORA_INDICADOR_PRESENCA, INDICADOR_PRESENCA_OPCOES[tarefa.indicador_presenca], logger
    )

    await clicar_avancar_por_contexto(
        page,
        ("identificação da operação", "natureza da operação"),
        logger,
    )


async def avancar_local_retirada(page: Page, logger: logging.Logger) -> None:
    """Avança e confirma que a etapa de produtos realmente foi aberta.

    O portal mantém botões homônimos de etapas anteriores. O botão correto é
    localizado pelo contexto textual do próprio bloco e a transição só é aceita
    quando o campo exclusivo de produto fica visível.
    """
    logger.info("Local de retirada/entrega: mantendo padrão do sistema")
    primeira_pergunta = page.get_by_text(
        re.compile(r"Local de Retirada diferente do Emitente", re.IGNORECASE)
    )
    await primeira_pergunta.first.wait_for(state="visible", timeout=10000)

    for pergunta in (
        r"Local de Retirada diferente do Emitente",
        r"Local de Entrega diferente do Destinatário",
    ):
        ancoras = page.get_by_text(re.compile(pergunta, re.IGNORECASE))
        visiveis = []
        for indice in range(await ancoras.count()):
            ancora = ancoras.nth(indice)
            if await ancora.is_visible():
                visiveis.append(ancora)
        if len(visiveis) != 1:
            raise RuntimeError("A pergunta esperada de retirada/entrega não é única.")
        ancora = visiveis[0]
        radio = ancora.locator(
            "xpath=following::input[@type='radio' and @value='false'][1]"
        )
        if await radio.count() != 1:
            raise RuntimeError("A opção padrão da etapa não foi localizada.")
        await radio.check(force=True)
        if not await radio.is_checked():
            raise RuntimeError("O portal não confirmou uma opção padrão da etapa.")
    logger.info("Retirada e entrega padrão confirmadas explicitamente")

    await clicar_avancar_apos_texto(
        page,
        re.compile(r"Local de Entrega diferente do Destinatário", re.IGNORECASE),
        logger,
    )
    campo_produto = _localizador_codigo_produto(page)
    try:
        await campo_produto.wait_for(state="visible", timeout=10000)
    except PlaywrightTimeoutError as exc:
        raise RuntimeError("O Avançar da retirada não abriu Produtos.") from exc
    logger.info("Etapa Produtos confirmada após Avançar")


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


def _localizador_codigo_produto(page: Page):
    """Retorna o campo exclusivo que confirma a abertura de Dados do Produto."""
    return (
        page.locator("label")
        .filter(has_text="Código do Produto")
        .locator("..")
        .locator('input.default-input.slds-input')
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

    logger.info("Buscando produto fiscal configurado")

    # Localiza o label pelo texto e sobe para o div que contém
    # tanto o label quanto o input correspondente.
    campo_codigo = _localizador_codigo_produto(page)

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
        "Código do produto preenchido"
    )

    # Seleciona a primeira sugestão.
    await campo_codigo.press("ArrowDown")

    logger.info("ArrowDown pressionado")

    # Confirma a sugestão.
    await campo_codigo.press("Enter")

    logger.info(
        "Produto selecionado"
    )

    logger.info("Produto escolhido; próxima etapa aguardará os campos automáticos")
    
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
        "Selecionando CFOP configurado"
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
        "CFOP selecionado"
    )

    # ================================================================
    # UNIDADE COMERCIAL
    # ================================================================

    logger.info(
        "Selecionando unidade comercial"
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

    logger.info("Unidade comercial preenchida")

    # A Unidade Comercial é um autocomplete, assim como o Código do
    # Produto. Selecionamos a primeira sugestão com ArrowDown + Enter.
    await unidade.press("ArrowDown")

    logger.info(
        "ArrowDown pressionado na Unidade Comercial"
    )

    await unidade.press("Enter")

    logger.info("Unidade comercial selecionada")

    # ================================================================
    # QUANTIDADE COMERCIAL
    # ================================================================

    logger.info(
        "Preenchendo quantidade comercial"
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

    await _preencher_decimal_portal(
        page,
        quantidade,
        item.quantidade,
        casas=3,
        nome_campo="a quantidade comercial",
    )

    logger.info(
        "Quantidade comercial preenchida"
    )

    # ================================================================
    # VALOR UNITÁRIO COMERCIAL
    # ================================================================

    logger.info(
        "Preenchendo valor unitário comercial"
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

    await _preencher_decimal_portal(
        page,
        valor_unitario,
        item.preco_unitario,
        casas=2,
        nome_campo="o valor unitário comercial",
    )

    logger.info(
        "Valor unitário comercial preenchido"
    )

        # ================================================================
    # BENEFÍCIO FISCAL
    # ================================================================

    if not item.possui_beneficio_fiscal:
        await clicar_avancar_produto(
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
        "Preenchendo código do benefício fiscal"
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

    logger.info("Código de benefício fiscal preenchido")
    # ================================================================
    # 1º AVANÇAR — DADOS DO PRODUTO → ICMS
    # ================================================================

    await clicar_avancar_produto(
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

    logger.info("Situação Tributária ICMS selecionada")

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

    logger.info("Origem da mercadoria selecionada")

    # ================================================================
    # 2º AVANÇAR — FINALIZA ITEM
    # ================================================================
    
    await clicar_avancar_produto(
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
            f"Produto {indice}/{total}"
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

            # O próximo item aguarda explicitamente o campo Código do Produto.

        # ------------------------------------------------------------
        # Último produto.
        # Estamos na tela "Adicionar Produto / Avançar".
        # Aqui NÃO clicamos em "Adicionar Produto".
        # Clicamos em "Avançar" para ir para Transporte.
        # ------------------------------------------------------------
        else:
            # O clique que encerra o ICMS atualiza a interface de forma
            # assíncrona. Confirmar a tela-resumo evita reencontrar e clicar
            # novamente no botão "Avançar" da etapa anterior durante essa
            # curta transição (condição observada ao vivo em 28/08/2026).
            adicionar_produto = page.get_by_role(
                "button",
                name="Adicionar Produto"
            )
            await adicionar_produto.wait_for(
                state="visible",
                timeout=10000
            )
            logger.info(
                "Último produto consolidado na tela-resumo"
            )

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

            # A pausa de diagnóstico exige as duas chaves. Assim, um valor
            # antigo de PAUSAR_ANTES_TRANSPORTE no .env nunca abre o Inspector
            # quando o operador desativou explicitamente INSPECIONAR.
            inspecao_transporte = (
                os.getenv("INSPECIONAR", "false").lower() == "true"
                and os.getenv("PAUSAR_ANTES_TRANSPORTE", "false").lower() == "true"
            )
            if inspecao_transporte:
                if os.getenv("HEADLESS", "false").lower() == "true":
                    raise RuntimeError(
                        "PAUSAR_ANTES_TRANSPORTE exige HEADLESS=false."
                    )
                await candidatos[0].highlight()
                logger.warning(
                    "INSPEÇÃO MANUAL — confira o Avançar destacado e clique "
                    "somente em Resume (▶) no Playwright Inspector."
                )
                await page.pause()

            await candidatos[0].click()

            logger.info(
                "Avançar pós-produto clicado — aguardando Transporte"
            )

            if inspecao_transporte:
                logger.warning(
                    "INSPEÇÃO MANUAL — clique em Resume (▶) após conferir "
                    "a resposta do portal."
                )
                await page.pause()

            # preencher_transporte aguarda explicitamente o respectivo label.
    
    
async def preencher_transporte(
    page: Page,
    tarefa: Tarefa,
    logger: logging.Logger
) -> None:
    logger.info("Transporte: modalidade de frete configurada")

    # Localiza diretamente o label da Modalidade do Frete.
    label_frete = page.locator("label").filter(
        has_text="Modalidade do Frete"
    )

    try:
        await label_frete.wait_for(
            state="visible",
            timeout=10000
        )
    except PlaywrightTimeoutError as exc:
        acesso_negado = page.get_by_text(
            re.compile(r"Você não tem acesso a esta aplicação", re.IGNORECASE)
        )
        if await acesso_negado.count() and await acesso_negado.first.is_visible():
            raise AcessoPortalNegado(
                "O portal negou acesso ao módulo seguinte antes da emissão."
            ) from exc
        raise

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

    logger.info("Modalidade do frete selecionada")

    await avancar_transporte(page, logger)


async def avancar_transporte(page: Page, logger: logging.Logger) -> None:
    """Reavalia o botão após re-renderização sem guardar índices antigos.

    O portal pode remover a cópia da etapa anterior entre count/is_visible/
    is_enabled. A posição antiga então aguarda um elemento inexistente. O
    locator dinâmico mantém a escolha do último Avançar visível e deixa o
    click aguardar habilitação/estabilidade sem contornar essas proteções.
    """
    operacao = "clicar_avancar"
    try:
        logger.info("Transporte: aguardando Avançar visível e estável")
        botao = page.get_by_role("button", name="Avançar", exact=True).and_(
            page.locator("button:visible")
        ).last
        await botao.click(timeout=15000)
        logger.info("Avançar do transporte clicado")
        operacao = "confirmar_resumo"
        await page.get_by_role("button", name="Emitir", exact=True).wait_for(
            state="visible", timeout=15000
        )
        logger.info("Transporte: resumo com botão Emitir confirmado")
    except Exception as exc:
        # Não registrar str(exc): erros do portal podem conter dados fiscais.
        logger.error("Transporte falhou: operacao=%s tipo=%s", operacao, type(exc).__name__)
        raise

async def emitir(
    page: Page,
    tarefa: Tarefa,
    logger: logging.Logger,
    *,
    ambiente: str,
) -> None:
    """Clica em Emitir somente quando a Page está no domínio de homologação."""
    _exigir_pagina_homologacao(page.url, ambiente)
    logger.info(f"[{tarefa.tarefa_id}] Emitindo nota")
    try:
        await page.get_by_role("button", name="Emitir", exact=True).click()
        logger.info(f"[{tarefa.tarefa_id}] Botão de emissão clicado")
    except Exception as exc:  # noqa: BLE001 — tentativa educada, não é seletor confirmado
        logger.warning(
            "Botão 'Emitir' não encontrado (%s) — confirmar seletor com o Inspector.",
            type(exc).__name__,
        )
        raise NotImplementedError("Botão de emissão não está disponível.") from exc


async def aguardar_autorizacao(
    page: Page,
    tarefa: Tarefa,
    logger: logging.Logger,
    *,
    ambiente: str,
    timeout_ms: int = 60_000,
) -> None:
    """Confirma autorização por classe e texto antes de liberar downloads.

    O seletor foi reconhecido ao vivo em homologação em 25/08/2026. A classe
    curta e o texto exato são mais estáveis do que a cadeia estrutural com
    ``nth-child`` copiada do DevTools.
    """
    _exigir_pagina_homologacao(page.url, ambiente)
    status_autorizada = page.locator("span.autorizada").filter(
        has_text=re.compile(r"^\s*AUTORIZADA\s*$")
    ).first
    status_rejeitada = page.get_by_text(
        re.compile(r"^\s*REJEITAD[AO]\s*$", re.IGNORECASE), exact=True
    ).first
    espera_autorizada = asyncio.create_task(
        status_autorizada.wait_for(state="visible", timeout=timeout_ms)
    )
    espera_rejeitada = asyncio.create_task(
        status_rejeitada.wait_for(state="visible", timeout=timeout_ms)
    )
    try:
        concluidas, pendentes = await asyncio.wait(
            {espera_autorizada, espera_rejeitada},
            return_when=asyncio.FIRST_COMPLETED,
        )
        for espera in pendentes:
            espera.cancel()
        await asyncio.gather(*pendentes, return_exceptions=True)

        if espera_autorizada in concluidas:
            espera_autorizada.result()
            texto = (await status_autorizada.inner_text()).strip()
            if texto != "AUTORIZADA":
                raise FalhaConfirmacaoEmissao(
                    "O status fiscal recebido não corresponde a AUTORIZADA."
                )
        elif espera_rejeitada in concluidas:
            espera_rejeitada.result()
            texto = (await status_rejeitada.inner_text()).strip().upper()
            raise FalhaConfirmacaoEmissao(
                f"Resultado fiscal não autorizado: {texto}."
            )
        else:
            raise FalhaConfirmacaoEmissao(
                "A emissão não retornou um resultado fiscal reconhecível."
            )
    except PlaywrightTimeoutError as exc:
        raise FalhaConfirmacaoEmissao(
            "A emissão não foi confirmada como AUTORIZADA dentro do prazo. "
            "Não baixar nem registrar documentos como sucesso."
        ) from exc

    # Defesa contra mudança de página entre o clique e a resposta do portal.
    _exigir_pagina_homologacao(page.url, ambiente)
    logger.info("[%s] Emissão confirmada como AUTORIZADA", tarefa.tarefa_id)


async def salvar_diagnostico_resultado(
    page: Page,
    tarefa: Tarefa,
    download_dir: str,
    logger: logging.Logger,
) -> tuple[str, ...]:
    """Salva HTML e captura locais quando a autorização não é confirmada.

    Os artefatos podem conter dados fiscais; permanecem na pasta ignorada pelo
    Git, recebem permissão restritiva quando suportada e seu conteúdo nunca é
    escrito no log.
    """
    _preparar_diretorio_privado(download_dir)
    base = _caminho_documento(download_dir, tarefa, "resultado", "html")
    html_path = base
    screenshot_path = os.path.splitext(base)[0] + ".png"
    salvos: list[str] = []

    try:
        with open(html_path, "w", encoding="utf-8", newline="") as arquivo:
            arquivo.write(await page.content())
        _restringir_permissoes(html_path)
        salvos.append(html_path)
    except Exception as exc:  # noqa: BLE001 — diagnóstico não pode ocultar o erro fiscal
        logger.error(
            "[%s] Não foi possível salvar HTML de diagnóstico (%s)",
            tarefa.tarefa_id,
            type(exc).__name__,
        )

    try:
        await page.screenshot(path=screenshot_path, full_page=True)
        _restringir_permissoes(screenshot_path)
        salvos.append(screenshot_path)
    except Exception as exc:  # noqa: BLE001 — diagnóstico não pode ocultar o erro fiscal
        logger.error(
            "[%s] Não foi possível salvar captura de diagnóstico (%s)",
            tarefa.tarefa_id,
            type(exc).__name__,
        )

    return tuple(salvos)


def _exigir_pagina_homologacao(url_atual: str, ambiente: str) -> None:
    """Defesa final contra emissão acidental no ambiente fiscal normal."""
    url = urlsplit(url_atual)
    if (
        ambiente != "teste"
        or url.scheme != "https"
        or url.hostname != "homologacao.nfae.fazenda.pr.gov.br"
        or not url.path.startswith("/nfae/")
    ):
        raise EmissaoBloqueada(
            "Emissão bloqueada: a página atual não pertence à homologação NFP-e TESTES."
        )


async def cancelar_nota(page: Page, numero_nota: str, motivo: str, logger: logging.Logger) -> None:
    """
    Fluxo confirmado em 15/08: Consultar → localizar a nota pelo número →
    penúltimo botão é "Cancelar" → pede um motivo/justificativa.

    ⚠️ Usar com moderação: a Receita monitora volume de cancelamentos e
    entra em contato quando o padrão parece suspeito. No relato do
    reconhecimento, até ~3 cancelamentos foi tranquilo historicamente —
    não tratar isso como limite seguro garantido, só como referência.
    """
    logger.warning("Cancelamento fiscal solicitado; dados omitidos do log")
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
    _preparar_diretorio_privado(download_dir)

    xml_path = await _baixar_documento(
        page=page,
        nome_botao="Baixar XML",
        destino=_caminho_documento(download_dir, tarefa, "xml", "xml"),
        extensao="xml",
        tarefa_id=tarefa.tarefa_id,
        logger=logger,
    )
    pdf_path = await _baixar_documento(
        page=page,
        nome_botao="Visualizar DANFE",
        destino=_caminho_documento(download_dir, tarefa, "danfe", "pdf"),
        extensao="pdf",
        tarefa_id=tarefa.tarefa_id,
        logger=logger,
    )
    return {"xml_path": xml_path, "pdf_path": pdf_path}


async def _baixar_documento(
    *,
    page: Page,
    nome_botao: str,
    destino: str,
    extensao: str,
    tarefa_id: str,
    logger: logging.Logger,
) -> str:
    acionador = page.get_by_role("button", name=nome_botao, exact=True)
    return await baixar_documento_por_acao(
        page=page,
        acionador=acionador,
        destino=destino,
        extensao=extensao,
        tarefa_id=tarefa_id,
        rotulo=nome_botao,
        logger=logger,
    )


async def baixar_documento_por_acao(
    *,
    page: Page,
    acionador: Locator,
    destino: str,
    extensao: str,
    tarefa_id: str,
    rotulo: str,
    logger: logging.Logger,
) -> str:
    """Baixa e valida um documento disparado por um controle já localizado.

    Emissão e consulta usam botões diferentes, mas compartilham as mesmas
    garantias locais de tamanho, formato, diretório privado e permissões.
    """

    diretorio = os.path.dirname(destino) or "."
    _preparar_diretorio_privado(diretorio)
    try:
        async with page.expect_download(timeout=60_000) as evento_download:
            await acionador.click(timeout=60_000)
        download = await evento_download.value
        if await download.failure():
            raise FalhaDownloadDocumento("O navegador informou falha no download.")
        await download.save_as(destino)
        _validar_arquivo_baixado(destino, extensao)
    except FalhaDownloadDocumento:
        raise
    except Exception as exc:  # noqa: BLE001 — não registrar resposta fiscal bruta
        raise FalhaDownloadDocumento(
            f"[{tarefa_id}] Não foi possível baixar o documento fiscal solicitado."
        ) from exc

    _restringir_permissoes(destino)
    logger.info("[%s] %s salvo", tarefa_id, rotulo)
    return destino


def _caminho_documento(download_dir: str, tarefa: Tarefa, tipo: str, extensao: str) -> str:
    """Nomeia artefatos de forma legível, única e segura para o sistema de arquivos."""
    cliente = _slug_nome_arquivo(tarefa.nome_cliente or tarefa.destinatario.razao_social, 64)
    emitente = _slug_nome_arquivo(
        tarefa.nome_emitente or f"Emitente-{tarefa.emitente.valor_select}", 48
    )
    if tarefa.numero_distribuicao is not None:
        distribuicao = f"Distribuicao-{tarefa.numero_distribuicao:06d}"
    else:
        distribuicao = f"Distribuicao-local-{_slug_nome_arquivo(tarefa.tarefa_id, 36)}"
    instante = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    return os.path.join(
        download_dir,
        f"{tipo}_{cliente}_{emitente}_{distribuicao}_{instante}.{extensao}",
    )


def _slug_nome_arquivo(valor: str, maximo: int) -> str:
    """Remove caracteres de caminho, preservando uma leitura humana razoável."""
    normalizado = unicodedata.normalize("NFKD", valor).encode("ascii", "ignore").decode()
    slug = re.sub(r"[^A-Za-z0-9]+", "-", normalizado).strip("-")
    return (slug[:maximo].rstrip("-") or "cliente")


def _validar_arquivo_baixado(caminho: str, extensao: str) -> None:
    """Recusa resposta vazia, HTML de erro disfarçado ou arquivo excessivo."""
    tamanho = os.path.getsize(caminho)
    # Alinhado ao limite do bucket privado ``documentos-fiscais``. XML/DANFE
    # normais são muito menores; respostas anormais não devem ser enviadas.
    if tamanho < 1 or tamanho > 10 * 1024 * 1024:
        _remover_download_invalido(caminho)
        raise FalhaDownloadDocumento("Documento baixado possui tamanho inválido.")

    with open(caminho, "rb") as arquivo:
        inicio = arquivo.read(1024)
    if extensao == "pdf":
        valido = inicio.startswith(b"%PDF-")
    else:
        valido = _xml_nf_eh_valido(caminho)
    if not valido:
        _remover_download_invalido(caminho)
        raise FalhaDownloadDocumento(
            "Documento baixado não corresponde ao formato esperado."
        )


def _xml_nf_eh_valido(caminho: str) -> bool:
    """Aceita somente XML bem-formado com raiz compatível com uma NF-e.

    O teste anterior verificava apenas o primeiro caractere. Uma página HTML
    de erro também começa com ``<`` e poderia ser armazenada como se fosse o
    XML fiscal. A validação continua deliberadamente estrutural: a assinatura
    criptográfica e a autorização serão conferidas no próximo gate, quando o
    elemento de resposta final da homologação tiver sido reconhecido.
    """
    try:
        raiz = ElementTree.parse(caminho).getroot()
    except (ElementTree.ParseError, OSError):
        return False

    nome_local = raiz.tag.rsplit("}", 1)[-1].lower()
    return nome_local in {"nfe", "nfeproc"}


def extrair_metadados_xml(caminho: str) -> MetadadosDocumentoFiscal:
    """Extrai a prova fiscal mínima do XML autorizado, sem registrá-la em log."""
    try:
        raiz = ElementTree.parse(caminho).getroot()
    except (ElementTree.ParseError, OSError) as exc:
        raise FalhaDownloadDocumento("XML fiscal não pôde ser interpretado.") from exc

    def texto(nome: str) -> str | None:
        for elemento in raiz.iter():
            if elemento.tag.rsplit("}", 1)[-1] == nome and elemento.text:
                return elemento.text.strip()
        return None

    chave = texto("chNFe")
    if not chave:
        for elemento in raiz.iter():
            if elemento.tag.rsplit("}", 1)[-1] == "infNFe":
                identificador = elemento.attrib.get("Id", "")
                chave = identificador[3:] if identificador.startswith("NFe") else None
                break
    numero, protocolo, codigo = texto("nNF"), texto("nProt"), texto("cStat")
    if not chave or not re.fullmatch(r"\d{44}", chave) or not numero or not numero.isdigit():
        raise FalhaDownloadDocumento("XML não contém identificação fiscal válida.")
    if not protocolo or not protocolo.isdigit() or codigo != "100":
        raise FalhaDownloadDocumento("XML não comprova autorização fiscal.")
    return MetadadosDocumentoFiscal(chave, numero, protocolo, codigo)


def _remover_download_invalido(caminho: str) -> None:
    try:
        os.unlink(caminho)
    except FileNotFoundError:
        pass


def _restringir_permissoes(caminho: str) -> None:
    try:
        os.chmod(caminho, 0o600)
    except OSError:
        # ACLs da VM complementam a proteção quando o SO não usa permissões POSIX.
        pass


def _preparar_diretorio_privado(caminho: str) -> None:
    """Cria o diretório fiscal e recusa redirecionamento por link simbólico."""
    if os.path.lexists(caminho) and os.path.islink(caminho):
        raise FalhaDownloadDocumento(
            "O diretório de documentos não pode ser um link simbólico."
        )
    os.makedirs(caminho, mode=0o700, exist_ok=True)
    try:
        os.chmod(caminho, 0o700)
    except OSError:
        # Em Windows, o provisionamento deve aplicar ACL equivalente.
        pass
