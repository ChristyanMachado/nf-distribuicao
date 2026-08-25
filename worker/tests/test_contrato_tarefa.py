"""Contrato Web → Worker: testes sem navegador, banco ou credenciais."""

from copy import deepcopy
import math

import pytest

from src.contrato_tarefa import ContratoTarefaInvalido, carregar_contrato_tarefa


def _contrato_valido() -> dict:
    return {
        "versaoContrato": 1,
        "ambiente": "teste",
        "tarefa": {
            "id": "11111111-1111-4111-8111-111111111111",
            "clienteId": "22222222-2222-4222-8222-222222222222",
            "nomeCliente": "Mercado de Teste",
            "numeroDistribuicao": 42,
            "emitente": {
                "id": "33333333-3333-4333-8333-333333333333",
                "valorSelect": "opcao-da-tela-nfpe",
                "credencialReferencia": "CLIENTE_A",
            },
            "destinatario": {
                "cnpj": "00000000000100",
                "indicadorIe": "CONTRIBUINTE",
                "inscricaoEstadual": "1234567890",
                "razaoSocial": "Destinatário de teste",
                "cep": "80000000",
                "numeroEndereco": "1",
            },
            "operacao": {
                "natureza": "Venda",
                "tipo": "Saída",
                "finalidade": "NF-e normal",
                "indicadorPresenca": "Operação não presencial, pela Internet",
                "modalidadeFrete": "3",
            },
            "itens": [
                {
                    "produtoId": "44444444-4444-4444-8444-444444444444",
                    "descricao": "Produto de teste",
                    "codigoFiscal": "CODIGO-FISCAL-1",
                    "unidade": "KG",
                    "quantidade": 2.5,
                    "precoUnitario": 10.25,
                    "cfopTexto": "Venda de produção do estabelecimento",
                    "cfopCodigo": "5101",
                    "situacaoTributariaIcms": "40",
                    "origemMercadoria": "0",
                    "possuiBeneficioFiscal": True,
                    "codigoBeneficioFiscal": "PR810128",
                }
            ],
        },
    }


def test_contrato_valido_converte_para_modelo_fiscal_sem_segredo():
    contrato = carregar_contrato_tarefa(_contrato_valido())

    assert contrato.ambiente == "teste"
    assert contrato.credencial_referencia == "CLIENTE_A"
    assert contrato.tarefa.tarefa_id == "11111111-1111-4111-8111-111111111111"
    assert contrato.tarefa.emitente.valor_select == "opcao-da-tela-nfpe"
    assert contrato.tarefa.itens[0].codigo_produto == "CODIGO-FISCAL-1"
    assert contrato.tarefa.itens[0].quantidade == 2.5
    assert contrato.tarefa.nome_cliente == "Mercado de Teste"
    assert contrato.tarefa.numero_distribuicao == 42


@pytest.mark.parametrize(
    ("mutacao", "mensagem"),
    [
        (lambda dados: dados.update({"versaoContrato": 2}), "versaoContrato"),
        (lambda dados: dados["tarefa"]["itens"][0].pop("codigoFiscal"), "codigoFiscal"),
        (lambda dados: dados["tarefa"]["destinatario"].pop("cep"), "cep"),
        (lambda dados: dados["tarefa"]["emitente"].pop("credencialReferencia"), "credencialReferencia"),
    ],
)
def test_contrato_incompleto_ou_versao_desconhecida_falha_sem_expor_valores(mutacao, mensagem):
    dados = deepcopy(_contrato_valido())
    mutacao(dados)

    with pytest.raises(ContratoTarefaInvalido, match=mensagem):
        carregar_contrato_tarefa(dados)


def test_contribuinte_sem_ie_falha():
    dados = _contrato_valido()
    dados["tarefa"]["destinatario"].pop("inscricaoEstadual")

    with pytest.raises(ContratoTarefaInvalido, match="inscricaoEstadual"):
        carregar_contrato_tarefa(dados)


def test_beneficio_fiscal_exige_codigo():
    dados = _contrato_valido()
    dados["tarefa"]["itens"][0].pop("codigoBeneficioFiscal")

    with pytest.raises(ContratoTarefaInvalido, match="codigoBeneficioFiscal"):
        carregar_contrato_tarefa(dados)


@pytest.mark.parametrize("valor", [math.nan, math.inf, -math.inf, 1_000_000_001])
def test_numero_nao_finito_ou_excessivo_e_rejeitado(valor):
    dados = _contrato_valido()
    dados["tarefa"]["itens"][0]["precoUnitario"] = valor

    with pytest.raises(ContratoTarefaInvalido, match="precoUnitario"):
        carregar_contrato_tarefa(dados)


def test_quantidade_excessiva_de_itens_e_rejeitada():
    dados = _contrato_valido()
    dados["tarefa"]["itens"] = dados["tarefa"]["itens"] * 201

    with pytest.raises(ContratoTarefaInvalido, match="limite"):
        carregar_contrato_tarefa(dados)


@pytest.mark.parametrize(
    ("caminho", "valor"),
    [
        (("tarefa", "id"), "../../arquivo"),
        (("tarefa", "emitente", "credencialReferencia"), "CLIENTE_A\nFORJADO"),
        (("tarefa", "destinatario", "cep"), "javascript:"),
        (("tarefa", "operacao", "modalidadeFrete"), "999"),
    ],
)
def test_identificadores_e_opcoes_adulterados_sao_rejeitados(caminho, valor):
    dados = _contrato_valido()
    alvo = dados
    for chave in caminho[:-1]:
        alvo = alvo[chave]
    alvo[caminho[-1]] = valor

    with pytest.raises(ContratoTarefaInvalido):
        carregar_contrato_tarefa(dados)
