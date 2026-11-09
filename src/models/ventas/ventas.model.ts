import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
  index,
  numeric,
  pgSequence,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { cajas } from '../caja/cajas.model.js';
import { clientes } from '../clientes/clientes.model.js';
import { cantidad, creadoEn, dinero } from '../comunes/columnas.js';
import { estadoVenta, metodoPago, tipoPrecio, unidadMedida } from '../comunes/enums.js';
import { productos } from '../inventario/productos.model.js';
import { usuarios } from '../usuarios/usuarios.model.js';

/** Consecutivo visible del ticket. */
export const ventasNumeroSeq = pgSequence('ventas_numero_seq', { startWith: 1 });

/** Cabecera de la venta (un ticket). */
export const ventas = pgTable(
  'ventas',
  {
    id: bigint({ mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    numero: bigint({ mode: 'number' })
      .notNull()
      .default(sql`nextval('ventas_numero_seq')`),
    fecha: creadoEn(),
    cajaId: bigint({ mode: 'number' }).references(() => cajas.id),
    clienteId: bigint({ mode: 'number' }).references(() => clientes.id),
    /** Copias históricas: si el cliente o el vendedor cambian después, el ticket no cambia. */
    clienteNombre: text().notNull().default('Cliente General'),
    clienteDocumento: text(),
    vendedorId: bigint({ mode: 'number' }).references(() => usuarios.id),
    vendedorNombre: text().notNull(),
    metodoPago: metodoPago().notNull(),
    subtotal: dinero().notNull(),
    ivaTotal: dinero().notNull().default(0),
    total: dinero().notNull(),
    costoTotal: dinero().notNull(),
    gananciaBruta: dinero().notNull(),
    estado: estadoVenta().notNull().default('completada'),
    motivoAnulacion: text(),
    anuladaPor: bigint({ mode: 'number' }).references(() => usuarios.id),
    anuladaEn: timestamp({ withTimezone: true }),
    /** Evita registrar dos veces la misma venta por doble clic o reintento. */
    idempotencyKey: text(),
    /** id de la fila original en Supabase, solo para ventas importadas. */
    legacyId: bigint({ mode: 'number' }),
  },
  (t) => [
    uniqueIndex('ventas_numero_unico').on(t.numero),
    uniqueIndex('ventas_idempotency_unico').on(t.idempotencyKey),
    uniqueIndex('ventas_legacy_unico').on(t.legacyId),
    index('ventas_fecha_idx').on(t.fecha.desc()),
    index('ventas_caja_idx').on(t.cajaId),
    index('ventas_estado_idx').on(t.estado),
    check(
      'ventas_totales_validos',
      sql`${t.subtotal} >= 0 and ${t.ivaTotal} >= 0 and ${t.total} >= 0 and ${t.costoTotal} >= 0`,
    ),
    check(
      'ventas_anulacion_consistente',
      sql`(${t.estado} = 'completada' and ${t.anuladaEn} is null) or (${t.estado} = 'anulada' and ${t.motivoAnulacion} is not null and ${t.anuladaEn} is not null)`,
    ),
  ],
);

/** Líneas de la venta. */
export const ventaItems = pgTable(
  'venta_items',
  {
    id: bigint({ mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    ventaId: bigint({ mode: 'number' })
      .notNull()
      .references(() => ventas.id),
    productoId: bigint({ mode: 'number' }).references(() => productos.id),
    productoNombre: text().notNull(),
    categoria: text(),
    unidadMedida: unidadMedida(),
    cantidad: cantidad().notNull(),
    tipoPrecio: tipoPrecio().notNull().default('detal'),
    precioUnitario: dinero().notNull(),
    costoUnitario: dinero().notNull(),
    ivaPorcentaje: numeric({ precision: 5, scale: 2, mode: 'number' }).notNull().default(0),
    subtotal: dinero().notNull(),
    ivaMonto: dinero().notNull().default(0),
    total: dinero().notNull(),
  },
  (t) => [
    index('venta_items_venta_idx').on(t.ventaId),
    index('venta_items_producto_idx').on(t.productoId),
    check('venta_items_cantidad_positiva', sql`${t.cantidad} > 0`),
    check(
      'venta_items_montos_validos',
      sql`${t.precioUnitario} >= 0 and ${t.costoUnitario} >= 0 and ${t.total} >= 0`,
    ),
  ],
);
