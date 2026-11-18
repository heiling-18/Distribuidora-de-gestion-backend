ALTER TABLE "cajas" ADD COLUMN "base_siguiente" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "cajas" ADD COLUMN "apertura_automatica" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "cajas" ADD COLUMN "base_original" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "cajas" ADD COLUMN "ajuste_motivo" text;--> statement-breakpoint
ALTER TABLE "cajas" ADD COLUMN "ajustada_por" text;--> statement-breakpoint
ALTER TABLE "cierres_caja" ADD COLUMN "base_siguiente" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "cierres_caja" ADD COLUMN "retirado" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "cajas" ADD CONSTRAINT "cajas_bases_validas" CHECK (coalesce("cajas"."base_siguiente", 0) >= 0 and coalesce("cajas"."base_original", 0) >= 0);