import postgres from "postgres";
import {
  clienteIncompleto,
  emitenteIncompleto,
  produtoIncompleto,
} from "./validacao-prontidao.mjs";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.log(
    JSON.stringify({
      prontidaoIntegracao: "nao_configurada",
      variavelAusente: "DATABASE_URL",
    }),
  );
  process.exitCode = 2;
} else {
  const sql = postgres(connectionString, {
    prepare: false,
    ssl: "require",
    connect_timeout: 10,
    idle_timeout: 5,
    max: 1,
  });

  try {
    // Documentos são lidos apenas em memória para validação e nunca aparecem
    // no JSON de saída. Login e senha fiscais não são consultados.
    const clientesAtivos = await sql`
      select destinatario_nome, cnpj, inscricao_estadual, cep, numero_endereco
      from fiscal.clientes
      where ativo = true
    `;
    const [semEmitente] = await sql`
      select count(*)::int as clientes_sem_emitente
      from fiscal.clientes c
      where c.ativo = true
        and not exists (
          select 1
          from fiscal.cliente_emitentes ce
          inner join fiscal.emitentes e on e.id = ce.emitente_id and e.ativo = true
          where ce.cliente_id = c.id
        )
    `;
    const emitentesAtivos = await sql`
      select cnpj, credencial_referencia, valor_select_nfpe
      from fiscal.emitentes
      where ativo = true
    `;
    const produtosAtivos = await sql`
      select
        p.codigo_fiscal,
        coalesce(r.ativo, false) as regra_ativa
      from fiscal.produtos p
      left join fiscal.regras_fiscais r on r.id = p.regra_fiscal_id
      where p.ativo = true
    `;
    const [tarefas] = await sql`
      select
        count(*) filter (where status = 'PENDENTE')::int as pendentes,
        count(*) filter (where status = 'PENDENTE' and lote_id is null)::int
          as pendentes_sem_lote,
        count(*) filter (
          where status = 'PENDENTE'
            and lote_id is not null
            and contrato_versao = 1
            and payload_worker is not null
            and payload_hash is not null
        )::int as pendentes_prontas_worker
      from fiscal.tarefas
    `;
    const [lotes] = await sql`
      select
        count(*)::int as total,
        count(*) filter (where numero is not null)::int as numerados,
        count(*) filter (where numero is null)::int as sem_numero
      from fiscal.lotes_distribuicao
    `;
    const colunasIntegracao = await sql`
      select table_name, column_name
      from information_schema.columns
      where table_schema = 'fiscal'
        and (
          (table_name = 'lotes_distribuicao'
            and column_name in ('numero', 'chave_idempotencia'))
          or (table_name = 'tarefas' and column_name in (
            'lote_id', 'reserva_token', 'contrato_versao',
            'payload_worker', 'payload_hash'
          ))
          or (table_name = 'notas' and column_name = 'protocolo_autorizacao')
        )
    `;
    const [funcaoFila] = await sql`
      select
        to_regprocedure(
          'fiscal.reservar_tarefas_worker(text,integer,integer)'
        ) is not null as existe,
        not exists (
          select 1
          from information_schema.routine_privileges
          where routine_schema = 'fiscal'
            and routine_name = 'reservar_tarefas_worker'
            and grantee = 'PUBLIC'
            and privilege_type = 'EXECUTE'
        ) as public_revogado
    `;

    console.log(
      JSON.stringify({
        clientes: {
          total_ativos: clientesAtivos.length,
          cadastros_incompletos: clientesAtivos.filter(clienteIncompleto).length,
          ...semEmitente,
        },
        emitentes: {
          total_ativos: emitentesAtivos.length,
          integracao_incompleta: emitentesAtivos.filter(emitenteIncompleto).length,
        },
        produtos: {
          total_ativos: produtosAtivos.length,
          cadastros_incompletos: produtosAtivos.filter(produtoIncompleto).length,
        },
        tarefas,
        lotes,
        contratoDistribuicaoPronto:
          colunasIntegracao.length === 8 &&
          funcaoFila.existe &&
          funcaoFila.public_revogado,
        segurancaFila: funcaoFila,
      }),
    );
  } catch (erro) {
    console.log(
      JSON.stringify({
        prontidaoIntegracao: "erro",
        tipoErro: erro instanceof Error ? erro.name : "ErroDesconhecido",
      }),
    );
    process.exitCode = 1;
  } finally {
    await sql.end();
  }
}
