import {
  pgSchema,
  uuid,
  text,
  numeric,
  bigint,
  timestamp,
  boolean,
  integer,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Schema dedicado — mantém este sistema isolado do banco do ponto eletrônico,
// que roda no schema "public" do mesmo projeto Supabase.
// ---------------------------------------------------------------------------

export const fiscalSchema = pgSchema("fiscal");

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const statusTarefaEnum = fiscalSchema.enum("status_tarefa", [
  "PENDENTE",
  "PROCESSANDO",
  "AGUARDANDO_CONFERENCIA",
  "EMITINDO",
  "EMITIDA",
  "DOCUMENTOS_ARMAZENADOS",
  "ERRO",
  "CANCELADA",
]);

export const statusRecuperacaoDocumentoEnum = fiscalSchema.enum(
  "status_recuperacao_documento",
  ["PENDENTE", "PROCESSANDO", "CONCLUIDA", "ERRO"],
);

// Configuração operacional única, editável pelo Web e somente legível pelo
// Worker. A janela limita novas reservas; tarefas em andamento não são paradas.
export const configuracoesOperacionais = fiscalSchema.table(
  "configuracoes_operacionais",
  {
    id: boolean("id").primaryKey().default(true),
    emissaoInicioHora: integer("emissao_inicio_hora").notNull().default(0),
    emissaoFimHora: integer("emissao_fim_hora").notNull().default(6),
    atualizadoPor: text("atualizado_por"),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow(),
  },
);

// Indicador da IE do destinatário, conforme observado no sistema fiscal.
// Hoje só o fluxo "1 — Contribuinte ICMS" foi confirmado (ver worker/RECON.md).
export const indicadorIeEnum = fiscalSchema.enum("indicador_ie", [
  "CONTRIBUINTE", // 1 — Contribuinte ICMS (informar a IE do destinatário) — confirmado
  "CONTRIBUINTE_ISENTO", // hipótese, ainda não reconhecida no sistema real
  "NAO_CONTRIBUINTE", // hipótese, ainda não reconhecida no sistema real
]);

// ---------------------------------------------------------------------------
// RF02/RF03 — Emitentes: quem vende/emite. O Web guarda apenas uma referência
// sem segredo; login e senha fiscal pertencem ao ambiente protegido do Worker.
// ---------------------------------------------------------------------------

export const emitentes = fiscalSchema.table("emitentes", {
  id: uuid("id").primaryKey().defaultRandom(),
  nome: text("nome").notNull(),
  // Nome físico legado. Para emitentes, guarda CPF ou CNPJ normalizado;
  // mercados/clientes continuam exigindo CNPJ na tabela própria.
  cnpj: text("cnpj"),
  inscricaoEstadual: text("inscricao_estadual"),
  // Referência sem segredo que o Worker usa para resolver credenciais em seu
  // próprio ambiente (ex.: EMITENTE_GRAALYS_01).
  credencialReferencia: text("credencial_referencia"),
  // Value da option do emitente na NFP-e. Não é senha nem seletor CSS; será
  // preenchido após o reconhecimento controlado no ambiente de homologação.
  valorSelectNfpe: text("valor_select_nfpe"),
  // Legado do banco de teste. A aplicação não lê nem grava mais estes campos;
  // remover depois que as credenciais forem migradas ao secrets manager.
  loginUsuario: text("login_usuario"),
  senha: text("senha"),
  ativo: boolean("ativo").notNull().default(true),
  criadoEm: timestamp("criado_em").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("emitentes_credencial_referencia_idx").on(table.credencialReferencia),
]);

// ---------------------------------------------------------------------------
// RF01 — Clientes (destinatário da NFP-e). A relação com emitentes é N:N:
// o emitente efetivo é escolhido na distribuição e gravado na tarefa.
// ---------------------------------------------------------------------------

export const clientes = fiscalSchema.table("clientes", {
  id: uuid("id").primaryKey().defaultRandom(),
  nome: text("nome").notNull(),
  cnpj: text("cnpj"),
  inscricaoEstadual: text("inscricao_estadual"), // IE do DESTINATÁRIO (do cliente, não do emitente)
  indicadorIe: indicadorIeEnum("indicador_ie").notNull().default("CONTRIBUINTE"),
  destinatarioNome: text("destinatario_nome"), // razão social usada na nota, se diferente de "nome"
  cep: text("cep"),
  numeroEndereco: text("numero_endereco"),
  ativo: boolean("ativo").notNull().default(true),
  observacoes: text("observacoes"),
  criadoEm: timestamp("criado_em").notNull().defaultNow(),
});

// Emitentes habilitados para atender cada cliente. A tabela não substitui a
// escolha na tarefa: ela define as opções operacionais permitidas na tela.
export const clienteEmitentes = fiscalSchema.table(
  "cliente_emitentes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clienteId: uuid("cliente_id").notNull().references(() => clientes.id),
    emitenteId: uuid("emitente_id").notNull().references(() => emitentes.id),
    criadoEm: timestamp("criado_em").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("cliente_emitentes_cliente_emitente_idx").on(table.clienteId, table.emitenteId),
  ]
);

