"""Testes isolados da fila PostgreSQL usada pelo Worker fiscal.

Nenhum teste deste módulo abre conexão real. Os dublês abaixo simulam apenas
o protocolo assíncrono de ``asyncpg`` necessário para conferir SQL, fencing
por token, transações e idempotência.
"""

from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager
import hashlib
import json
import sys
from types import SimpleNamespace
from typing import Any
from uuid import UUID

import pytest

from src.contrato_tarefa import carregar_contrato_tarefa
from src.fonte_tarefas import (
    DocumentoExpiradoReservado,
    FontePostgresTarefas,
    FonteTarefasErro,
    RecuperacaoDocumentoReservada,
    montar_payload_contrato,
)


TAREFA_ID = "11111111-1111-4111-8111-111111111111"
CLIENTE_ID = "22222222-2222-4222-8222-222222222222"
EMITENTE_ID = "33333333-3333-4333-8333-333333333333"
PRODUTO_ID = "44444444-4444-4444-8444-444444444444"
OUTRO_PRODUTO_ID = "55555555-5555-4555-8555-555555555555"
RESERVA_TOKEN = "66666666-6666-4666-8666-666666666666"
RECUPERACAO_ID = "77777777-7777-4777-8777-777777777777"
NOTA_ID = "88888888-8888-4888-8888-888888888888"


def _cabecalho() -> dict[str, Any]:
    return {
        "tarefa_id": TAREFA_ID,
        "cliente_id": CLIENTE_ID,
        "emitente_id": EMITENTE_ID,
        "numero_distribuicao": 7,
        "cliente_nome": "Mercado",
        "destinatario_nome": None,
        "cnpj": "00000000000191",
        "indicador_ie": "CONTRIBUINTE",
        "inscricao_estadual": "123",
        "cep": "80000000",
        "numero_endereco": "1",
        "emitente_nome": "Graalys",
        "credencial_referencia": "CLIENTE_A",
        "valor_select_nfpe": "emitente",
    }


def _item(**extra: Any) -> dict[str, Any]:
    valor = {
        "produto_id": PRODUTO_ID,
        "descricao": "Produto",
        "codigo_fiscal": "COD",
        "unidade": "KG",
        "quantidade": 1,
        "preco_unitario": 2,
        "cfop_texto": "Venda",
        "cfop_codigo": "5101",
        "situacao_tributaria_icms": "40",
        "origem_mercadoria": "0",
        "possui_beneficio_fiscal": True,
        "codigo_beneficio_fiscal": "PR810128",
        "natureza_operacao": "Venda",
        "tipo_operacao": "Saída",
        "finalidade_emissao": "NF-e normal",
        "indicador_presenca": "Operação não presencial, pela Internet",
        "modalidade_frete": "3",
    }
    valor.update(extra)
    return valor


def _payload_texto() -> str:
    payload = montar_payload_contrato(_cabecalho(), [_item()])
    return json.dumps(payload, ensure_ascii=False, separators=(",", ":"))


class _TransacaoFake:
    def __init__(self) -> None:
        self.entrou = False
        self.saiu = False
        self.tipo_excecao: type[BaseException] | None = None

    async def __aenter__(self) -> "_TransacaoFake":
        self.entrou = True
        return self

    async def __aexit__(
        self,
        tipo_excecao: type[BaseException] | None,
        _excecao: BaseException | None,
        _traceback: Any,
    ) -> None:
        self.saiu = True
        self.tipo_excecao = tipo_excecao


