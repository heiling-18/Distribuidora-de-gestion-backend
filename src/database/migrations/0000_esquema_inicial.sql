CREATE TYPE "public"."categoria_gasto" AS ENUM('arriendo', 'compra_inventario', 'servicios', 'nomina', 'transporte', 'otros');--> statement-breakpoint
CREATE TYPE "public"."estado_caja" AS ENUM('abierta', 'cerrada');--> statement-breakpoint
CREATE TYPE "public"."estado_venta" AS ENUM('completada', 'anulada');--> statement-breakpoint
CREATE TYPE "public"."metodo_pago" AS ENUM('efectivo', 'transferencia');--> statement-breakpoint
CREATE TYPE "public"."rol_usuario" AS ENUM('admin', 'vendedor', 'galponero');--> statement-breakpoint
CREATE TYPE "public"."tipo_movimiento_inventario" AS ENUM('inicial', 'compra', 'venta', 'anulacion', 'ajuste');--> statement-breakpoint
CREATE TYPE "public"."tipo_precio" AS ENUM('detal', 'mayorista');--> statement-breakpoint
CREATE TYPE "public"."unidad_medida" AS ENUM('bulto', 'unidad', 'kilo');--> statement-breakpoint
CREATE SEQUENCE "public"."ventas_numero_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE TABLE "usuarios" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "usuarios_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"email" text NOT NULL,
	"nombre" text NOT NULL,
	"rol" "rol_usuario" NOT NULL,
	"password_hash" text,
	"activo" boolean DEFAULT true NOT NULL,
	"version_sesion" integer DEFAULT 0 NOT NULL,
	"ultimo_login" timestamp with time zone,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "productos" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "productos_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"codigo" text,
	"nombre" text NOT NULL,
	"categoria" text DEFAULT 'Purinas y Concentrados' NOT NULL,
	"unidad_medida" "unidad_medida" DEFAULT 'bulto' NOT NULL,
	"precio_compra" numeric(14, 2) DEFAULT 0 NOT NULL,
	"precio_venta" numeric(14, 2) NOT NULL,
	"precio_mayorista" numeric(14, 2) NOT NULL,
	"iva_porcentaje" numeric(5, 2) DEFAULT 0 NOT NULL,
	"stock" numeric(12, 3) DEFAULT 0 NOT NULL,
	"stock_minimo" numeric(12, 3) DEFAULT 0 NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "productos_precios_validos" CHECK ("productos"."precio_compra" >= 0 and "productos"."precio_venta" >= 0 and "productos"."precio_mayorista" >= 0),
	CONSTRAINT "productos_iva_valido" CHECK ("productos"."iva_porcentaje" between 0 and 100),
	CONSTRAINT "productos_stock_no_negativo" CHECK ("productos"."stock" >= 0 and "productos"."stock_minimo" >= 0)
);
--> statement-breakpoint
CREATE TABLE "clientes" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "clientes_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"documento" text,
	"nombre" text NOT NULL,
	"telefono" text,
	"direccion" text,
	"activo" boolean DEFAULT true NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cajas" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "cajas_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"fecha" date NOT NULL,
	"estado" "estado_caja" DEFAULT 'abierta' NOT NULL,
	"monto_inicial" numeric(14, 2) NOT NULL,
	"abierta_por" bigint,
	"abierta_en" timestamp with time zone DEFAULT now() NOT NULL,
	"cerrada_por" bigint,
	"cerrada_en" timestamp with time zone,
	CONSTRAINT "cajas_monto_inicial_valido" CHECK ("cajas"."monto_inicial" >= 0),
	CONSTRAINT "cajas_cierre_consistente" CHECK (("cajas"."estado" = 'abierta' and "cajas"."cerrada_en" is null) or ("cajas"."estado" = 'cerrada' and "cajas"."cerrada_en" is not null))
);
--> statement-breakpoint
CREATE TABLE "cierres_caja" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "cierres_caja_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"caja_id" bigint NOT NULL,
	"monto_inicial" numeric(14, 2) NOT NULL,
	"ventas_efectivo" numeric(14, 2) NOT NULL,
	"ventas_transferencia" numeric(14, 2) NOT NULL,
	"gastos_efectivo" numeric(14, 2) NOT NULL,
	"dinero_esperado" numeric(14, 2) NOT NULL,
	"dinero_real" numeric(14, 2) NOT NULL,
	"diferencia" numeric(14, 2) NOT NULL,
	"observaciones" text,
	"cerrado_por" bigint,
	"responsable" text NOT NULL,
	"cerrado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cierres_caja_cajaId_unique" UNIQUE("caja_id")
);
--> statement-breakpoint
CREATE TABLE "venta_items" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "venta_items_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"venta_id" bigint NOT NULL,
	"producto_id" bigint,
	"producto_nombre" text NOT NULL,
	"categoria" text,
	"unidad_medida" "unidad_medida",
	"cantidad" numeric(12, 3) NOT NULL,
	"tipo_precio" "tipo_precio" DEFAULT 'detal' NOT NULL,
	"precio_unitario" numeric(14, 2) NOT NULL,
	"costo_unitario" numeric(14, 2) NOT NULL,
	"iva_porcentaje" numeric(5, 2) DEFAULT 0 NOT NULL,
	"subtotal" numeric(14, 2) NOT NULL,
	"iva_monto" numeric(14, 2) DEFAULT 0 NOT NULL,
	"total" numeric(14, 2) NOT NULL,
	CONSTRAINT "venta_items_cantidad_positiva" CHECK ("venta_items"."cantidad" > 0),
	CONSTRAINT "venta_items_montos_validos" CHECK ("venta_items"."precio_unitario" >= 0 and "venta_items"."costo_unitario" >= 0 and "venta_items"."total" >= 0)
);
--> statement-breakpoint
CREATE TABLE "ventas" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "ventas_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"numero" bigint DEFAULT nextval('ventas_numero_seq') NOT NULL,
	"fecha" timestamp with time zone DEFAULT now() NOT NULL,
	"caja_id" bigint,
	"cliente_id" bigint,
	"cliente_nombre" text DEFAULT 'Cliente General' NOT NULL,
	"cliente_documento" text,
	"vendedor_id" bigint,
	"vendedor_nombre" text NOT NULL,
	"metodo_pago" "metodo_pago" NOT NULL,
	"subtotal" numeric(14, 2) NOT NULL,
	"iva_total" numeric(14, 2) DEFAULT 0 NOT NULL,
	"total" numeric(14, 2) NOT NULL,
	"costo_total" numeric(14, 2) NOT NULL,
	"ganancia_bruta" numeric(14, 2) NOT NULL,
	"estado" "estado_venta" DEFAULT 'completada' NOT NULL,
	"motivo_anulacion" text,
	"anulada_por" bigint,
	"anulada_en" timestamp with time zone,
	"idempotency_key" text,
	"legacy_id" bigint,
	CONSTRAINT "ventas_totales_validos" CHECK ("ventas"."subtotal" >= 0 and "ventas"."iva_total" >= 0 and "ventas"."total" >= 0 and "ventas"."costo_total" >= 0),
	CONSTRAINT "ventas_anulacion_consistente" CHECK (("ventas"."estado" = 'completada' and "ventas"."anulada_en" is null) or ("ventas"."estado" = 'anulada' and "ventas"."motivo_anulacion" is not null and "ventas"."anulada_en" is not null))
);
--> statement-breakpoint
CREATE TABLE "gastos" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "gastos_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"fecha" date NOT NULL,
	"categoria" "categoria_gasto" NOT NULL,
	"descripcion" text NOT NULL,
	"monto" numeric(14, 2) NOT NULL,
	"metodo_pago" "metodo_pago" DEFAULT 'efectivo' NOT NULL,
	"caja_id" bigint,
	"registrado_por" bigint,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "gastos_monto_positivo" CHECK ("gastos"."monto" > 0)
);
--> statement-breakpoint
CREATE TABLE "cierres_mensuales" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "cierres_mensuales_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"mes" date NOT NULL,
	"total_ventas" numeric(14, 2) NOT NULL,
	"ventas_efectivo" numeric(14, 2) NOT NULL,
	"ventas_transferencia" numeric(14, 2) NOT NULL,
	"ganancia_bruta" numeric(14, 2) NOT NULL,
	"total_gastos" numeric(14, 2) NOT NULL,
	"utilidad_neta" numeric(14, 2) NOT NULL,
	"num_ventas" integer NOT NULL,
	"num_anuladas" integer NOT NULL,
	"unidades_vendidas" numeric(12, 3) NOT NULL,
	"cerrado_por" bigint,
	"cerrado_por_nombre" text NOT NULL,
	"cerrado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cierres_mensuales_mes_unique" UNIQUE("mes"),
	CONSTRAINT "cierres_mensuales_primer_dia" CHECK (extract(day from "cierres_mensuales"."mes") = 1)
);
--> statement-breakpoint
CREATE TABLE "inventario_movimientos" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "inventario_movimientos_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"producto_id" bigint NOT NULL,
	"tipo" "tipo_movimiento_inventario" NOT NULL,
	"cantidad" numeric(12, 3) NOT NULL,
	"stock_resultante" numeric(12, 3) NOT NULL,
	"venta_id" bigint,
	"motivo" text,
	"usuario_id" bigint,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auditoria" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "auditoria_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"usuario_id" bigint,
	"accion" text NOT NULL,
	"entidad" text NOT NULL,
	"entidad_id" text,
	"antes" jsonb,
	"despues" jsonb,
	"ip" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "configuracion" (
	"clave" text PRIMARY KEY NOT NULL,
	"valor" jsonb NOT NULL,
	"actualizado_por" bigint,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "galpon_registros" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "galpon_registros_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"galpon_id" bigint NOT NULL,
	"fecha" date NOT NULL,
	"huevos" integer DEFAULT 0 NOT NULL,
	"muertas" integer DEFAULT 0 NOT NULL,
	"alimento_kg" numeric(8, 2) DEFAULT 0 NOT NULL,
	"notas" text,
	"registrado_por" bigint,
	"registrado_por_nombre" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "galpon_registros_un_dia" UNIQUE("galpon_id","fecha"),
	CONSTRAINT "galpon_registros_valores_validos" CHECK ("galpon_registros"."huevos" >= 0 and "galpon_registros"."muertas" >= 0 and "galpon_registros"."alimento_kg" >= 0)
);
--> statement-breakpoint
CREATE TABLE "galpones" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "galpones_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"nombre" text NOT NULL,
	"aves_iniciales" integer NOT NULL,
	"fecha_llegada" date NOT NULL,
	"edad_semanas_llegada" integer DEFAULT 0 NOT NULL,
	"gramos_ave_dia" numeric(6, 1) DEFAULT 115 NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "galpones_aves_validas" CHECK ("galpones"."aves_iniciales" >= 0 and "galpones"."edad_semanas_llegada" >= 0),
	CONSTRAINT "galpones_gramos_validos" CHECK ("galpones"."gramos_ave_dia" > 0)
);
--> statement-breakpoint
ALTER TABLE "cajas" ADD CONSTRAINT "cajas_abierta_por_usuarios_id_fk" FOREIGN KEY ("abierta_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cajas" ADD CONSTRAINT "cajas_cerrada_por_usuarios_id_fk" FOREIGN KEY ("cerrada_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cierres_caja" ADD CONSTRAINT "cierres_caja_caja_id_cajas_id_fk" FOREIGN KEY ("caja_id") REFERENCES "public"."cajas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cierres_caja" ADD CONSTRAINT "cierres_caja_cerrado_por_usuarios_id_fk" FOREIGN KEY ("cerrado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venta_items" ADD CONSTRAINT "venta_items_venta_id_ventas_id_fk" FOREIGN KEY ("venta_id") REFERENCES "public"."ventas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venta_items" ADD CONSTRAINT "venta_items_producto_id_productos_id_fk" FOREIGN KEY ("producto_id") REFERENCES "public"."productos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ventas" ADD CONSTRAINT "ventas_caja_id_cajas_id_fk" FOREIGN KEY ("caja_id") REFERENCES "public"."cajas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ventas" ADD CONSTRAINT "ventas_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ventas" ADD CONSTRAINT "ventas_vendedor_id_usuarios_id_fk" FOREIGN KEY ("vendedor_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ventas" ADD CONSTRAINT "ventas_anulada_por_usuarios_id_fk" FOREIGN KEY ("anulada_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gastos" ADD CONSTRAINT "gastos_caja_id_cajas_id_fk" FOREIGN KEY ("caja_id") REFERENCES "public"."cajas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gastos" ADD CONSTRAINT "gastos_registrado_por_usuarios_id_fk" FOREIGN KEY ("registrado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cierres_mensuales" ADD CONSTRAINT "cierres_mensuales_cerrado_por_usuarios_id_fk" FOREIGN KEY ("cerrado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventario_movimientos" ADD CONSTRAINT "inventario_movimientos_producto_id_productos_id_fk" FOREIGN KEY ("producto_id") REFERENCES "public"."productos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventario_movimientos" ADD CONSTRAINT "inventario_movimientos_venta_id_ventas_id_fk" FOREIGN KEY ("venta_id") REFERENCES "public"."ventas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventario_movimientos" ADD CONSTRAINT "inventario_movimientos_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auditoria" ADD CONSTRAINT "auditoria_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "configuracion" ADD CONSTRAINT "configuracion_actualizado_por_usuarios_id_fk" FOREIGN KEY ("actualizado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "galpon_registros" ADD CONSTRAINT "galpon_registros_galpon_id_galpones_id_fk" FOREIGN KEY ("galpon_id") REFERENCES "public"."galpones"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "galpon_registros" ADD CONSTRAINT "galpon_registros_registrado_por_usuarios_id_fk" FOREIGN KEY ("registrado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "usuarios_email_unico" ON "usuarios" USING btree (lower("email"));--> statement-breakpoint
CREATE UNIQUE INDEX "productos_codigo_unico" ON "productos" USING btree ("codigo");--> statement-breakpoint
CREATE INDEX "productos_nombre_idx" ON "productos" USING btree ("nombre");--> statement-breakpoint
CREATE UNIQUE INDEX "clientes_documento_unico" ON "clientes" USING btree ("documento");--> statement-breakpoint
CREATE INDEX "clientes_nombre_idx" ON "clientes" USING btree ("nombre");--> statement-breakpoint
CREATE UNIQUE INDEX "cajas_una_abierta" ON "cajas" USING btree ("estado") WHERE "cajas"."estado" = 'abierta';--> statement-breakpoint
CREATE INDEX "cajas_fecha_idx" ON "cajas" USING btree ("fecha");--> statement-breakpoint
CREATE INDEX "venta_items_venta_idx" ON "venta_items" USING btree ("venta_id");--> statement-breakpoint
CREATE INDEX "venta_items_producto_idx" ON "venta_items" USING btree ("producto_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ventas_numero_unico" ON "ventas" USING btree ("numero");--> statement-breakpoint
CREATE UNIQUE INDEX "ventas_idempotency_unico" ON "ventas" USING btree ("idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "ventas_legacy_unico" ON "ventas" USING btree ("legacy_id");--> statement-breakpoint
CREATE INDEX "ventas_fecha_idx" ON "ventas" USING btree ("fecha" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "ventas_caja_idx" ON "ventas" USING btree ("caja_id");--> statement-breakpoint
CREATE INDEX "ventas_estado_idx" ON "ventas" USING btree ("estado");--> statement-breakpoint
CREATE INDEX "gastos_fecha_idx" ON "gastos" USING btree ("fecha" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "gastos_caja_idx" ON "gastos" USING btree ("caja_id");--> statement-breakpoint
CREATE INDEX "inventario_mov_producto_idx" ON "inventario_movimientos" USING btree ("producto_id","creado_en" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "auditoria_entidad_idx" ON "auditoria" USING btree ("entidad","entidad_id");--> statement-breakpoint
CREATE INDEX "auditoria_fecha_idx" ON "auditoria" USING btree ("creado_en" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "galpon_registros_fecha_idx" ON "galpon_registros" USING btree ("fecha" DESC NULLS LAST);