// ---------------------------------------------------------------------------
// RF04 — Regras fiscais reutilizáveis e produtos
// ---------------------------------------------------------------------------

// Uma regra reúne todos os valores fiscais e operacionais que hoje são
// compartilhados pelos produtos. Ela é criada uma vez e selecionada pelo
// produto; a tarefa guarda a referência escolhida para não depender do
// cadastro atual ao ser emitida mais tarde.
export const regrasFiscais = fiscalSchema.table(
  "regras_fiscais",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    codigo: text("codigo").notNull(),
    nome: text("nome").notNull(),
    cfopTexto: text("cfop_texto").notNull(),
    cfopCodigo: text("cfop_codigo").notNull(),
    situacaoTributariaIcms: text("situacao_tributaria_icms").notNull(),
    origemMercadoria: text("origem_mercadoria").notNull(),
    possuiBeneficioFiscal: boolean("possui_beneficio_fiscal").notNull().default(false),
    codigoBeneficioFiscal: text("codigo_beneficio_fiscal"),
    naturezaOperacao: text("natureza_operacao").notNull(),
    tipoOperacao: text("tipo_operacao").notNull(),
    finalidadeEmissao: text("finalidade_emissao").notNull(),
    indicadorPresenca: text("indicador_presenca").notNull(),
    modalidadeFrete: text("modalidade_frete").notNull(),
    ativo: boolean("ativo").notNull().default(true),
    criadoEm: timestamp("criado_em").notNull().defaultNow(),
  },
  (table) => [uniqueIndex("regras_fiscais_codigo_idx").on(table.codigo)]
);

export const produtos = fiscalSchema.table("produtos", {
  id: uuid("id").primaryKey().defaultRandom(),
  descricao: text("descricao").notNull(),
  codigoInterno: text("codigo_interno"),
  codigoFiscal: text("codigo_fiscal"), // código usado no sistema fiscal (busca de produto)
  regraFiscalId: uuid("regra_fiscal_id")
    .notNull()
    .references(() => regrasFiscais.id),
  unidade: text("unidade").notNull().default("UN"),
  precoPadrao: numeric("preco_padrao", { precision: 12, scale: 2 }).notNull().default("0"),
  ativo: boolean("ativo").notNull().default(true),
  criadoEm: timestamp("criado_em").notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Preço praticado por cliente — "Produto + Cliente → Preço", não só
// "Produto → Preço". Aprende sozinho: toda vez que a distribuição é
// processada com um preço editado, esse valor vira o novo padrão daquele
// par produto/cliente (upsert em lib das actions da distribuição).
// ---------------------------------------------------------------------------

export const precosCliente = fiscalSchema.table(
  "precos_cliente",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    produtoId: uuid("produto_id").notNull().references(() => produtos.id),
    clienteId: uuid("cliente_id").notNull().references(() => clientes.id),
    preco: numeric("preco", { precision: 12, scale: 2 }).notNull(),
    atualizadoEm: timestamp("atualizado_em").notNull().defaultNow(),
  },
  (table) => [uniqueIndex("preco_cliente_produto_idx").on(table.produtoId, table.clienteId)]
);

// ---------------------------------------------------------------------------
// Cada confirmação na tela de Distribuição vira um lote. O lote é a unidade
// operacional do roteiro do motorista: não mistura entregas de rodadas
// diferentes feitas no mesmo dia.
export const lotesDistribuicao = fiscalSchema.table(
  "lotes_distribuicao",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Número sequencial visível ao usuário: Distribuição 000001, 000002...
    numero: bigint("numero", { mode: "number" }),
    chaveIdempotencia: uuid("chave_idempotencia"),
    data: text("data").notNull(),
    criadoEm: timestamp("criado_em").notNull().defaultNow(),
  },
  (table) => [uniqueIndex("lotes_distribuicao_chave_idempotencia_idx").on(table.chaveIdempotencia)],
);