class _ConexaoFake:
    def __init__(
        self,
        *,
        fetch: list[Any] | None = None,
        fetchrow: list[Any] | None = None,
        fetchval: list[Any] | None = None,
        execute: list[Any] | None = None,
    ) -> None:
        self.resultados_fetch = list(fetch or [])
        self.resultados_fetchrow = list(fetchrow or [])
        self.resultados_fetchval = list(fetchval or [])
        self.resultados_execute = list(execute or [])
        self.chamadas: list[tuple[str, str, tuple[Any, ...]]] = []
        self.transacao_fake = _TransacaoFake()

    @staticmethod
    def _resultado(fila: list[Any], padrao: Any) -> Any:
        resultado = fila.pop(0) if fila else padrao
        if isinstance(resultado, BaseException):
            raise resultado
        return resultado

    async def fetch(self, consulta: str, *args: Any) -> Any:
        self.chamadas.append(("fetch", consulta, args))
        return self._resultado(self.resultados_fetch, [])

    async def fetchrow(self, consulta: str, *args: Any) -> Any:
        self.chamadas.append(("fetchrow", consulta, args))
        return self._resultado(self.resultados_fetchrow, None)

    async def fetchval(self, consulta: str, *args: Any) -> Any:
        self.chamadas.append(("fetchval", consulta, args))
        return self._resultado(self.resultados_fetchval, None)

    async def execute(self, consulta: str, *args: Any) -> str:
        self.chamadas.append(("execute", consulta, args))
        return self._resultado(self.resultados_execute, "UPDATE 1")

    def transaction(self) -> _TransacaoFake:
        return self.transacao_fake


def _fonte_com_conexao(conexao: _ConexaoFake) -> FontePostgresTarefas:
    fonte = FontePostgresTarefas("postgresql://nao-usado", "worker-teste")

    @asynccontextmanager
    async def conexao_fake():
        yield conexao

    fonte._conexao = conexao_fake  # type: ignore[method-assign]
    return fonte


def test_monta_contrato_v1_do_banco() -> None:
    contrato = montar_payload_contrato(_cabecalho(), [_item()])

    assert contrato["tarefa"]["numeroDistribuicao"] == 7
    assert contrato["tarefa"]["itens"][0]["codigoFiscal"] == "COD"
    assert contrato["tarefa"]["destinatario"]["razaoSocial"] == "Mercado"


def test_recusa_tarefa_sem_itens() -> None:
    with pytest.raises(FonteTarefasErro, match="não possui itens"):
        montar_payload_contrato(_cabecalho(), [])


def test_carrega_janela_operacional_somente_por_leitura() -> None:
    conexao = _ConexaoFake(fetchrow=[{
        "emissao_inicio_hora": 0,
        "emissao_fim_hora": 7,
    }])
    fonte = _fonte_com_conexao(conexao)

    assert asyncio.run(fonte.obter_janela_emissao()) == (0, 7)
    metodo, consulta, argumentos = conexao.chamadas[0]
    assert metodo == "fetchrow"
    assert "configuracoes_operacionais" in consulta
    assert argumentos == ()


def test_recusa_janela_operacional_ausente_ou_invalida() -> None:
    for linha in (None, {"emissao_inicio_hora": 6, "emissao_fim_hora": 6}):
        fonte = _fonte_com_conexao(_ConexaoFake(fetchrow=[linha]))
        with pytest.raises(FonteTarefasErro, match="janela de emissão"):
            asyncio.run(fonte.obter_janela_emissao())


def test_regras_operacionais_permutadas_nao_sao_consideradas_iguais() -> None:
    primeiro = _item()
    segundo = _item(
        produto_id=OUTRO_PRODUTO_ID,
        natureza_operacao="Saída",
        tipo_operacao="Venda",
    )

    with pytest.raises(FonteTarefasErro, match="incompatíveis"):
        montar_payload_contrato(_cabecalho(), [primeiro, segundo])


