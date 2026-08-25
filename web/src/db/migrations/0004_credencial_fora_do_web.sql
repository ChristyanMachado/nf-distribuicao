-- O Web passa a guardar somente uma referência sem segredo. Login e senha
-- fiscais pertencem ao ambiente protegido do Worker/secrets manager.
ALTER TABLE "fiscal"."emitentes" ADD COLUMN "credencial_referencia" text;
--> statement-breakpoint
CREATE UNIQUE INDEX "emitentes_credencial_referencia_idx" ON "fiscal"."emitentes" USING btree ("credencial_referencia");
