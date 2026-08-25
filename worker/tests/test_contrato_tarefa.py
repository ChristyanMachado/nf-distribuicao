"""Contrato Web → Worker: testes sem navegador, banco ou credenciais."""

from copy import deepcopy

import pytest

from src.contrato_tarefa import ContratoTarefaInvalido, carregar_contrato_tarefa


def _contrato_valido() -> dict:
    return {
        "versaoContrato": 1,
        "ambiente": "teste",
        "tarefa": {
            "id": "tarefa-123",
            "clienteId": "cliente-456",
            "emitente": {
                "id": "emitente-789",
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
                    "produtoId": "produto-111",
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
    assert contrato.tarefa.tarefa_id == "tarefa-123"
    assert contrato.tarefa.emitente.valor_select == "opcao-da-tela-nfpe"
    assert contrato.tarefa.itens[0].codigo_produto == "CODIGO-FISCAL-1"
    assert contrato.tarefa.itens[0].quantidade == 2.5


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