def test_reserva_snapshot_integro_e_devolve_token_canonico() -> None:
    texto = _payload_texto()
    conexao = _ConexaoFake(
        fetch=[[{"tarefa_id": UUID(TAREFA_ID), "reserva_token": UUID(RESERVA_TOKEN)}]],
        fetchrow=[{
            "payload_text": texto,
            "payload_hash": hashlib.sha256(texto.encode("utf-8")).hexdigest(),
        }],
    )
    fonte = _fonte_com_conexao(conexao)

    reservas = asyncio.run(fonte.reservar(3))

    assert len(reservas) == 1
    assert reservas[0].contratada.tarefa.tarefa_id == TAREFA_ID
    assert reservas[0].reserva_token == RESERVA_TOKEN
    assert conexao.chamadas[0][0] == "fetch"
    assert conexao.chamadas[0][2] == ("worker-teste", 3)
    assert "reserva_token=$2" in conexao.chamadas[1][1]


def test_reserva_snapshot_adulterado_vai_para_conferencia_e_continua_lote() -> None:
    texto = _payload_texto()
    outro_id = UUID("77777777-7777-4777-8777-777777777777")
    outro_token = UUID("88888888-8888-4888-8888-888888888888")
    outro_texto = texto.replace(TAREFA_ID, str(outro_id))
    conexao = _ConexaoFake(
        fetch=[[
            {"tarefa_id": UUID(TAREFA_ID), "reserva_token": UUID(RESERVA_TOKEN)},
            {"tarefa_id": outro_id, "reserva_token": outro_token},
        ]],
        fetchrow=[
            {"payload_text": texto, "payload_hash": "0" * 64},
            {
                "payload_text": outro_texto,
                "payload_hash": hashlib.sha256(outro_texto.encode("utf-8")).hexdigest(),
            },
        ],
        execute=["UPDATE 1"],
    )
    fonte = _fonte_com_conexao(conexao)

    reservas = asyncio.run(fonte.reservar(2))

    assert [reserva.contratada.tarefa.tarefa_id for reserva in reservas] == [
        str(outro_id)
    ]
    atualizacao = next(chamada for chamada in conexao.chamadas if chamada[0] == "execute")
    assert atualizacao[2][0] == "AGUARDANDO_CONFERENCIA"
    assert atualizacao[2][2] == "CONTRATO_INVALIDO"
    assert atualizacao[2][3] == TAREFA_ID
    assert atualizacao[2][4] == RESERVA_TOKEN


def test_reserva_json_corrompido_isola_tarefa_em_vez_de_cancelar_lote() -> None:
    texto = _payload_texto()
    outro_id = "77777777-7777-4777-8777-777777777777"
    outro_texto = texto.replace(TAREFA_ID, outro_id)
    conexao = _ConexaoFake(
        fetch=[[
            {"tarefa_id": UUID(TAREFA_ID), "reserva_token": UUID(RESERVA_TOKEN)},
            {
                "tarefa_id": UUID(outro_id),
                "reserva_token": UUID("88888888-8888-4888-8888-888888888888"),
            },
        ]],
        fetchrow=[
            {
                "payload_text": "{json-interrompido",
                "payload_hash": hashlib.sha256(b"{json-interrompido").hexdigest(),
            },
            {
                "payload_text": outro_texto,
                "payload_hash": hashlib.sha256(outro_texto.encode("utf-8")).hexdigest(),
            },
        ],
        execute=["UPDATE 1"],
    )
    fonte = _fonte_com_conexao(conexao)

    reservas = asyncio.run(fonte.reservar(2))

    assert len(reservas) == 1
    assert reservas[0].contratada.tarefa.tarefa_id == outro_id


def test_registrar_status_usa_uuid_token_lease_e_origem_permitida() -> None:
    conexao = _ConexaoFake(execute=["UPDATE 1"])
    fonte = _fonte_com_conexao(conexao)

    asyncio.run(fonte.registrar_status(TAREFA_ID, RESERVA_TOKEN, "EMITINDO"))

    _, consulta, args = conexao.chamadas[0]
    assert "reserva_token=$5::uuid" in consulta
    assert "reserva_expira_em>now()" in consulta
    assert args[0] == "EMITINDO"
    assert args[2] is None
    assert args[3] == TAREFA_ID
    assert args[4] == RESERVA_TOKEN
    assert args[5] == ["PROCESSANDO"]


