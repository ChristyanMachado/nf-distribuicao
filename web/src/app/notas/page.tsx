export const dynamic = "force-dynamic";

import { db } from "@/db";
import {
  notas,
  clientes,
  emitentes,
  tarefas,
  lotesDistribuicao,
  recuperacoesDocumentos,
  cancelamentosFiscais,
} from "@/db/schema";
import { and, count, countDistinct, desc, eq, inArray, max, ne, sql } from "drizzle-orm";
import Link from "next/link";
import Card from "@/components/Card";
import AtualizacaoAutomatica from "@/components/AtualizacaoAutomatica";
import NotaCard from "./NotaCard";
import { assinarDocumentosPrivados } from "@/lib/storage.server";
import { nomeDownloadDocumento } from "@/lib/storage-caminhos";
import { documentosDaNotaDisponiveis } from "@/lib/documentos-nota";
import {
  agruparNotasPorDistribuicao,
  normalizarVisaoNotas,
  ordenarGruposPorChaves,
  visaoDaNota,
  type VisaoNotas,
} from "@/lib/notas-visao";
import { dataIsoParaBrasil, dataOperacionalBrasil } from "@/lib/datas";

const ABAS: { id: VisaoNotas; label: string }[] = [
  { id: "ativas", label: "Ativas" },
  { id: "canceladas", label: "Canceladas" },
];

