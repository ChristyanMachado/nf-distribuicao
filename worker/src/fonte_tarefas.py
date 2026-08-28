"""Fila PostgreSQL Web -> Worker com reserva exclusiva e contrato validado."""
from __future__ import annotations

from dataclasses import dataclass
from contextlib import asynccontextmanager
import hashlib
import hmac
import json
import re
from typing import Any, Mapping
from uuid import UUID

from .contrato_tarefa import ContratoTarefaInvalido, TarefaContratada, carregar_contrato_tarefa


class FonteTarefasErro(RuntimeError):
    """Falha sanitizada de conexão, reserva ou projeção da fila."""


@dataclass(frozen=True)
class TarefaReservada:
    contratada: TarefaContratada
    reserva_token: str


def _assinatura_operacao(item: Mapping[str, Any]) -> tuple[Any, ...]:
    return (
        item["natureza_operacao"], item["tipo_operacao"],
        item["finalidade_emissao"], item["indicador_presenca"],
        item["modalidade_frete"],
    )


def montar_payload_contrato(cabecalho: Mapping[str, Any], itens: list[Mapping[str, Any]]) -> dict[str, Any]:
    """Converte a projeção SQL em contrato v1; a validação final é centralizada."""
    if not itens:
        raise FonteTarefasErro("Tarefa reservada não possui itens.")
    regra = itens[0]
    if any(_assinatura_operacao(item) != _assinatura_operacao(regra) for item in itens):
        raise FonteTarefasErro("Itens da tarefa possuem regras operacionais incompatíveis.")
    return {
        "versaoContrato": 1,
        "ambiente": "teste",
        "tarefa": {
            "id": str(cabecalho["tarefa_id"]),
            "clienteId": str(cabecalho["cliente_id"]),
            "nomeCliente": cabecalho["cliente_nome"],
            "nomeEmitente": cabecalho["emitente_nome"],
            "numeroDistribuicao": int(cabecalho["numero_distribuicao"]),
            "emitente": {
                "id": str(cabecalho["emitente_id"]),
                "valorSelect": cabecalho["valor_select_nfpe"],
                "credencialReferencia": cabecalho["credencial_referencia"],
            },
            "destinatario": {
                "cnpj": cabecalho["cnpj"], "indicadorIe": cabecalho["indicador_ie"],
                "inscricaoEstadual": cabecalho["inscricao_estadual"],
                "razaoSocial": cabecalho["destinatario_nome"] or cabecalho["cliente_nome"],
                "cep": cabecalho["cep"], "numeroEndereco": cabecalho["numero_endereco"],
            },
            "operacao": {
                "natureza": regra["natureza_operacao"], "tipo": regra["tipo_operacao"],
                "finalidade": regra["finalidade_emissao"],
                "indicadorPresenca": regra["indicador_presenca"],
                "modalidadeFrete": regra["modalidade_frete"],
            },
            "itens": [{
                "produtoId": str(item["produto_id"]), "descricao": item["descricao"],
                "codigoFiscal": item["codigo_fiscal"], "unidade": item["unidade"],
                "quantidade": float(item["quantidade"]), "precoUnitario": float(item["preco_unitario"]),
                "cfopTexto": item["cfop_texto"], "cfopCodigo": item["cfop_codigo"],
                "situacaoTributariaIcms": item["situacao_tributaria_icms"],
                "origemMercadoria": item["origem_mercadoria"],
                "possuiBeneficioFiscal": item["possui_beneficio_fiscal"],
                "codigoBeneficioFiscal": item["codigo_beneficio_fiscal"],
            } for item in itens],
        },
    }