def test_registrar_erro_exige_codigo_estruturado() -> None:
    fonte = _fonte_com_conexao(_ConexaoFake())

    with pytest.raises(FonteTarefasErro, match="Código de erro obrigatório"):
        asyncio.run(
            fonte.registrar_status(
                TAREFA_ID,
                RESERVA_TOKEN,
                "ERRO",
                mensagem="Falha segura.",
            )
        )


def test_registrar_status_recusa_codigo_com_caracteres_de_log() -> None:
    fonte = _fonte_com_conexao(_ConexaoFake())

    with pytest.raises(FonteTarefasErro, match="Código de erro inválido"):
        asyncio.run(
            fonte.registrar_status(
                TAREFA_ID,
                RESERVA_TOKEN,
                "ERRO",
                mensagem="Falha segura.",
                codigo_erro="ERRO\nFORJADO",
            )
        )


@pytest.mark.parametrize(
    ("tarefa_id", "token"),
    [("invalido", RESERVA_TOKEN), (TAREFA_ID, "token-invalido")],
)
def test_registrar_status_recusa_identificador_ou_token_nao_uuid(
    tarefa_id: str,
    token: str,
) -> None:
    fonte = _fonte_com_conexao(_ConexaoFake())

    with pytest.raises(FonteTarefasErro, match="Identificador de reserva inválido"):
        asyncio.run(fonte.registrar_status(tarefa_id, token, "EMITINDO"))


def test_registrar_status_e_idempotente_apos_resposta_perdida() -> None:
    conexao = _ConexaoFake(
        execute=["UPDATE 0"],
        fetchrow=[{"status": "EMITIDA", "reserva_token": UUID(RESERVA_TOKEN)}],
    )
    fonte = _fonte_com_conexao(conexao)

    asyncio.run(fonte.registrar_status(TAREFA_ID, RESERVA_TOKEN, "EMITIDA"))

    assert [chamada[0] for chamada in conexao.chamadas] == ["execute", "fetchrow"]


def test_registrar_status_recusa_token_obsoleto() -> None:
    conexao = _ConexaoFake(
        execute=["UPDATE 0"],
        fetchrow=[{"status": "EMITINDO", "reserva_token": UUID(int=0)}],
    )
    fonte = _fonte_com_conexao(conexao)

    with pytest.raises(FonteTarefasErro, match="reserva ativa"):
        asyncio.run(fonte.registrar_status(TAREFA_ID, RESERVA_TOKEN, "EMITIDA"))


@pytest.mark.parametrize("status", ["PENDENTE", "PROCESSANDO", "CANCELADA", "INVENTADO"])
def test_registrar_status_publico_recusa_transicao_nao_permitida(status: str) -> None:
    fonte = _fonte_com_conexao(_ConexaoFake())

    with pytest.raises(FonteTarefasErro, match="Transição de status"):
        asyncio.run(fonte.registrar_status(TAREFA_ID, RESERVA_TOKEN, status))


@pytest.mark.parametrize("mensagem", ["x" * 301, "linha 1\nlinha 2", "linha 1\rlinha 2"])
def test_status_recusa_mensagem_que_pode_vazar_ou_forjar_log(mensagem: str) -> None:
    fonte = _fonte_com_conexao(_ConexaoFake())

    with pytest.raises(FonteTarefasErro, match="Mensagem de resultado inválida"):
        asyncio.run(
            fonte.registrar_status(
                TAREFA_ID,
                RESERVA_TOKEN,
                "ERRO",
                mensagem=mensagem,
            )
        )


def test_devolver_validacao_libera_token_e_restitui_tentativa() -> None:
    conexao = _ConexaoFake(execute=["UPDATE 1"])
    fonte = _fonte_com_conexao(conexao)

    asyncio.run(fonte.devolver_pendente_sem_processar(TAREFA_ID, RESERVA_TOKEN))

    _, consulta, args = conexao.chamadas[0]
    assert "status='PENDENTE'" in consulta
    assert "reserva_token=NULL" in consulta
    assert "tentativas=GREATEST(tentativas-1,0)" in consulta
    assert "status='PROCESSANDO'" in consulta
    assert args[1:] == (TAREFA_ID, RESERVA_TOKEN)


