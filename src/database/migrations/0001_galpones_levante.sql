CREATE TYPE "public"."tipo_galpon" AS ENUM('postura', 'levante');--> statement-breakpoint
ALTER TABLE "galpon_registros" ADD COLUMN "precio_bulto" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "galpones" ADD COLUMN "tipo" "tipo_galpon" DEFAULT 'postura' NOT NULL;--> statement-breakpoint
ALTER TABLE "galpones" ADD COLUMN "precio_bulto" numeric(12, 2) DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "galpon_registros" ADD CONSTRAINT "galpon_registros_precio_bulto_valido" CHECK ("galpon_registros"."precio_bulto" is null or "galpon_registros"."precio_bulto" >= 0);--> statement-breakpoint
ALTER TABLE "galpones" ADD CONSTRAINT "galpones_precio_bulto_valido" CHECK ("galpones"."precio_bulto" >= 0);