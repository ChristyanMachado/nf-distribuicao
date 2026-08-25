"""Contrato versionado de tarefa entre a aplicação Web e o Worker fiscal.

Este módulo não acessa banco, navegador nem credenciais. Ele recebe um
payload já selecionado/reservado pela futura fonte de tarefas, valida os
campos fiscais necessários e o converte para o modelo que preenche a NFP-e.
Manter essa fronteira pura permite testar a integração antes de expor o
Worker ao banco ou ao ambiente de produção.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal, Mapping

from .flows.emissao import Destinatario, Emitente, ItemTarefa, Tarefa


VERSAO_CONTRATO_TAREFA = 1
AmbienteEmissao = Literal["teste", "normal"]


class ContratoTarefaInvalido(ValueError):
    """O payload recebido não é seguro o bastante para iniciar uma emissão."""


@dataclass(frozen=True)
class TarefaContratada:
    """Tarefa fiscal pronta para o Worker, sem qualquer segredo de login."""

    tarefa: Tarefa
    ambiente: AmbienteEmissao
    emitente_id: str
    credencial_referencia: str


def carregar_contrato_tarefa(dados: Mapping[str, Any]) -> TarefaContratada:
    """Valida e converte o contrato Web → Worker na versão atualmente aceita.

    Mensagens de erro mencionam apenas caminhos de campos, nunca os valores
    recebidos. Isso impede que uma falha de integração acabe registrando
    dados fiscais ou identificadores sensíveis nos logs.
    """
    raiz = _objeto(dados, "payload")
    versao = raiz.get("versaoContrato")
    if versao != VERSAO_CONTRATO_TAREFA:
        raise ContratoTarefaInvalido(
            "versaoContrato não suportada; atualize o produtor ou o Worker."
        )

    ambiente = _ambiente(raiz.get("ambiente"), "ambiente")
    tarefa_raw = _objeto(raiz.get("tarefa"), "tarefa")
    emitente_raw = _objeto(tarefa_raw.get("emitente"), "tarefa.emitente")
    destinatario_raw = _objeto(tarefa_raw.get("destinatario"), "tarefa.destinatario")
    operacao_raw = _objeto(tarefa_raw.get("operacao"), "tarefa.operacao")
    itens_raw = _lista(tarefa_raw.get("itens"), "tarefa.itens")
    if not itens_raw:
        raise ContratoTarefaInvalido("tarefa.itens deve conter ao menos um item.")

    indicador_ie = _texto(destinatario_raw.get("indicadorIe"), "tarefa.destinatario.indicadorIe")
    if indicador_ie not in {
        "CONTRIBUINTE",
        "CONTRIBUINTE_ISENTO",
        "NAO_CONTRIBUINTE",
    }:
        raise ContratoTarefaInvalido("tarefa.destinatario.indicadorIe é inválido.")

    inscricao_estadual = _texto_opcional(
        destinatario_raw.get("inscricaoEstadual"),
        "tarefa.destinatario.inscricaoEstadual",
    )
    if indicador_ie == "CONTRIBUINTE" and not inscricao_estadual:
        raise ContratoTarefaInvalido(
            "tarefa.destinatario.inscricaoEstadual é obrigatória para CONTRIBUINTE."
        )

    itens = [_carregar_item(item, indice) for indice, item in enumerate(itens_raw)]
    tarefa = Tarefa(
        tarefa_id=_texto(tarefa_raw.get("id"), "tarefa.id"),
        cliente_id=_texto(tarefa_raw.get("clienteId"), "tarefa.clienteId"),
        emitente=Emitente(
            valor_select=_texto(emitente_raw.get("valorSelect"), "tarefa.emitente.valorSelect")
        ),
        destinatario=Destinatario(
            cnpj=_texto(destinatario_raw.get("cnpj"), "tarefa.destinatario.cnpj"),
            indicador_ie=indicador_ie,
            razao_social=_texto(
                destinatario_raw.get("razaoSocial"),
                "tarefa.destinatario.razaoSocial",
            ),
            cep=_texto(destinatario_raw.get("cep"), "tarefa.destinatario.cep"),
            numero_endereco=_texto(
                destinatario_raw.get("numeroEndereco"),
                "tarefa.destinatario.numeroEndereco",
            ),
            inscricao_estadual=inscricao_estadual,
        ),
        itens=itens,
        natureza_operacao=_texto(operacao_raw.get("natureza"), "tarefa.operacao.natureza"),
        tipo_operacao=_texto(operacao_raw.get("tipo"), "tarefa.operacao.tipo"),
        finalidade_emissao=_texto(
            operacao_raw.get("finalidade"),
            "tarefa.operacao.finalidade",
        ),
        indicador_presenca=_texto(
            operacao_raw.get("indicadorPresenca"),
            "tarefa.operacao.indicadorPresenca",
        ),
        modalidade_frete=_texto(
            operacao_raw.get("modalidadeFrete"),
            "tarefa.operacao.modalidadeFrete",
        ),
    )
    return TarefaContratada(
        tarefa=tarefa,
        ambiente=ambiente,
        emitente_id=_texto(emitente_raw.get("id"), "tarefa.emitente.id"),
        credencial_referencia=_texto(
            emitente_raw.get("credencialReferencia"),
            "tarefa.emitente.credencialReferencia",
        ),
    )


def _carregar_item(dados: Any, indice: int) -> ItemTarefa:
    caminho = f"tarefa.itens[{indice}]"
    item = _objeto(dados, caminho)
    possui_beneficio = item.get("possuiBeneficioFiscal")
    if not isinstance(possui_beneficio, bool):
        raise ContratoTarefaInvalido(f"{caminho}.possuiBeneficioFiscal deve ser booleano.")

    codigo_beneficio = _texto_opcional(
        item.get("codigoBeneficioFiscal"),
        f"{caminho}.codigoBeneficioFiscal",
    )
    if possui_beneficio and not codigo_beneficio:
        raise ContratoTarefaInvalido(
            f"{caminho}.codigoBeneficioFiscal é obrigatório quando há benefício fiscal."
        )

    return ItemTarefa(
        produto_descricao=_texto(item.get("descricao"), f"{caminho}.descricao"),
        codigo_produto=_texto(item.get("codigoFiscal"), f"{caminho}.codigoFiscal"),
        unidade=_texto(item.get("unidade"), f"{caminho}.unidade"),
        quantidade=_numero_positivo(item.get("quantidade"), f"{caminho}.quantidade"),
        preco_unitario=_numero_nao_negativo(
            item.get("precoUnitario"),
            f"{caminho}.precoUnitario",
        ),
        cfop_texto=_texto(item.get("cfopTexto"), f"{caminho}.cfopTexto"),
        cfop_codigo=_texto(item.get("cfopCodigo"), f"{caminho}.cfopCodigo"),
        situacao_tributaria_icms=_texto(
            item.get("situacaoTributariaIcms"),
            f"{caminho}.situacaoTributariaIcms",
        ),
        origem_mercadoria=_texto(
            item.get("origemMercadoria"),
            f"{caminho}.origemMercadoria",
        ),
        possui_beneficio_fiscal=possui_beneficio,
        codigo_beneficio_fiscal=codigo_beneficio,
    )


def _objeto(valor: Any, caminho: str) -> Mapping[str, Any]:
    if not isinstance(valor, Mapping):
        raise ContratoTarefaInvalido(f"{caminho} deve ser um objeto.")
    return valor


def _lista(valor: Any, caminho: str) -> list[Any]:
    if not isinstance(valor, list):
        raise ContratoTarefaInvalido(f"{caminho} deve ser uma lista.")
    return valor


def _texto(valor: Any, caminho: str) -> str:
    if not isinstance(valor, str) or not valor.strip():
        raise ContratoTarefaInvalido(f"{caminho} deve ser um texto preenchido.")
    return valor.strip()


def _texto_opcional(valor: Any, caminho: str) -> str | None:
    if valor is None:
        return None
    return _texto(valor, caminho)


def _numero_positivo(valor: Any, caminho: str) -> float:
    numero = _numero(valor, caminho)
    if numero <= 0:
        raise ContratoTarefaInvalido(f"{caminho} deve ser maior que zero.")
    return numero


def _numero_nao_negativo(valor: Any, caminho: str) -> float:
    numero = _numero(valor, caminho)
    if numero < 0:
        raise ContratoTarefaInvalido(f"{caminho} não pode ser negativo.")
    return numero


def _numero(valor: Any, caminho: str) -> float:
    if isinstance(valor, bool) or not isinstance(valor, (int, float)):
        raise ContratoTarefaInvalido(f"{caminho} deve ser numérico.")
    return float(valor)


def _ambiente(valor: Any, caminho: str) -> AmbienteEmissao:
    if valor not in {"teste", "normal"}:
        raise ContratoTarefaInvalido(f"{caminho} deve ser 'teste' ou 'normal'.")
    return valor
