"""Contrato versionado de tarefa entre a aplicação Web e o Worker fiscal.

Este módulo não acessa banco, navegador nem credenciais. Ele recebe um
payload já selecionado/reservado pela futura fonte de tarefas, valida os
campos fiscais necessários e o converte para o modelo que preenche a NFP-e.
Manter essa fronteira pura permite testar a integração antes de expor o
Worker ao banco ou ao ambiente de produção.
"""
from __future__ import annotations

import math
import re
import uuid
from dataclasses import dataclass
from typing import Any, Literal, Mapping

from .flows.emissao import Destinatario, Emitente, ItemTarefa, Tarefa


VERSAO_CONTRATO_TAREFA = 1
MAX_ITENS_POR_TAREFA = 200
MAX_VALOR_NUMERICO = 1_000_000_000
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
    if len(itens_raw) > MAX_ITENS_POR_TAREFA:
        raise ContratoTarefaInvalido("tarefa.itens excede o limite permitido.")

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
        tarefa_id=_uuid(tarefa_raw.get("id"), "tarefa.id"),
        cliente_id=_uuid(tarefa_raw.get("clienteId"), "tarefa.clienteId"),
        emitente=Emitente(
            valor_select=_texto(emitente_raw.get("valorSelect"), "tarefa.emitente.valorSelect")
        ),
        destinatario=Destinatario(
            cnpj=_cnpj(destinatario_raw.get("cnpj"), "tarefa.destinatario.cnpj"),
            indicador_ie=indicador_ie,
            razao_social=_texto(
                destinatario_raw.get("razaoSocial"),
                "tarefa.destinatario.razaoSocial",
            ),
            cep=_cep(destinatario_raw.get("cep"), "tarefa.destinatario.cep"),
            numero_endereco=_texto(
                destinatario_raw.get("numeroEndereco"),
                "tarefa.destinatario.numeroEndereco",
            ),
            inscricao_estadual=inscricao_estadual,
        ),
        nome_cliente=_texto(tarefa_raw.get("nomeCliente"), "tarefa.nomeCliente", 160),
        nome_emitente=_texto(
            tarefa_raw.get("nomeEmitente"), "tarefa.nomeEmitente", 160
        ),
        numero_distribuicao=_numero_inteiro_positivo(
            tarefa_raw.get("numeroDistribuicao"), "tarefa.numeroDistribuicao"
        ),
        itens=itens,
        natureza_operacao=_opcao(
            operacao_raw.get("natureza"),
            "tarefa.operacao.natureza",
            {"Venda"},
        ),
        tipo_operacao=_opcao(
            operacao_raw.get("tipo"),
            "tarefa.operacao.tipo",
            {"Entrada", "Saída"},
        ),
        finalidade_emissao=_opcao(
            operacao_raw.get("finalidade"),
            "tarefa.operacao.finalidade",
            {"NF-e normal", "NF-e complementar", "NF-e de ajuste", "Devolução de Mercadoria"},
        ),
        indicador_presenca=_opcao(
            operacao_raw.get("indicadorPresenca"),
            "tarefa.operacao.indicadorPresenca",
            {
                "Não se aplica",
                "Operação presencial",
                "Operação não presencial, pela Internet",
                "Operação não presencial, Teleatendimento",
                "Operação não presencial, outros",
            },
        ),
        modalidade_frete=_opcao(
            operacao_raw.get("modalidadeFrete"),
            "tarefa.operacao.modalidadeFrete",
            {"3"},
        ),
    )
    return TarefaContratada(
        tarefa=tarefa,
        ambiente=ambiente,
        emitente_id=_uuid(emitente_raw.get("id"), "tarefa.emitente.id"),
        credencial_referencia=_texto_padrao(
            emitente_raw.get("credencialReferencia"),
            "tarefa.emitente.credencialReferencia",
            r"[A-Z][A-Z0-9_]{2,63}",
        ),
    )


def _carregar_item(dados: Any, indice: int) -> ItemTarefa:
    caminho = f"tarefa.itens[{indice}]"
    item = _objeto(dados, caminho)
    _uuid(item.get("produtoId"), f"{caminho}.produtoId")
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
        produto_descricao=_texto(item.get("descricao"), f"{caminho}.descricao", 160),
        codigo_produto=_texto(item.get("codigoFiscal"), f"{caminho}.codigoFiscal", 80),
        unidade=_texto(item.get("unidade"), f"{caminho}.unidade", 16),
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


def _numero_inteiro_positivo(valor: Any, caminho: str) -> int:
    if isinstance(valor, bool) or not isinstance(valor, int) or not 1 <= valor <= 1_000_000_000:
        raise ContratoTarefaInvalido(f"{caminho} deve ser um inteiro positivo válido.")
    return valor


def _texto(valor: Any, caminho: str, maximo: int = 256) -> str:
    if not isinstance(valor, str) or not valor.strip():
        raise ContratoTarefaInvalido(f"{caminho} deve ser um texto preenchido.")
    texto = valor.strip()
    if len(texto) > maximo:
        raise ContratoTarefaInvalido(f"{caminho} excede o tamanho permitido.")
    return texto


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
    numero = float(valor)
    if not math.isfinite(numero) or abs(numero) > MAX_VALOR_NUMERICO:
        raise ContratoTarefaInvalido(f"{caminho} está fora do intervalo permitido.")
    return numero


def _uuid(valor: Any, caminho: str) -> str:
    texto = _texto(valor, caminho, 36)
    try:
        identificador = uuid.UUID(texto)
    except ValueError as exc:
        raise ContratoTarefaInvalido(f"{caminho} deve ser um UUID válido.") from exc
    if str(identificador) != texto.lower():
        raise ContratoTarefaInvalido(f"{caminho} deve ser um UUID válido.")
    return texto


def _texto_padrao(valor: Any, caminho: str, padrao: str) -> str:
    texto = _texto(valor, caminho)
    if not re.fullmatch(padrao, texto):
        raise ContratoTarefaInvalido(f"{caminho} possui formato inválido.")
    return texto


def _cnpj(valor: Any, caminho: str) -> str:
    cnpj = _texto_padrao(valor, caminho, r"\d{14}")
    if len(set(cnpj)) == 1:
        raise ContratoTarefaInvalido(f"{caminho} possui formato inválido.")
    def digito(base: str, pesos: list[int]) -> int:
        resto = sum(int(numero) * peso for numero, peso in zip(base, pesos)) % 11
        return 0 if resto < 2 else 11 - resto
    primeiro = digito(cnpj[:12], [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
    segundo = digito(cnpj[:12] + str(primeiro), [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
    if cnpj[-2:] != f"{primeiro}{segundo}":
        raise ContratoTarefaInvalido(f"{caminho} possui formato inválido.")
    return cnpj


def _cep(valor: Any, caminho: str) -> str:
    cep = _texto_padrao(valor, caminho, r"\d{8}")
    if cep == "00000000":
        raise ContratoTarefaInvalido(f"{caminho} possui formato inválido.")
    return cep


def _opcao(valor: Any, caminho: str, opcoes: set[str]) -> str:
    texto = _texto(valor, caminho)
    if texto not in opcoes:
        raise ContratoTarefaInvalido(f"{caminho} não é uma opção permitida.")
    return texto


def _ambiente(valor: Any, caminho: str) -> AmbienteEmissao:
    if valor not in {"teste", "normal"}:
        raise ContratoTarefaInvalido(f"{caminho} deve ser 'teste' ou 'normal'.")
    return valor