def test_devolver_validacao_e_idempotente_quando_ja_pendente() -> None:
    conexao = _ConexaoFake(execute=["UPDATE 0"], fetchval=["PENDENTE"])
    fonte = _fonte_com_conexao(conexao)

    asyncio.run(fonte.devolver_pendente_sem_processar(TAREFA_ID, RESERVA_TOKEN))

    assert [chamada[0] for chamada in conexao.chamadas] == ["execute", "fetchval"]


@pytest.mark.parametrize("lease_segundos", [0, 59, 3601, 100_000])
def test_renovacao_recusa_duracao_fora_do_limite(lease_segundos: int) -> None:
    fonte = _fonte_com_conexao(_ConexaoFake())

    with pytest.raises(FonteTarefasErro, match="Duração da reserva inválida"):
        asyncio.run(
            fonte.renovar_reserva(
                TAREFA_ID,
                RESERVA_TOKEN,
                lease_segundos=lease_segundos,
            )
        )


def test_renovacao_exige_token_lease_ativo_e_status_em_processamento() -> None:
    conexao = _ConexaoFake(execute=["UPDATE 1"])
    fonte = _fonte_com_conexao(conexao)

    asyncio.run(
        fonte.renovar_reserva(TAREFA_ID, RESERVA_TOKEN, lease_segundos=600)
    )

    _, consulta, args = conexao.chamadas[0]
    assert "reserva_token=$3::uuid" in consulta
    assert "reserva_expira_em>now()" in consulta
    assert args == (600, TAREFA_ID, RESERVA_TOKEN, ["PROCESSANDO", "EMITINDO"])


@pytest.mark.parametrize(
    ("chave", "numero", "protocolo"),
    [
        ("1" * 43, "1", "1"),
        ("x" * 44, "1", "1"),
        ("1" * 44, "", "1"),
        ("1" * 44, "1" * 21, "1"),
        ("1" * 44, "1", ""),
        ("1" * 44, "1", "1" * 31),
    ],
)
def test_autorizacao_recusa_metadados_fiscais_invalidos(
    chave: str,
    numero: str,
    protocolo: str,
) -> None:
    fonte = _fonte_com_conexao(_ConexaoFake())

    with pytest.raises(FonteTarefasErro, match="inválida"):
        asyncio.run(
            fonte.registrar_emissao_autorizada(
                TAREFA_ID,
                RESERVA_TOKEN,
                chave_acesso=chave,
                numero=numero,
                protocolo=protocolo,
            )
        )


def test_autorizacao_atualiza_tarefa_e_insere_nota_na_mesma_transacao() -> None:
    conexao = _ConexaoFake(
        fetchrow=[{"cliente_id": UUID(CLIENTE_ID), "valor_total": "125.50"}],
        execute=["INSERT 0 1"],
    )
    fonte = _fonte_com_conexao(conexao)
    chave = "1" * 44

    asyncio.run(
        fonte.registrar_emissao_autorizada(
            TAREFA_ID,
            RESERVA_TOKEN,
            chave_acesso=chave,
            numero="123",
            protocolo="456789",
        )
    )

    assert conexao.transacao_fake.entrou is True
    assert conexao.transacao_fake.saiu is True
    assert conexao.transacao_fake.tipo_excecao is None
    atualizacao, insercao = conexao.chamadas
    assert atualizacao[0] == "fetchrow"
    assert "status='EMITIDA'" in atualizacao[1]
    assert "status='EMITINDO'" in atualizacao[1]
    assert atualizacao[2] == (TAREFA_ID, RESERVA_TOKEN)
    assert insercao[0] == "execute"
    assert "ON CONFLICT (tarefa_id) DO NOTHING" in insercao[1]
    assert insercao[2][0] == TAREFA_ID
    assert insercao[2][2:5] == ("123", chave, "456789")