// RF06 — Disponibilidade por produto dentro de um lote de distribuição.
// ---------------------------------------------------------------------------

export const disponibilidades = fiscalSchema.table("disponibilidades", {
  id: uuid("id").primaryKey().defaultRandom(),
  loteId: uuid("lote_id").notNull().references(() => lotesDistribuicao.id),
  produtoId: uuid("produto_id").notNull().references(() => produtos.id),
  data: text("data").notNull(), // formato YYYY-MM-DD
  quantidadeDisponivel: numeric("quantidade_disponivel", { precision: 12, scale: 3 }).notNull(),
  criadoEm: timestamp("criado_em").notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// RF07/RF08/RF09/RF10 — Distribuição por cliente (com trocas e preço)
// ---------------------------------------------------------------------------

export const distribuicoes = fiscalSchema.table("distribuicoes", {
  id: uuid("id").primaryKey().defaultRandom(),
  disponibilidadeId: uuid("disponibilidade_id").notNull().references(() => disponibilidades.id),
  clienteId: uuid("cliente_id").notNull().references(() => clientes.id),
  // Mesmo emitente escolhido para a tarefa originada por esta distribuição.
  emitenteId: uuid("emitente_id").notNull().references(() => emitentes.id),
  quantidadeDistribuida: numeric("quantidade_distribuida", { precision: 12, scale: 3 }).notNull(),
  quantidadeTroca: numeric("quantidade_troca", { precision: 12, scale: 3 }).notNull().default("0"),
  // quantidadeFaturavel = quantidadeDistribuida - quantidadeTroca (calculado em código, ver lib/calculos.ts)
  quantidadeFaturavel: numeric("quantidade_faturavel", { precision: 12, scale: 3 }).notNull(),
  precoUnitario: numeric("preco_unitario", { precision: 12, scale: 2 }).notNull(),
  precoPromocional: boolean("preco_promocional").notNull().default(false),
  criadoEm: timestamp("criado_em").notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// RF11 — Tarefa de emissão (agrupa os itens de um cliente num dia, podendo
// ter vários produtos — RF17 do doc de atualizações)
// ---------------------------------------------------------------------------

export const tarefas = fiscalSchema.table("tarefas", {
  id: uuid("id").primaryKey().defaultRandom(),
  // Cada tarefa pertence à rodada que a originou. Registros legados de teste
  // podem permanecer nulos até revisão; novas distribuições sempre preenchem.
  loteId: uuid("lote_id").references(() => lotesDistribuicao.id),
  clienteId: uuid("cliente_id").notNull().references(() => clientes.id),
  // Snapshot da escolha na distribuição. Não inferir pelo cadastro do cliente.
  emitenteId: uuid("emitente_id").notNull().references(() => emitentes.id),
  data: text("data").notNull(), // YYYY-MM-DD — dia da distribuição/produção, controle interno
  status: statusTarefaEnum("status").notNull().default("PENDENTE"),
  // Reserva/lease evita duas instâncias do Worker emitirem a mesma tarefa.
  // Expiração exige conferência humana; nunca recolocar automaticamente.
  tentativas: integer("tentativas").notNull().default(0),
  reservadaPor: text("reservada_por"),
  reservaToken: uuid("reserva_token"),
  reservaExpiraEm: timestamp("reserva_expira_em", { withTimezone: true }),
  iniciadoEm: timestamp("iniciado_em", { withTimezone: true }),
  concluidoEm: timestamp("concluido_em", { withTimezone: true }),
  ultimoErro: text("ultimo_erro"),
  mensagemStatus: text("mensagem_status"),
  // Código estável e sem dados fiscais. O Web o traduz em orientação clara e
  // decide se uma nova tentativa é segura sem interpretar texto livre.
  codigoErro: text("codigo_erro"),
  contratoVersao: integer("contrato_versao"),
  payloadWorker: jsonb("payload_worker"),
  payloadHash: text("payload_hash"),
  valorTotal: numeric("valor_total", { precision: 12, scale: 2 }).notNull().default("0"),
  criadoEm: timestamp("criado_em").notNull().defaultNow(),
  atualizadoEm: timestamp("atualizado_em").notNull().defaultNow(),
});

// Itens da tarefa — snapshot dos produtos/quantidades/valores no momento da geração
export const tarefaItens = fiscalSchema.table("tarefa_itens", {
  id: uuid("id").primaryKey().defaultRandom(),
  tarefaId: uuid("tarefa_id").notNull().references(() => tarefas.id),
  produtoId: uuid("produto_id").notNull().references(() => produtos.id),
  // Snapshot da regra escolhida pelo produto quando a tarefa foi gerada.
  // Regras não devem ser alteradas; para mudar tributação, criar outra regra
  // e vinculá-la aos próximos produtos/tarefas.
  regraFiscalId: uuid("regra_fiscal_id")
    .notNull()
    .references(() => regrasFiscais.id),
  quantidade: numeric("quantidade", { precision: 12, scale: 3 }).notNull(),
  precoUnitario: numeric("preco_unitario", { precision: 12, scale: 2 }).notNull(),
  subtotal: numeric("subtotal", { precision: 12, scale: 2 }).notNull(),
});

// ---------------------------------------------------------------------------
// RF17 — Registro histórico da nota ("pseudo-nota", sempre permanente)
// RF19 — Documento (PDF/XML) com política de retenção. O binário expira em
// 30 dias por padrão; os metadados fiscais permanecem permanentemente.
// ---------------------------------------------------------------------------

export const notas = fiscalSchema.table("notas", {
  id: uuid("id").primaryKey().defaultRandom(),
  tarefaId: uuid("tarefa_id").notNull().references(() => tarefas.id),
  clienteId: uuid("cliente_id").notNull().references(() => clientes.id),
  numero: text("numero"),
  chaveAcesso: text("chave_acesso"),
  protocoloAutorizacao: text("protocolo_autorizacao"),
  status: text("status").notNull().default("AGUARDANDO_EMISSAO"), // AUTORIZADA | REJEITADA | AGUARDANDO_EMISSAO
  valorTotal: numeric("valor_total", { precision: 12, scale: 2 }).notNull(),
  dataEmissao: timestamp("data_emissao"),
  pdfPath: text("pdf_path"), // caminho no Supabase Storage — pode ser nulo após expirar retenção
  xmlPath: text("xml_path"),
  documentoExpiraEm: timestamp("documento_expira_em"), // data em que o binário pode ser removido
  // Reserva curta para a limpeza assíncrona. Impede dois Workers de apagarem
  // a mesma nota e só é removida depois do Storage confirmar a exclusão.
  limpezaReservaToken: uuid("limpeza_reserva_token"),
  limpezaReservaExpiraEm: timestamp("limpeza_reserva_expira_em"),
  mensagemErro: text("mensagem_erro"),
  criadoEm: timestamp("criado_em").notNull().defaultNow(),
}, (table) => [uniqueIndex("notas_tarefa_unica_idx").on(table.tarefaId)]);

// ---------------------------------------------------------------------------
// RF20 — fila exclusiva para recuperar XML/DANFE já emitidos.
// Uma solicitação nunca muda o estado da tarefa de emissão. A mesma linha é
// reutilizada quando os documentos expirarem novamente, mantendo idempotência.
// ---------------------------------------------------------------------------

export const recuperacoesDocumentos = fiscalSchema.table(
  "recuperacoes_documentos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    notaId: uuid("nota_id").notNull().references(() => notas.id),
    status: statusRecuperacaoDocumentoEnum("status").notNull().default("PENDENTE"),
    tentativas: integer("tentativas").notNull().default(0),
    reservadaPor: text("reservada_por"),
    reservaToken: uuid("reserva_token"),
    reservaExpiraEm: timestamp("reserva_expira_em", { withTimezone: true }),
    mensagemStatus: text("mensagem_status"),
    codigoErro: text("codigo_erro"),
    solicitadaEm: timestamp("solicitada_em", { withTimezone: true }).notNull().defaultNow(),
    iniciadaEm: timestamp("iniciada_em", { withTimezone: true }),
    concluidaEm: timestamp("concluida_em", { withTimezone: true }),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("recuperacoes_documentos_nota_unica_idx").on(table.notaId),
    index("recuperacoes_documentos_fila_idx")
      .on(table.solicitadaEm, table.id)
      .where(sql`${table.status} in ('PENDENTE', 'PROCESSANDO')`),
  ],
);

// ---------------------------------------------------------------------------
// RF17/RNF03/RNF07 — Logs de execução do worker, vinculados à tarefa/nota
// ---------------------------------------------------------------------------

export const logs = fiscalSchema.table("logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  tarefaId: uuid("tarefa_id").references(() => tarefas.id),
  nivel: text("nivel").notNull().default("INFO"), // INFO | WARN | ERROR
  mensagem: text("mensagem").notNull(),
  criadoEm: timestamp("criado_em").notNull().defaultNow(),
});