export default async function NotasPage({
  searchParams,
}: {
  searchParams: Promise<{ visao?: string; lote?: string; pagina?: string }>;
}) {
  const parametros = await searchParams;
  const visao = normalizarVisaoNotas(parametros.visao);
  const paginaSolicitada = Number(parametros.pagina ?? "1");
  const pagina = Number.isInteger(paginaSolicitada) && paginaSolicitada > 0 ? paginaSolicitada : 1;
  const DISTRIBUICOES_POR_PAGINA = 20;
  const filtroLote = parametros.lote ? eq(tarefas.loteId, parametros.lote) : undefined;
  const filtroVisao = visao === "canceladas"
    ? eq(notas.status, "CANCELADA")
    : ne(notas.status, "CANCELADA");
  const filtros = filtroLote ? and(filtroLote, filtroVisao) : filtroVisao;
  const chaveUnidade = sql<string>`case
    when ${tarefas.loteId} is not null then 'lote:' || ${tarefas.loteId}::text
    else 'legado:' || ${notas.id}::text
  end`;
  const notaMaisRecente = max(notas.criadoEm);
  const consultaUnidades = db
    .select({ chave: chaveUnidade, notaMaisRecente })
    .from(notas)
    .innerJoin(tarefas, eq(notas.tarefaId, tarefas.id))
    .where(filtros)
    .groupBy(chaveUnidade)
    .orderBy(desc(notaMaisRecente), desc(chaveUnidade))
    .limit(DISTRIBUICOES_POR_PAGINA)
    .offset((pagina - 1) * DISTRIBUICOES_POR_PAGINA);
  const consultaTotalUnidades = db
    .select({ total: countDistinct(chaveUnidade) })
    .from(notas)
    .innerJoin(tarefas, eq(notas.tarefaId, tarefas.id))
    .where(filtros);
  const consultaContagens = db
    .select({ status: notas.status, total: count() })
    .from(notas)
    .innerJoin(tarefas, eq(notas.tarefaId, tarefas.id))
    .where(filtroLote)
    .groupBy(notas.status);
  // O cliente Web mantém uma conexão com max_pipeline=1. Estas leituras são
  // deliberadamente sequenciais para não reabrir a tempestade do Supavisor.
  const unidades = await consultaUnidades;
  const totalUnidadesBruto = await consultaTotalUnidades;
  const contagensBrutas = await consultaContagens;
  const chavesPagina = unidades.map((unidade) => unidade.chave);
  const lista = chavesPagina.length === 0
    ? []
    : await db.select({
      id: notas.id,
      numero: notas.numero,
      status: notas.status,
      valorTotal: notas.valorTotal,
      dataEmissao: notas.dataEmissao,
      pdfPath: notas.pdfPath,
      xmlPath: notas.xmlPath,
      documentoExpiraEm: notas.documentoExpiraEm,
      chaveAcesso: notas.chaveAcesso,
      recuperacaoStatus: recuperacoesDocumentos.status,
      recuperacaoMensagem: recuperacoesDocumentos.mensagemStatus,
      cancelamentoStatus: cancelamentosFiscais.status,
      cancelamentoMensagem: cancelamentosFiscais.mensagemStatus,
      cancelamentoMotivo: cancelamentosFiscais.motivo,
      clienteNome: clientes.nome,
      emitenteNome: emitentes.nome,
      loteId: tarefas.loteId,
      numeroDistribuicao: lotesDistribuicao.numero,
      dataDistribuicao: lotesDistribuicao.data,
      })
      .from(notas)
      .innerJoin(clientes, eq(notas.clienteId, clientes.id))
      .innerJoin(tarefas, eq(notas.tarefaId, tarefas.id))
      .innerJoin(emitentes, eq(tarefas.emitenteId, emitentes.id))
      .leftJoin(lotesDistribuicao, eq(tarefas.loteId, lotesDistribuicao.id))
      .leftJoin(recuperacoesDocumentos, eq(recuperacoesDocumentos.notaId, notas.id))
      .leftJoin(cancelamentosFiscais, eq(cancelamentosFiscais.notaId, notas.id))
      .where(and(filtros, inArray(chaveUnidade, chavesPagina)))
      .orderBy(desc(notas.criadoEm), desc(notas.id));
  const contagens: Record<VisaoNotas, number> = { ativas: 0, canceladas: 0 };
  for (const linha of contagensBrutas) {
    contagens[visaoDaNota(linha.status)] += Number(linha.total);
  }
  const totalUnidades = Number(totalUnidadesBruto[0]?.total ?? 0);
  const totalPaginas = Math.max(1, Math.ceil(totalUnidades / DISTRIBUICOES_POR_PAGINA));
  const notasVisiveis = lista;
  const agora = new Date();
  const temOperacaoAtiva = lista.some((nota) =>
    nota.recuperacaoStatus === "PENDENTE" || nota.recuperacaoStatus === "PROCESSANDO"
    || nota.cancelamentoStatus === "PENDENTE" || nota.cancelamentoStatus === "PROCESSANDO"
  );
  const disponibilidade = new Map(
    notasVisiveis.map((nota) => [
      nota.id,
      documentosDaNotaDisponiveis(
        nota.pdfPath,
        nota.xmlPath,
        nota.documentoExpiraEm,
        agora,
      ),
    ]),
  );
  const urls = await assinarDocumentosPrivados(
    notasVisiveis.flatMap((nota) => {
      if (!disponibilidade.get(nota.id)) return [];
      const dados = {
        cliente: nota.clienteNome,
        emitente: nota.emitenteNome,
        numeroDistribuicao: nota.numeroDistribuicao,
        data: (nota.dataEmissao ? dataOperacionalBrasil(nota.dataEmissao) : null)
          ?? nota.dataDistribuicao
          ?? "",
      };
      return [
        {
          caminho: nota.pdfPath,
          nomeDownload: nomeDownloadDocumento({ tipo: "danfe", ...dados }),
        },
        {
          caminho: nota.xmlPath,
          nomeDownload: nomeDownloadDocumento({ tipo: "xml", ...dados }),
        },
      ];
    }),
  );
  const grupos = ordenarGruposPorChaves(
    agruparNotasPorDistribuicao(notasVisiveis),
    chavesPagina,
  );
  function hrefPagina(destino: number) {
    const busca = new URLSearchParams();
    if (visao !== "ativas") busca.set("visao", visao);
    if (parametros.lote) busca.set("lote", parametros.lote);
    if (destino > 1) busca.set("pagina", String(destino));
    return busca.size ? `/notas?${busca.toString()}` : "/notas";
  }

  return (
    <div>
      <h1 className="text-2xl font-medium">Notas</h1>
      <p className="mt-1 text-[15px] text-[var(--ink-soft)]">
        PDF/XML originais ficam disponíveis por 30 dias. Quando recuperados,
        ficam disponíveis por 7 dias; o histórico da nota permanece.
      </p>
      <AtualizacaoAutomatica
        ativa={temOperacaoAtiva}
        descricao="Acompanhando as operações fiscais automaticamente"
      />

      <nav
        aria-label="Situação fiscal das notas"
        className="mt-5 grid grid-cols-2 gap-1 rounded-[var(--radius-control)] bg-[var(--surface-raised)] p-1"
      >
        {ABAS.map((aba) => {
          const ativa = aba.id === visao;
          const busca = new URLSearchParams();
          if (aba.id !== "ativas") busca.set("visao", aba.id);
          if (parametros.lote) busca.set("lote", parametros.lote);
          const href = busca.size ? `/notas?${busca.toString()}` : "/notas";
          return (
            <Link
              key={aba.id}
              href={href}
              aria-current={ativa ? "page" : undefined}
              className={`tap-target flex min-h-11 items-center justify-center gap-2 rounded-[calc(var(--radius-control)-3px)] px-3 text-sm font-medium ${
                ativa
                  ? "bg-[var(--field)] text-white"
                  : "text-[var(--ink-soft)] hover:bg-[var(--field-tint)]"
              }`}
            >
              <span>{aba.label}</span>
              <span className="font-mono-tab text-[11px] opacity-75">{contagens[aba.id]}</span>
            </Link>
          );
        })}
      </nav>

      {parametros.lote && (
        <p className="mt-3 text-sm text-[var(--ink-soft)]">
          Exibindo somente os documentos desta distribuição. <Link className="font-medium underline" href={visao === "ativas" ? "/notas" : "/notas?visao=canceladas"}>Ver todas</Link>
        </p>
      )}

      <div className="mt-5 space-y-4">
        {grupos.map((grupo) => (
          <section key={grupo.chave} aria-label={grupo.numeroDistribuicao ? `Distribuição ${grupo.numeroDistribuicao}` : "Nota antiga"}>
            <div className="mb-2 flex items-end justify-between gap-3 px-1">
              <div>
                <p className="font-mono-tab text-[11px] font-bold uppercase tracking-widest text-[var(--ink-faint)]">
                  {grupo.numeroDistribuicao
                    ? `Distribuição ${String(grupo.numeroDistribuicao).padStart(6, "0")}`
                    : "Nota anterior ao agrupamento"}
                </p>
                {grupo.datasAutorizacao.length > 0 ? (
                  <p className="mt-0.5 text-[12px] text-[var(--ink-soft)]">
                    {grupo.datasAutorizacao.length === 1 ? "Autorizada em " : "Autorizações em "}
                    {grupo.datasAutorizacao.map(dataIsoParaBrasil).join(" e ")}
                  </p>
                ) : null}
                {grupo.dataDistribuicao
                  && (grupo.datasAutorizacao.length !== 1 || grupo.datasAutorizacao[0] !== grupo.dataDistribuicao) ? (
                    <p className="mt-0.5 text-[11px] text-[var(--ink-faint)]">
                      Distribuição preparada em {dataIsoParaBrasil(grupo.dataDistribuicao)}
                    </p>
                  ) : null}
              </div>
              <span className="text-[12px] text-[var(--ink-faint)]">{grupo.notas.length} {grupo.notas.length === 1 ? "nota" : "notas"}</span>
            </div>
            <Card className="divide-y divide-[var(--line)]">
              {grupo.notas.map((n) => (
                <NotaCard
                  key={n.id}
                  nota={{
                    ...n,
                    dataEmissao: n.dataEmissao?.toISOString() ?? null,
                    pdfUrl: disponibilidade.get(n.id) && n.pdfPath ? urls.get(n.pdfPath) ?? null : null,
                    xmlUrl: disponibilidade.get(n.id) && n.xmlPath ? urls.get(n.xmlPath) ?? null : null,
                    temChaveFiscal: /^\d{44}$/.test(n.chaveAcesso ?? ""),
                    podeRecuperar: n.status === "AUTORIZADA" && /^\d{44}$/.test(n.chaveAcesso ?? ""),
                    podeCancelar: n.status === "AUTORIZADA" && /^\d{44}$/.test(n.chaveAcesso ?? ""),
                  }}
                />
              ))}
            </Card>
          </section>
        ))}
        {notasVisiveis.length === 0 && (
          <Card className="px-4 py-10 text-center text-sm text-[var(--ink-faint)]">
            {contagens.ativas + contagens.canceladas === 0
              ? "Nenhuma nota emitida ainda."
              : visao === "canceladas"
                ? "Nenhuma nota cancelada."
                : "Nenhuma nota ativa."}
          </Card>
        )}
      </div>
      {totalPaginas > 1 && (
        <nav className="mt-5 flex items-center justify-between gap-3 text-sm" aria-label="Paginação das notas">
          {pagina > 1 ? <Link className="tap-target underline" href={hrefPagina(pagina - 1)}>← Anterior</Link> : <span />}
          <span className="font-mono-tab text-[12px] text-[var(--ink-faint)]">Página {pagina} de {totalPaginas}</span>
          {pagina < totalPaginas ? <Link className="tap-target underline" href={hrefPagina(pagina + 1)}>Próxima →</Link> : <span />}
        </nav>
      )}
    </div>
  );
}