def test_autorizacao_repetida_com_mesmos_metadados_e_idempotente() -> None:
    chave = "1" * 44
    conexao = _ConexaoFake(
        fetchrow=[
            None,
            {
                "status": "EMITIDA",
                "chave_acesso": chave,
                "numero": "123",
                "protocolo_autorizacao": "456789",
            },
        ]
    )
    fonte = _fonte_com_conexao(conexao)

    asyncio.run(
        fonte.registrar_emissao_autorizada(
            TAREFA_ID,
            RESERVA_TOKEN,
            chave_acesso=chave,
            numero="123",
            protocolo="456789",
        )
    )

    assert conexao.transacao_fake.tipo_excecao is None
    assert [chamada[0] for chamada in conexao.chamadas] == ["fetchrow", "fetchrow"]


def test_autorizacao_repetida_recusa_protocolo_divergente() -> None:
    chave = "1" * 44
    conexao = _ConexaoFake(
        fetchrow=[
            None,
            {
                "status": "EMITIDA",
                "chave_acesso": chave,
                "numero": "123",
                "protocolo_autorizacao": "456789",
            },
        ]
    )
    fonte = _fonte_com_conexao(conexao)

    with pytest.raises(FonteTarefasErro, match="reserva ativa"):
        asyncio.run(
            fonte.registrar_emissao_autorizada(
                TAREFA_ID,
                RESERVA_TOKEN,
                chave_acesso=chave,
                numero="123",
                protocolo="999999",
            )
        )

    assert conexao.transacao_fake.tipo_excecao is FonteTarefasErro


def test_conflito_na_insercao_da_nota_aborta_transacao() -> None:
    conexao = _ConexaoFake(
        fetchrow=[{"cliente_id": UUID(CLIENTE_ID), "valor_total": "125.50"}],
        execute=["INSERT 0 0"],
    )
    fonte = _fonte_com_conexao(conexao)

    with pytest.raises(FonteTarefasErro, match="outro registro de nota"):
        asyncio.run(
            fonte.registrar_emissao_autorizada(
                TAREFA_ID,
                RESERVA_TOKEN,
                chave_acesso="1" * 44,
                numero="123",
                protocolo="456789",
            )
        )

    assert conexao.transacao_fake.tipo_excecao is FonteTarefasErro


def test_documentos_armazenados_atualizam_nota_e_tarefa_atomicamente() -> None:
    pdf = f"notas/{TAREFA_ID}/danfe-{'a' * 64}.pdf"
    xml = f"notas/{TAREFA_ID}/xml-{'b' * 64}.xml"
    conexao = _ConexaoFake(
        fetchrow=[{
            "status": "EMITIDA",
            "reserva_token": UUID(RESERVA_TOKEN),
            "pdf_path": None,
            "xml_path": None,
        }],
        execute=["UPDATE 1", "UPDATE 1"],
    )
    fonte = _fonte_com_conexao(conexao)

    asyncio.run(
        fonte.registrar_documentos_armazenados(
            TAREFA_ID,
            RESERVA_TOKEN,
            pdf_path=pdf,
            xml_path=xml,
            retencao_dias=365,
        )
    )

    assert conexao.transacao_fake.tipo_excecao is None
    assert "FOR UPDATE OF t,n" in conexao.chamadas[0][1]
    assert "documento_expira_em" in conexao.chamadas[1][1]
    assert "DOCUMENTOS_ARMAZENADOS" in conexao.chamadas[2][1]


