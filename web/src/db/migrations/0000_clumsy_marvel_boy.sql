CREATE SCHEMA "fiscal";
--> statement-breakpoint
CREATE TYPE "fiscal"."indicador_ie" AS ENUM('CONTRIBUINTE', 'CONTRIBUINTE_ISENTO', 'NAO_CONTRIBUINTE');--> statement-breakpoint
CREATE TYPE "fiscal"."status_tarefa" AS ENUM('PENDENTE', 'PROCESSANDO', 'AGUARDANDO_CONFERENCIA', 'EMITINDO', 'EMITIDA', 'DOCUMENTOS_ARMAZENADOS', 'ERRO', 'CANCELADA');--> statement-breakpoint
CREATE TABLE "fiscal"."clientes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" text NOT NULL,
	"cnpj" text,
	"inscricao_estadual" text,
	"indicador_ie" "fiscal"."indicador_ie" DEFAULT 'CONTRIBUINTE' NOT NULL,
	"destinatario_nome" text,
	"cep" text,
	"numero_endereco" text,
	"emitente_id" uuid,
	"ativo" boolean DEFAULT true NOT NULL,
	"observacoes" text,
	"criado_em" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fiscal"."disponibilidades" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"produto_id" uuid NOT NULL,
	"data" text NOT NULL,
	"quantidade_disponivel" numeric(12, 3) NOT NULL,
	"criado_em" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fiscal"."distribuicoes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"disponibilidade_id" uuid NOT NULL,
	"cliente_id" uuid NOT NULL,
	"quantidade_distribuida" numeric(12, 3) NOT NULL,
	"quantidade_troca" numeric(12, 3) DEFAULT '0' NOT NULL,
	"quantidade_faturavel" numeric(12, 3) NOT NULL,
	"preco_unitario" numeric(12, 2) NOT NULL,
	"preco_promocional" boolean DEFAULT false NOT NULL,
	"criado_em" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fiscal"."emitentes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" text NOT NULL,
	"cnpj" text,
	"inscricao_estadual" text,
	"login_usuario" text,
	"senha" text,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fiscal"."logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tarefa_id" uuid,
	"nivel" text DEFAULT 'INFO' NOT NULL,
	"mensagem" text NOT NULL,
	"criado_em" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fiscal"."notas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tarefa_id" uuid NOT NULL,
	"cliente_id" uuid NOT NULL,
	"numero" text,
	"chave_acesso" text,
	"status" text DEFAULT 'AGUARDANDO_EMISSAO' NOT NULL,
	"valor_total" numeric(12, 2) NOT NULL,
	"data_emissao" timestamp,
	"pdf_path" text,
	"xml_path" text,
	"documento_expira_em" timestamp,
	"mensagem_erro" text,
	"criado_em" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fiscal"."precos_cliente" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"produto_id" uuid NOT NULL,
	"cliente_id" uuid NOT NULL,
	"preco" numeric(12, 2) NOT NULL,
	"atualizado_em" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fiscal"."produtos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"descricao" text NOT NULL,
	"codigo_interno" text,
	"codigo_fiscal" text,
	"unidade" text DEFAULT 'UN' NOT NULL,
	"preco_padrao" numeric(12, 2) DEFAULT '0' NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fiscal"."tarefa_itens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tarefa_id" uuid NOT NULL,
	"produto_id" uuid NOT NULL,
	"quantidade" numeric(12, 3) NOT NULL,
	"preco_unitario" numeric(12, 2) NOT NULL,
	"subtotal" numeric(12, 2) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fiscal"."tarefas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cliente_id" uuid NOT NULL,
	"data" text NOT NULL,
	"status" "fiscal"."status_tarefa" DEFAULT 'PENDENTE' NOT NULL,
	"valor_total" numeric(12, 2) DEFAULT '0' NOT NULL,
	"criado_em" timestamp DEFAULT now() NOT NULL,
	"atualizado_em" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "fiscal"."clientes" ADD CONSTRAINT "clientes_emitente_id_emitentes_id_fk" FOREIGN KEY ("emitente_id") REFERENCES "fiscal"."emitentes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fiscal"."disponibilidades" ADD CONSTRAINT "disponibilidades_produto_id_produtos_id_fk" FOREIGN KEY ("produto_id") REFERENCES "fiscal"."produtos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fiscal"."distribuicoes" ADD CONSTRAINT "distribuicoes_disponibilidade_id_disponibilidades_id_fk" FOREIGN KEY ("disponibilidade_id") REFERENCES "fiscal"."disponibilidades"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fiscal"."distribuicoes" ADD CONSTRAINT "distribuicoes_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "fiscal"."clientes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fiscal"."logs" ADD CONSTRAINT "logs_tarefa_id_tarefas_id_fk" FOREIGN KEY ("tarefa_id") REFERENCES "fiscal"."tarefas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fiscal"."notas" ADD CONSTRAINT "notas_tarefa_id_tarefas_id_fk" FOREIGN KEY ("tarefa_id") REFERENCES "fiscal"."tarefas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fiscal"."notas" ADD CONSTRAINT "notas_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "fiscal"."clientes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fiscal"."precos_cliente" ADD CONSTRAINT "precos_cliente_produto_id_produtos_id_fk" FOREIGN KEY ("produto_id") REFERENCES "fiscal"."produtos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fiscal"."precos_cliente" ADD CONSTRAINT "precos_cliente_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "fiscal"."clientes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fiscal"."tarefa_itens" ADD CONSTRAINT "tarefa_itens_tarefa_id_tarefas_id_fk" FOREIGN KEY ("tarefa_id") REFERENCES "fiscal"."tarefas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fiscal"."tarefa_itens" ADD CONSTRAINT "tarefa_itens_produto_id_produtos_id_fk" FOREIGN KEY ("produto_id") REFERENCES "fiscal"."produtos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fiscal"."tarefas" ADD CONSTRAINT "tarefas_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "fiscal"."clientes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "preco_cliente_produto_idx" ON "fiscal"."precos_cliente" USING btree ("produto_id","cliente_id");