class FontePostgresTarefas:
    """Adaptador assíncrono; cada conclusão exige o token exato da reserva.

    Quando usado como context manager, mantém um pool pequeno durante todo o
    lote. Isso evita abrir uma conexão TLS para cada mudança de status e reduz
    a latência sem compartilhar sessão de navegador ou estado fiscal.
    """

    def __init__(self, database_url: str, worker_id: str) -> None:
        self.database_url, self.worker_id = database_url, worker_id
        self._pool: Any | None = None

    async def __aenter__(self) -> "FontePostgresTarefas":
        try:
            import asyncpg
            self._pool = await asyncpg.create_pool(
                self.database_url,
                min_size=1,
                max_size=4,
                timeout=15,
                command_timeout=30,
                ssl="require",
                # Poolers em modo transacional (como o Supavisor) não mantêm
                # prepared statements entre requisições.
                statement_cache_size=0,
            )
        except Exception as exc:
            raise FonteTarefasErro("Não foi possível conectar à fila fiscal.") from exc
        return self

    async def __aexit__(self, _tipo: Any, _valor: Any, _traceback: Any) -> None:
        if self._pool is not None:
            await self._pool.close()
            self._pool = None

    @asynccontextmanager
    async def _conexao(self):
        """Usa o pool ativo ou uma conexão TLS curta para compatibilidade."""
        try:
            import asyncpg
        except ImportError as exc:
            raise FonteTarefasErro(
                "Dependência asyncpg ausente; instale requirements.txt."
            ) from exc

        if self._pool is not None:
            async with self._pool.acquire() as conexao:
                yield conexao
            return

        conexao = await asyncpg.connect(
            self.database_url,
            timeout=15,
            command_timeout=30,
            ssl="require",
            statement_cache_size=0,
        )
        try:
            yield conexao
        finally:
            await conexao.close()

    async def reservar(self, limite: int = 1) -> list[TarefaReservada]:
        try:
            async with self._conexao() as conexao:
                reservas = await conexao.fetch(
                    "SELECT tarefa_id, reserva_token FROM fiscal.reservar_tarefas_worker($1, $2)",
                    self.worker_id, limite,
                )
                resultado: list[TarefaReservada] = []
                for reserva in reservas:
                    tarefa_id, token = reserva["tarefa_id"], str(reserva["reserva_token"])
                    try:
                        snapshot = await conexao.fetchrow(
                            """SELECT t.payload_worker::text AS payload_text,t.payload_hash FROM fiscal.tarefas t WHERE t.id=$1 AND t.status='PROCESSANDO' AND t.reserva_token=$2""",
                            tarefa_id, reserva["reserva_token"],
                        )
                        if snapshot is None:
                            raise FonteTarefasErro("Reserva não pôde ser carregada.")
                        texto = snapshot["payload_text"]
                        calculado = hashlib.sha256(texto.encode("utf-8")).hexdigest()
                        if not hmac.compare_digest(calculado, snapshot["payload_hash"]):
                            raise FonteTarefasErro("Integridade do contrato fiscal não confirmada.")
                        contratada = carregar_contrato_tarefa(json.loads(texto))
                        resultado.append(TarefaReservada(contratada, token))
                    except (
                        FonteTarefasErro,
                        ContratoTarefaInvalido,
                        json.JSONDecodeError,
                        TypeError,
                        UnicodeError,
                        KeyError,
                        AttributeError,
                    ):
                        await self._registrar_status_conexao(
                            conexao, str(tarefa_id), token, "AGUARDANDO_CONFERENCIA",
                            "Contrato fiscal incompleto ou incompatível; revise o cadastro.",
                        )
                return resultado
        except FonteTarefasErro:
            raise
        except Exception as exc:
            raise FonteTarefasErro("Não foi possível reservar tarefas no banco.") from exc

    async def registrar_status(self, tarefa_id: str, reserva_token: str, status: str, *, mensagem: str | None = None) -> None:
        try:
            async with self._conexao() as conexao:
                await self._registrar_status_conexao(conexao, tarefa_id, reserva_token, status, mensagem)
        except FonteTarefasErro:
            raise
        except Exception as exc:
            raise FonteTarefasErro("Não foi possível registrar o status no banco.") from exc

    async def _registrar_status_conexao(self, conexao: Any, tarefa_id: str, reserva_token: str, status: str, mensagem: str | None) -> None:
        if status not in {"AGUARDANDO_CONFERENCIA", "EMITINDO", "EMITIDA", "ERRO"}:
            raise FonteTarefasErro("Transição de status não permitida.")
        if mensagem and (len(mensagem) > 300 or "\n" in mensagem or "\r" in mensagem):
            raise FonteTarefasErro("Mensagem de resultado inválida.")
        origens = {
            "AGUARDANDO_CONFERENCIA": ("PROCESSANDO", "EMITINDO"),
            "EMITINDO": ("PROCESSANDO",),
            "EMITIDA": ("EMITINDO",),
            "ERRO": ("PROCESSANDO",),
        }[status]
        alteradas = await conexao.execute(
            """UPDATE fiscal.tarefas SET status=$1::text::fiscal.status_tarefa, mensagem_status=$2,
               ultimo_erro=CASE WHEN $1::text='ERRO' THEN $2 ELSE NULL END,
               concluido_em=CASE WHEN $1::text IN ('EMITIDA','ERRO') THEN now() ELSE concluido_em END,
               reserva_expira_em=CASE WHEN $1::text='EMITINDO' THEN reserva_expira_em ELSE NULL END,
               atualizado_em=now()
               WHERE id=$3::uuid AND reserva_token=$4::uuid AND reserva_expira_em>now()
                 AND status::text=ANY($5::text[])""",
            status, mensagem, str(_uuid(tarefa_id)), str(_uuid(reserva_token)), list(origens),
        )
        if alteradas == "UPDATE 1":
            return
        atual = await conexao.fetchrow(
            "SELECT status,reserva_token FROM fiscal.tarefas WHERE id=$1::uuid",
            str(_uuid(tarefa_id)),
        )
        if atual and atual["status"] == status and str(atual["reserva_token"]) == reserva_token:
            return  # repetição idempotente após resposta perdida
        raise FonteTarefasErro("Tarefa não pertence à reserva ativa.")

    async def renovar_reserva(
        self,
        tarefa_id: str,
        reserva_token: str,
        *,
        lease_segundos: int = 900,
    ) -> None:
        """Renova uma emissão longa sem permitir troca de dono da tarefa."""
        if not 60 <= lease_segundos <= 3600:
            raise FonteTarefasErro("Duração da reserva inválida.")
        try:
            async with self._conexao() as conexao:
                alteradas = await conexao.execute(
                    """UPDATE fiscal.tarefas
                       SET reserva_expira_em=now()+make_interval(secs => $1),
                           atualizado_em=now()
                       WHERE id=$2::uuid AND reserva_token=$3::uuid
                         AND reserva_expira_em>now()
                         AND status::text=ANY($4::text[])""",
                    lease_segundos,
                    str(_uuid(tarefa_id)),
                    str(_uuid(reserva_token)),
                    ["PROCESSANDO", "EMITINDO"],
                )
                if alteradas != "UPDATE 1":
                    raise FonteTarefasErro("Não foi possível renovar a reserva ativa.")
        except FonteTarefasErro:
            raise
        except Exception as exc:
            raise FonteTarefasErro("Não foi possível renovar a reserva no banco.") from exc

    async def devolver_pendente_sem_processar(
        self,
        tarefa_id: str,
        reserva_token: str,
        *,
        mensagem: str = "Contrato validado; aguardando processamento fiscal.",
    ) -> None:
        """Libera uma reserva usada apenas no ensaio do canal banco/Worker.

        Esta transição só existe antes de abrir o portal fiscal. Depois que a
        tarefa chega a EMITINDO, qualquer incerteza vai para conferência
        humana para impedir uma segunda emissão acidental.
        """
        if len(mensagem) > 300 or "\n" in mensagem or "\r" in mensagem:
            raise FonteTarefasErro("Mensagem de resultado inválida.")
        try:
            async with self._conexao() as conexao:
                alteradas = await conexao.execute(
                    """UPDATE fiscal.tarefas
                       SET status='PENDENTE', reservada_por=NULL,
                           reserva_token=NULL, reserva_expira_em=NULL,
                           tentativas=GREATEST(tentativas-1,0), iniciado_em=NULL,
                           mensagem_status=$1, atualizado_em=now()
                       WHERE id=$2::uuid AND reserva_token=$3::uuid
                         AND reserva_expira_em>now() AND status='PROCESSANDO'""",
                    mensagem,
                    str(_uuid(tarefa_id)),
                    str(_uuid(reserva_token)),
                )
                if alteradas == "UPDATE 1":
                    return
                atual = await conexao.fetchval(
                    "SELECT status FROM fiscal.tarefas WHERE id=$1::uuid",
                    str(_uuid(tarefa_id)),
                )
                if atual == "PENDENTE":
                    return
                raise FonteTarefasErro("Tarefa não pertence à reserva ativa.")
        except FonteTarefasErro:
            raise
        except Exception as exc:
            raise FonteTarefasErro("Não foi possível liberar a tarefa validada.") from exc

    async def registrar_emissao_autorizada(
        self,
        tarefa_id: str,
        reserva_token: str,
        *,
        chave_acesso: str,
        numero: str,
        protocolo: str,
    ) -> None:
        """Grava a nota e conclui a tarefa numa única transação.

        Os caminhos locais do XML/PDF não são enviados ao Web: outro
        dispositivo não conseguiria acessá-los. O upload ao Storage será uma
        etapa posterior, sem impedir que autorização e metadados apareçam já.
        """
        if not re.fullmatch(r"\d{44}", chave_acesso):
            raise FonteTarefasErro("Chave de acesso fiscal inválida.")
        if not re.fullmatch(r"\d{1,20}", numero) or not re.fullmatch(r"\d{1,30}", protocolo):
            raise FonteTarefasErro("Identificação da autorização fiscal inválida.")

        try:
            async with self._conexao() as conexao:
                async with conexao.transaction():
                    tarefa = await conexao.fetchrow(
                        """UPDATE fiscal.tarefas
                           SET status='EMITIDA', concluido_em=now(),
                               reserva_expira_em=NULL, ultimo_erro=NULL,
                               mensagem_status='Autorizada; documentos aguardam armazenamento em nuvem.',
                               atualizado_em=now()
                           WHERE id=$1::uuid AND reserva_token=$2::uuid
                             AND reserva_expira_em>now() AND status='EMITINDO'
                           RETURNING cliente_id, valor_total""",
                        str(_uuid(tarefa_id)),
                        str(_uuid(reserva_token)),
                    )
                    if tarefa is None:
                        existente = await conexao.fetchrow(
                            """SELECT t.status,n.chave_acesso,n.numero,
                                      n.protocolo_autorizacao
                               FROM fiscal.tarefas t
                               LEFT JOIN fiscal.notas n ON n.tarefa_id=t.id
                               WHERE t.id=$1::uuid AND t.reserva_token=$2::uuid""",
                            str(_uuid(tarefa_id)),
                            str(_uuid(reserva_token)),
                        )
                        if (
                            existente
                            and existente["status"] in {"EMITIDA", "DOCUMENTOS_ARMAZENADOS"}
                            and existente["chave_acesso"] == chave_acesso
                            and existente["numero"] == numero
                            and existente["protocolo_autorizacao"] == protocolo
                        ):
                            return
                        raise FonteTarefasErro("Tarefa não pertence à reserva ativa.")

                    inserida = await conexao.execute(
                        """INSERT INTO fiscal.notas
                           (tarefa_id,cliente_id,numero,chave_acesso,protocolo_autorizacao,
                            status,valor_total,data_emissao)
                           VALUES ($1::uuid,$2,$3,$4,$5,'AUTORIZADA',$6,now())
                           ON CONFLICT (tarefa_id) DO NOTHING""",
                        str(_uuid(tarefa_id)),
                        tarefa["cliente_id"],
                        numero,
                        chave_acesso,
                        protocolo,
                        tarefa["valor_total"],
                    )
                    if inserida != "INSERT 0 1":
                        raise FonteTarefasErro("A tarefa já possui outro registro de nota.")
        except FonteTarefasErro:
            raise
        except Exception as exc:
            raise FonteTarefasErro("Não foi possível registrar a nota autorizada.") from exc


def _uuid(valor: str) -> UUID:
    try:
        return UUID(valor)
    except (ValueError, TypeError) as exc:
        raise FonteTarefasErro("Identificador de reserva inválido.") from exc
