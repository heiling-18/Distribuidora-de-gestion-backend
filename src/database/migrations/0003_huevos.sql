CREATE TYPE "public"."clase_movimiento_huevo" AS ENUM('entrada', 'venta', 'perdida');--> statement-breakpoint
CREATE TABLE "huevo_movimientos" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "huevo_movimientos_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"fecha" date NOT NULL,
	"tipo_id" bigint NOT NULL,
	"clase" "clase_movimiento_huevo" NOT NULL,
	"huevos" integer NOT NULL,
	"precio_carton" numeric(12, 2) DEFAULT 0 NOT NULL,
	"tercero" text,
	"metodo_pago" "metodo_pago",
	"notas" text,
	"idempotency_key" text,
	"registrado_por" bigint,
	"registrado_por_nombre" text,
	"legacy_id" bigint,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "huevo_movimientos_huevos_validos" CHECK ("huevo_movimientos"."huevos" > 0),
	CONSTRAINT "huevo_movimientos_precio_valido" CHECK ("huevo_movimientos"."precio_carton" >= 0),
	CONSTRAINT "huevo_movimientos_pago_solo_ventas" CHECK (("huevo_movimientos"."clase" = 'venta' and "huevo_movimientos"."metodo_pago" is not null) or ("huevo_movimientos"."clase" <> 'venta' and "huevo_movimientos"."metodo_pago" is null))
);
--> statement-breakpoint
CREATE TABLE "huevo_tipos" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "huevo_tipos_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"nombre" text NOT NULL,
	"precio_venta" numeric(12, 2) DEFAULT 0 NOT NULL,
	"orden" integer DEFAULT 0 NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "huevo_tipos_nombre_unico" UNIQUE("nombre"),
	CONSTRAINT "huevo_tipos_precio_valido" CHECK ("huevo_tipos"."precio_venta" >= 0)
);
--> statement-breakpoint
ALTER TABLE "huevo_movimientos" ADD CONSTRAINT "huevo_movimientos_tipo_id_huevo_tipos_id_fk" FOREIGN KEY ("tipo_id") REFERENCES "public"."huevo_tipos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "huevo_movimientos" ADD CONSTRAINT "huevo_movimientos_registrado_por_usuarios_id_fk" FOREIGN KEY ("registrado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "huevo_movimientos_fecha_idx" ON "huevo_movimientos" USING btree ("fecha" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "huevo_movimientos_tipo_idx" ON "huevo_movimientos" USING btree ("tipo_id");--> statement-breakpoint
CREATE INDEX "huevo_movimientos_idempotency_idx" ON "huevo_movimientos" USING btree ("idempotency_key");--> statement-breakpoint
-- Tamaños por defecto (como en la página). Si ya existen, no se tocan.
INSERT INTO "huevo_tipos" ("nombre", "orden") VALUES ('AAA', 1), ('AA', 2), ('A', 3), ('B', 4) ON CONFLICT ("nombre") DO NOTHING;