def test_documentos_armazenados_recusam_caminho_de_outra_tarefa() -> None:
    fonte = _fonte_com_conexao(_ConexaoFake())
    outro_id = "77777777-7777-4777-8777-777777777777"

    with pytest.raises(FonteTarefasErro, match="DANFE"):
        asyncio.run(
            fonte.registrar_documentos_armazenados(
                TAREFA_ID,
                RESERVA_TOKEN,
                pdf_path=f"notas/{outro_id}/danfe-{'a' * 64}.pdf",
                xml_path=f"notas/{TAREFA_ID}/xml-{'b' * 64}.xml",
                retencao_dias=365,
            )
        )


def test_reserva_documentos_expirados_usa_skip_locked_e_token() -> None:
    nota_id = "77777777-7777-4777-8777-777777777777"
    pdf = f"notas/{TAREFA_ID}/danfe-{'a' * 64}.pdf"
    xml = f"notas/{TAREFA_ID}/xml-{'b' * 64}.xml"
    conexao = _ConexaoFake(fetch=[[
        {
            "id": UUID(nota_id),
            "tarefa_id": UUID(TAREFA_ID),
            "pdf_path": pdf,
            "xml_path": xml,
            "limpeza_reserva_token": UUID(RESERVA_TOKEN),
        }
    ]])
    fonte = _fonte_com_conexao(conexao)

    reservados = asyncio.run(fonte.reservar_documentos_expirados())

    assert reservados == [
        DocumentoExpiradoReservado(nota_id, TAREFA_ID, pdf, xml, RESERVA_TOKEN)
    ]
    consulta = conexao.chamadas[0][1]
    assert "FOR UPDATE SKIP LOCKED" in consulta
    assert "limpeza_reserva_token" in consulta


def test_conclusao_limpeza_exige_token_e_preserva_historico() -> None:
    documento = DocumentoExpiradoReservado(
        "77777777-7777-4777-8777-777777777777",
        TAREFA_ID,
        f"notas/{TAREFA_ID}/danfe-{'a' * 64}.pdf",
        f"notas/{TAREFA_ID}/xml-{'b' * 64}.xml",
        RESERVA_TOKEN,
    )
    conexao = _ConexaoFake(execute=["UPDATE 1"])
    fonte = _fonte_com_conexao(conexao)

    asyncio.run(fonte.concluir_limpeza_documentos(documento))

    consulta = conexao.chamadas[0][1]
    assert "pdf_path=NULL" in consulta
    assert "xml_path=NULL" in consulta
    assert "limpeza_reserva_token=$3::uuid" in consulta


def test_limpeza_rejeita_limite_inseguro() -> None:
    fonte = _fonte_com_conexao(_ConexaoFake())

    with pytest.raises(FonteTarefasErro, match="Limite de limpeza"):
        asyncio.run(fonte.reservar_documentos_expirados(101))


def test_reserva_recuperacao_usa_snapshot_imutavel_e_skip_locked() -> None:
    texto = _payload_texto()
    linha = {
        "recuperacao_id": RECUPERACAO_ID,
        "nota_id": NOTA_ID,
        "reserva_token": RESERVA_TOKEN,
        "tarefa_id": TAREFA_ID,
        "chave_acesso": "1" * 44,
        "numero": "123",
        "payload_text": texto,
        "payload_hash": hashlib.sha256(texto.encode("utf-8")).hexdigest(),
    }
    conexao = _ConexaoFake(fetch=[[linha]])
    fonte = _fonte_com_conexao(conexao)

    recuperacoes = asyncio.run(fonte.reservar_recuperacoes_documentos(3))

    assert len(recuperacoes) == 1
    assert recuperacoes[0].recuperacao_id == RECUPERACAO_ID
    assert recuperacoes[0].contratada.tarefa.tarefa_id == TAREFA_ID
    consulta = conexao.chamadas[0][1]
    assert "FOR UPDATE OF r,n SKIP LOCKED" in consulta
    assert "n.pdf_path IS NULL AND n.xml_path IS NULL" in consulta
    assert "payload_worker::text" in consulta


