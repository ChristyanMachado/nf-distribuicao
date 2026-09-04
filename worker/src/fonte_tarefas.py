"""Fila PostgreSQL Web -> Worker com reserva exclusiva e contrato validado."""
from __future__ import annotations

from dataclasses import dataclass
from contextlib import asynccontextmanager
import hashlib
import hmac
import json
import re
from typing import Any, Mapping
from uuid import UUID, uuid4

from .contrato_tarefa import ContratoTarefaInvalido, TarefaContratada, carregar_contrato_tarefa
from .storage_documentos import caminho_storage_valido


class FonteTarefasErro(RuntimeError):
    """Falha sanitizada de conexão, reserva ou projeção da fila."""


@dataclass(frozen=True)
class TarefaReservada:
    contratada: TarefaContratada
    reserva_token: str


@dataclass(frozen=True)
class DocumentoExpiradoReservado:
    """Documento bloqueado para limpeza física no Storage."""

    nota_id: str
    tarefa_id: str
    pdf_path: str
    xml_path: str
    reserva_token: str


@dataclass(frozen=True)
class RecuperacaoDocumentoReservada:
    """Consulta histórica isolada, vinculada ao snapshot da emissão original."""

    recuperacao_id: str
    nota_id: str
    tarefa_id: str
    chave_acesso: str
    numero: str
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
                            "CONTRATO_INVALIDO",
                        )
                return resultado
        except FonteTarefasErro:
            raise
        except Exception as exc:
            raise FonteTarefasErro("Não foi possível reservar tarefas no banco.") from exc

    async def obter_janela_emissao(self) -> tuple[int, int]:
        """Carrega a preferência operacional sem conceder escrita ao Worker."""

        try:
            async with self._conexao() as conexao:
                linha = await conexao.fetchrow(
                    """SELECT emissao_inicio_hora, emissao_fim_hora
                       FROM fiscal.configuracoes_operacionais
                       WHERE id = TRUE"""
                )
            if linha is None:
                raise FonteTarefasErro("A janela de emissão não está configurada.")
            inicio = int(linha["emissao_inicio_hora"])
            fim = int(linha["emissao_fim_hora"])
            if not 0 <= inicio <= 23 or not 0 <= fim <= 23 or inicio == fim:
                raise FonteTarefasErro("A janela de emissão configurada é inválida.")
            return inicio, fim
        except FonteTarefasErro:
            raise
        except Exception as exc:
            raise FonteTarefasErro("Não foi possível carregar a janela de emissão.") from exc

    async def registrar_status(
        self,
        tarefa_id: str,
        reserva_token: str,
        status: str,
        *,
        mensagem: str | None = None,
        codigo_erro: str | None = None,
    ) -> None:
        try:
            async with self._conexao() as conexao:
                await self._registrar_status_conexao(
                    conexao,
                    tarefa_id,
                    reserva_token,
                    status,
                    mensagem,
                    codigo_erro,
                )
        except FonteTarefasErro:
            raise
        except Exception as exc:
            raise FonteTarefasErro("Não foi possível registrar o status no banco.") from exc

    async def _registrar_status_conexao(
        self,
        conexao: Any,
        tarefa_id: str,
        reserva_token: str,
        status: str,
        mensagem: str | None,
        codigo_erro: str | None = None,
    ) -> None:
        if status not in {"AGUARDANDO_CONFERENCIA", "EMITINDO", "EMITIDA", "ERRO"}:
            raise FonteTarefasErro("Transição de status não permitida.")
        if mensagem and (len(mensagem) > 300 or "\n" in mensagem or "\r" in mensagem):
            raise FonteTarefasErro("Mensagem de resultado inválida.")
        if codigo_erro and not re.fullmatch(r"[A-Z][A-Z0-9_]{2,63}", codigo_erro):
            raise FonteTarefasErro("Código de erro inválido.")
        if status in {"ERRO", "AGUARDANDO_CONFERENCIA"} and not codigo_erro:
            raise FonteTarefasErro("Código de erro obrigatório para esta transição.")
        if status not in {"ERRO", "AGUARDANDO_CONFERENCIA"} and codigo_erro:
            raise FonteTarefasErro("Código de erro não permitido para esta transição.")
        origens = {
            "AGUARDANDO_CONFERENCIA": ("PROCESSANDO", "EMITINDO"),
            "EMITINDO": ("PROCESSANDO",),
            "EMITIDA": ("EMITINDO",),
            "ERRO": ("PROCESSANDO",),
        }[status]
        alteradas = await conexao.execute(
            """UPDATE fiscal.tarefas SET status=$1::text::fiscal.status_tarefa, mensagem_status=$2,
               codigo_erro=$3,
               ultimo_erro=CASE WHEN $1::text='ERRO' THEN $2 ELSE NULL END,
               concluido_em=CASE WHEN $1::text IN ('EMITIDA','ERRO') THEN now() ELSE concluido_em END,
               reserva_expira_em=CASE WHEN $1::text='EMITINDO' THEN reserva_expira_em ELSE NULL END,
               atualizado_em=now()
               WHERE id=$4::uuid AND reserva_token=$5::uuid AND reserva_expira_em>now()
                 AND status::text=ANY($6::text[])""",
            status,
            mensagem,
            codigo_erro,
            str(_uuid(tarefa_id)),
            str(_uuid(reserva_token)),
            list(origens),
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
                           mensagem_status=$1, ultimo_erro=NULL, codigo_erro=NULL,
                           atualizado_em=now()
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
                               codigo_erro=NULL,
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

    async def registrar_documentos_armazenados(
        self,
        tarefa_id: str,
        reserva_token: str,
        *,
        pdf_path: str,
        xml_path: str,
        retencao_dias: int,
    ) -> None:
        """Associa objetos imutáveis à nota já autorizada, com token fencing."""

        tarefa_uuid = str(_uuid(tarefa_id))
        token_uuid = str(_uuid(reserva_token))
        if not caminho_storage_valido(pdf_path, tarefa_uuid, "danfe"):
            raise FonteTarefasErro("Caminho do DANFE no Storage é inválido.")
        if not caminho_storage_valido(xml_path, tarefa_uuid, "xml"):
            raise FonteTarefasErro("Caminho do XML no Storage é inválido.")
        if not 30 <= retencao_dias <= 365:
            raise FonteTarefasErro("Retenção dos documentos é inválida.")

        try:
            async with self._conexao() as conexao:
                async with conexao.transaction():
                    atual = await conexao.fetchrow(
                        """SELECT t.status,t.reserva_token,n.pdf_path,n.xml_path
                           FROM fiscal.tarefas t
                           JOIN fiscal.notas n ON n.tarefa_id=t.id
                           WHERE t.id=$1::uuid
                           FOR UPDATE OF t,n""",
                        tarefa_uuid,
                    )
                    if (
                        atual is None
                        or str(atual["reserva_token"]) != token_uuid
                        or atual["status"] not in {"EMITIDA", "DOCUMENTOS_ARMAZENADOS"}
                    ):
                        raise FonteTarefasErro(
                            "A nota autorizada não pertence à reserva informada."
                        )
                    caminhos_atuais = (atual["pdf_path"], atual["xml_path"])
                    if caminhos_atuais not in {(None, None), (pdf_path, xml_path)}:
                        raise FonteTarefasErro(
                            "A nota já possui outros documentos armazenados."
                        )

                    nota = await conexao.execute(
                        """UPDATE fiscal.notas
                           SET pdf_path=$2,xml_path=$3,
                               documento_expira_em=now()+make_interval(days=>$4)
                           WHERE tarefa_id=$1::uuid
                             AND (pdf_path IS NULL OR pdf_path=$2)
                             AND (xml_path IS NULL OR xml_path=$3)""",
                        tarefa_uuid,
                        pdf_path,
                        xml_path,
                        retencao_dias,
                    )
                    tarefa = await conexao.execute(
                        """UPDATE fiscal.tarefas
                           SET status='DOCUMENTOS_ARMAZENADOS',
                               mensagem_status='Autorizada; XML e DANFE disponíveis.',
                               ultimo_erro=NULL,codigo_erro=NULL,atualizado_em=now()
                           WHERE id=$1::uuid AND reserva_token=$2::uuid
                             AND status IN ('EMITIDA','DOCUMENTOS_ARMAZENADOS')""",
                        tarefa_uuid,
                        token_uuid,
                    )
                    if nota != "UPDATE 1" or tarefa != "UPDATE 1":
                        raise FonteTarefasErro(
                            "Não foi possível associar os documentos à nota autorizada."
                        )
        except FonteTarefasErro:
            raise
        except Exception as exc:
            raise FonteTarefasErro(
                "Não foi possível registrar os documentos armazenados."
            ) from exc

    async def reservar_recuperacoes_documentos(
        self,
        limite: int = 3,
        lease_segundos: int = 900,
    ) -> list[RecuperacaoDocumentoReservada]:
        """Reserva consultas seguras sem reabrir a tarefa de emissão.

        Somente notas cujos objetos já foram removidos pela limpeza são
        elegíveis. Isso impede disputa e arquivos órfãos no Storage.
        """

        if not 1 <= limite <= 20:
            raise FonteTarefasErro("Limite de recuperação é inválido.")
        if not 60 <= lease_segundos <= 3600:
            raise FonteTarefasErro("Lease de recuperação é inválido.")
        token = str(uuid4())
        try:
            async with self._conexao() as conexao:
                async with conexao.transaction():
                    linhas = await conexao.fetch(
                        """WITH candidatas AS (
                               SELECT r.id
                               FROM fiscal.recuperacoes_documentos r
                               JOIN fiscal.notas n ON n.id=r.nota_id
                               WHERE (
                                   r.status='PENDENTE'
                                   OR (r.status='PROCESSANDO' AND r.reserva_expira_em<now())
                                 )
                                 AND n.status='AUTORIZADA'
                                 AND n.pdf_path IS NULL AND n.xml_path IS NULL
                                 AND n.chave_acesso ~ '^[0-9]{44}$'
                                 AND n.numero ~ '^[0-9]{1,20}$'
                                 AND (
                                   n.limpeza_reserva_expira_em IS NULL
                                   OR n.limpeza_reserva_expira_em<now()
                                 )
                               ORDER BY r.solicitada_em,r.id
                               LIMIT $1
                               FOR UPDATE OF r,n SKIP LOCKED
                           ), reservadas AS (
                               UPDATE fiscal.recuperacoes_documentos r
                               SET status='PROCESSANDO',reservada_por=$2,
                                   reserva_token=$3::uuid,
                                   reserva_expira_em=now()+make_interval(secs=>$4),
                                   tentativas=r.tentativas+1,iniciada_em=now(),
                                   concluida_em=NULL,codigo_erro=NULL,
                                   mensagem_status='Consultando documentos no portal fiscal.',
                                   atualizado_em=now()
                               FROM candidatas c
                               WHERE r.id=c.id
                               RETURNING r.id,r.nota_id,r.reserva_token
                           )
                           SELECT r.id AS recuperacao_id,r.nota_id,r.reserva_token,
                                  n.tarefa_id,n.chave_acesso,n.numero,
                                  t.payload_worker::text AS payload_text,t.payload_hash
                           FROM reservadas r
                           JOIN fiscal.notas n ON n.id=r.nota_id
                           JOIN fiscal.tarefas t ON t.id=n.tarefa_id""",
                        limite,
                        self.worker_id,
                        token,
                        lease_segundos,
                    )
        except Exception as exc:
            raise FonteTarefasErro("Não foi possível reservar recuperações.") from exc

        resultado: list[RecuperacaoDocumentoReservada] = []
        for linha in linhas:
            recuperacao_id = str(_uuid(linha["recuperacao_id"]))
            reserva_token = str(_uuid(linha["reserva_token"]))
            try:
                nota_id = str(_uuid(linha["nota_id"]))
                tarefa_id = str(_uuid(linha["tarefa_id"]))
                chave = str(linha["chave_acesso"])
                numero = str(linha["numero"])
                texto = linha["payload_text"]
                hash_esperado = linha["payload_hash"]
                if not isinstance(texto, str) or not isinstance(hash_esperado, str):
                    raise ValueError("snapshot ausente")
                calculado = hashlib.sha256(texto.encode("utf-8")).hexdigest()
                if not hmac.compare_digest(calculado, hash_esperado):
                    raise ValueError("snapshot divergente")
                contratada = carregar_contrato_tarefa(json.loads(texto))
                if (
                    contratada.tarefa.tarefa_id != tarefa_id
                    or not re.fullmatch(r"\d{44}", chave)
                    or not re.fullmatch(r"\d{1,20}", numero)
                ):
                    raise ValueError("identificação divergente")
            except (
                ContratoTarefaInvalido,
                json.JSONDecodeError,
                KeyError,
                TypeError,
                ValueError,
                UnicodeError,
            ):
                await self.registrar_falha_recuperacao(
                    recuperacao_id,
                    reserva_token,
                    codigo_erro="DADOS_RECUPERACAO_INVALIDOS",
                    mensagem="Os dados permanentes da nota precisam de conferência técnica.",
                )
                continue
            resultado.append(
                RecuperacaoDocumentoReservada(
                    recuperacao_id=recuperacao_id,
                    nota_id=nota_id,
                    tarefa_id=tarefa_id,
                    chave_acesso=chave,
                    numero=numero,
                    contratada=contratada,
                    reserva_token=reserva_token,
                )
            )
        return resultado

    async def concluir_recuperacao_documentos(
        self,
        recuperacao: RecuperacaoDocumentoReservada,
        *,
        pdf_path: str,
        xml_path: str,
        retencao_dias: int = 7,
    ) -> None:
        """Publica os caminhos recuperados por sete dias com token fencing."""

        if retencao_dias != 7:
            raise FonteTarefasErro("A retenção de documentos recuperados deve ser de 7 dias.")
        if not caminho_storage_valido(pdf_path, recuperacao.tarefa_id, "danfe"):
            raise FonteTarefasErro("Caminho do DANFE recuperado é inválido.")
        if not caminho_storage_valido(xml_path, recuperacao.tarefa_id, "xml"):
            raise FonteTarefasErro("Caminho do XML recuperado é inválido.")
        try:
            async with self._conexao() as conexao:
                async with conexao.transaction():
                    nota = await conexao.execute(
                        """UPDATE fiscal.notas n
                           SET pdf_path=$4,xml_path=$5,
                               documento_expira_em=now()+make_interval(days=>$6),
                               limpeza_reserva_token=NULL,
                               limpeza_reserva_expira_em=NULL
                           FROM fiscal.recuperacoes_documentos r
                           WHERE n.id=$1::uuid AND n.tarefa_id=$2::uuid
                             AND n.id=r.nota_id AND r.id=$3::uuid
                             AND r.status='PROCESSANDO'
                             AND r.reserva_token=$7::uuid
                             AND r.reserva_expira_em>now()
                             AND n.pdf_path IS NULL AND n.xml_path IS NULL""",
                        recuperacao.nota_id,
                        recuperacao.tarefa_id,
                        recuperacao.recuperacao_id,
                        pdf_path,
                        xml_path,
                        retencao_dias,
                        recuperacao.reserva_token,
                    )
                    fila = await conexao.execute(
                        """UPDATE fiscal.recuperacoes_documentos
                           SET status='CONCLUIDA',reservada_por=NULL,
                               reserva_token=NULL,reserva_expira_em=NULL,
                               concluida_em=now(),codigo_erro=NULL,
                               mensagem_status='XML e DANFE recuperados por 7 dias.',
                               atualizado_em=now()
                           WHERE id=$1::uuid AND nota_id=$2::uuid
                             AND status='PROCESSANDO' AND reserva_token=$3::uuid
                             AND reserva_expira_em>now()""",
                        recuperacao.recuperacao_id,
                        recuperacao.nota_id,
                        recuperacao.reserva_token,
                    )
                    if nota != "UPDATE 1" or fila != "UPDATE 1":
                        raise FonteTarefasErro(
                            "A recuperação não pertence à reserva ativa."
                        )
        except FonteTarefasErro:
            raise
        except Exception as exc:
            raise FonteTarefasErro("Não foi possível concluir a recuperação.") from exc

    async def registrar_falha_recuperacao(
        self,
        recuperacao_id: str,
        reserva_token: str,
        *,
        codigo_erro: str,
        mensagem: str,
    ) -> None:
        if not re.fullmatch(r"[A-Z][A-Z0-9_]{2,63}", codigo_erro):
            raise FonteTarefasErro("Código de recuperação inválido.")
        if not mensagem or len(mensagem) > 300 or "\n" in mensagem or "\r" in mensagem:
            raise FonteTarefasErro("Mensagem de recuperação inválida.")
        try:
            async with self._conexao() as conexao:
                resultado = await conexao.execute(
                    """UPDATE fiscal.recuperacoes_documentos
                       SET status='ERRO',reservada_por=NULL,reserva_token=NULL,
                           reserva_expira_em=NULL,codigo_erro=$3,
                           mensagem_status=$4,concluida_em=now(),atualizado_em=now()
                       WHERE id=$1::uuid AND reserva_token=$2::uuid
                         AND status='PROCESSANDO' AND reserva_expira_em>now()""",
                    str(_uuid(recuperacao_id)),
                    str(_uuid(reserva_token)),
                    codigo_erro,
                    mensagem,
                )
                if resultado != "UPDATE 1":
                    raise FonteTarefasErro("A recuperação não pertence à reserva ativa.")
        except FonteTarefasErro:
            raise
        except Exception as exc:
            raise FonteTarefasErro("Não foi possível registrar a falha da recuperação.") from exc

    async def reservar_documentos_expirados(
        self,
        limite: int = 20,
        lease_segundos: int = 300,
    ) -> list[DocumentoExpiradoReservado]:
        """Reserva documentos vencidos com ``SKIP LOCKED`` para limpeza.

        A reserva fica na própria nota, com token aleatório e lease curto. Ela
        evita concorrência entre Workers sem travar a operação fiscal.
        """

        if not 1 <= limite <= 100:
            raise FonteTarefasErro("Limite de limpeza de documentos é inválido.")
        if not 30 <= lease_segundos <= 3600:
            raise FonteTarefasErro("Lease de limpeza de documentos é inválido.")
        token = str(uuid4())
        try:
            async with self._conexao() as conexao:
                async with conexao.transaction():
                    linhas = await conexao.fetch(
                        """WITH candidatas AS (
                               SELECT id
                               FROM fiscal.notas
                               WHERE documento_expira_em <= now()
                                 AND pdf_path IS NOT NULL AND xml_path IS NOT NULL
                                 AND (
                                   limpeza_reserva_expira_em IS NULL
                                   OR limpeza_reserva_expira_em < now()
                                 )
                               ORDER BY documento_expira_em,id
                               LIMIT $1
                               FOR UPDATE SKIP LOCKED
                           )
                           UPDATE fiscal.notas AS n
                           SET limpeza_reserva_token=$2::uuid,
                               limpeza_reserva_expira_em=now()+make_interval(secs=>$3)
                           FROM candidatas
                           WHERE n.id=candidatas.id
                           RETURNING n.id,n.tarefa_id,n.pdf_path,n.xml_path,
                                     n.limpeza_reserva_token""",
                        limite,
                        token,
                        lease_segundos,
                    )
        except Exception as exc:
            raise FonteTarefasErro("Não foi possível reservar documentos vencidos.") from exc

        reservados: list[DocumentoExpiradoReservado] = []
        for linha in linhas:
            try:
                nota_id = str(_uuid(linha["id"]))
                tarefa_id = str(_uuid(linha["tarefa_id"]))
                pdf_path = str(linha["pdf_path"])
                xml_path = str(linha["xml_path"])
                reserva_token = str(_uuid(linha["limpeza_reserva_token"]))
            except (KeyError, TypeError, ValueError) as exc:
                raise FonteTarefasErro("Reserva de documento vencido é inválida.") from exc
            if not (
                caminho_storage_valido(pdf_path, tarefa_id, "danfe")
                and caminho_storage_valido(xml_path, tarefa_id, "xml")
            ):
                raise FonteTarefasErro("Documento vencido possui caminho inválido.")
            reservados.append(
                DocumentoExpiradoReservado(
                    nota_id=nota_id,
                    tarefa_id=tarefa_id,
                    pdf_path=pdf_path,
                    xml_path=xml_path,
                    reserva_token=reserva_token,
                )
            )
        return reservados

    async def concluir_limpeza_documentos(
        self,
        documento: DocumentoExpiradoReservado,
    ) -> None:
        """Remove referências somente após o Storage confirmar a exclusão."""

        try:
            async with self._conexao() as conexao:
                resultado = await conexao.execute(
                    """UPDATE fiscal.notas
                       SET pdf_path=NULL,xml_path=NULL,documento_expira_em=NULL,
                           limpeza_reserva_token=NULL,limpeza_reserva_expira_em=NULL
                       WHERE id=$1::uuid AND tarefa_id=$2::uuid
                         AND limpeza_reserva_token=$3::uuid
                         AND pdf_path=$4 AND xml_path=$5
                         AND documento_expira_em <= now()""",
                    documento.nota_id,
                    documento.tarefa_id,
                    documento.reserva_token,
                    documento.pdf_path,
                    documento.xml_path,
                )
                if resultado != "UPDATE 1":
                    raise FonteTarefasErro("Documento vencido não pertence à reserva ativa.")
        except FonteTarefasErro:
            raise
        except Exception as exc:
            raise FonteTarefasErro("Não foi possível concluir a limpeza de documentos.") from exc

    async def liberar_limpeza_documentos(
        self,
        documento: DocumentoExpiradoReservado,
    ) -> None:
        """Libera a nota após falha, preservando referências para nova tentativa."""

        try:
            async with self._conexao() as conexao:
                await conexao.execute(
                    """UPDATE fiscal.notas
                       SET limpeza_reserva_token=NULL,limpeza_reserva_expira_em=NULL
                       WHERE id=$1::uuid AND limpeza_reserva_token=$2::uuid""",
                    documento.nota_id,
                    documento.reserva_token,
                )
        except Exception as exc:
            raise FonteTarefasErro("Não foi possível liberar a limpeza de documentos.") from exc


def _uuid(valor: str) -> UUID:
    if isinstance(valor, UUID):
        return valor
    try:
        return UUID(valor)
    except (ValueError, TypeError) as exc:
        raise FonteTarefasErro("Identificador de reserva inválido.") from exc