def test_conclusao_recuperacao_publica_par_por_exatamente_sete_dias() -> None:
    texto = _payload_texto()
    contratada = carregar_contrato_tarefa(json.loads(texto))
    recuperacao = RecuperacaoDocumentoReservada(
        RECUPERACAO_ID,
        NOTA_ID,
        TAREFA_ID,
        "1" * 44,
        "123",
        contratada,
        RESERVA_TOKEN,
    )
    pdf = f"notas/{TAREFA_ID}/danfe-{'a' * 64}.pdf"
    xml = f"notas/{TAREFA_ID}/xml-{'b' * 64}.xml"
    conexao = _ConexaoFake(execute=["UPDATE 1", "UPDATE 1"])
    fonte = _fonte_com_conexao(conexao)

    asyncio.run(
        fonte.concluir_recuperacao_documentos(
            recuperacao,
            pdf_path=pdf,
            xml_path=xml,
            retencao_dias=7,
        )
    )

    assert conexao.chamadas[0][2][5] == 7
    assert "r.reserva_token=$7::uuid" in conexao.chamadas[0][1]
    assert "status='CONCLUIDA'" in conexao.chamadas[1][1]

    with pytest.raises(FonteTarefasErro, match="7 dias"):
        asyncio.run(
            fonte.concluir_recuperacao_documentos(
                recuperacao,
                pdf_path=pdf,
                xml_path=xml,
                retencao_dias=30,
            )
        )


def test_limpeza_nao_e_bloqueada_por_pedido_de_recuperacao_pendente() -> None:
    conexao = _ConexaoFake(fetch=[[]])
    fonte = _fonte_com_conexao(conexao)

    asyncio.run(fonte.reservar_documentos_expirados())

    consulta = conexao.chamadas[0][1]
    assert "recuperacoes_documentos" not in consulta


def test_pool_e_criado_com_tls_e_fechado(monkeypatch: pytest.MonkeyPatch) -> None:
    argumentos: dict[str, Any] = {}

    class PoolFake:
        fechado = False

        async def close(self) -> None:
            self.fechado = True

    pool = PoolFake()

    async def create_pool(*args: Any, **kwargs: Any) -> PoolFake:
        argumentos["args"] = args
        argumentos["kwargs"] = kwargs
        return pool

    monkeypatch.setitem(sys.modules, "asyncpg", SimpleNamespace(create_pool=create_pool))
    fonte = FontePostgresTarefas("postgresql://fila", "worker-teste")

    async def ciclo() -> None:
        async with fonte:
            assert fonte._pool is pool

    asyncio.run(ciclo())

    assert argumentos["args"] == ("postgresql://fila",)
    assert argumentos["kwargs"]["ssl"] == "require"
    assert argumentos["kwargs"]["statement_cache_size"] == 0
    assert argumentos["kwargs"]["min_size"] == 1
    assert argumentos["kwargs"]["max_size"] == 4
    assert pool.fechado is True
    assert fonte._pool is None


def test_conexao_curta_tambem_exige_tls_e_fecha(monkeypatch: pytest.MonkeyPatch) -> None:
    argumentos: dict[str, Any] = {}

    class ConexaoCurtaFake:
        fechada = False

        async def close(self) -> None:
            self.fechada = True

    conexao = ConexaoCurtaFake()

    async def connect(*args: Any, **kwargs: Any) -> ConexaoCurtaFake:
        argumentos["args"] = args
        argumentos["kwargs"] = kwargs
        return conexao

    monkeypatch.setitem(sys.modules, "asyncpg", SimpleNamespace(connect=connect))
    fonte = FontePostgresTarefas("postgresql://fila", "worker-teste")

    async def usar_conexao() -> None:
        async with fonte._conexao() as recebida:
            assert recebida is conexao

    asyncio.run(usar_conexao())

    assert argumentos["args"] == ("postgresql://fila",)
    assert argumentos["kwargs"]["ssl"] == "require"
    assert argumentos["kwargs"]["statement_cache_size"] == 0
    assert conexao.fechada is True
