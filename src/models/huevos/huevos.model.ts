import { sql } from 'drizzle-orm';
import { bigint, boolean, check, date, index, integer, numeric, pgTable, text, unique } from 'drizzle-orm/pg-core';
import { creadoEn } from '../comunes/columnas.js';
import { claseMovimientoHuevo, metodoPago } from '../comunes/enums.js';
import { usuarios } from '../usuarios/usuarios.model.js';

/**
 * Huevos: producción propia. Se cargan al inventario por tamaño y se venden por cartón (30) o por unidad.
 * Es una sección aparte de la purina y de galpones.
 */

/** Tamaños de huevo (AAA, AA, A, B…) con su precio de venta del cartón de 30. */
export const huevoTipos = pgTable(
  'huevo_tipos',
  {
    id: bigint({ mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    nombre: text().notNull(),
    /** Precio de venta del cartón de 30; se puede cambiar cada día. */
    precioVenta: numeric({ precision: 12, scale: 2, mode: 'number' }).notNull().default(0),
    orden: integer().notNull().default(0),
    activo: boolean().notNull().default(true),
    creadoEn: creadoEn(),
  },
  (t) => [
    unique('huevo_tipos_nombre_unico').on(t.nombre),
    check('huevo_tipos_precio_valido', sql`${t.precioVenta} >= 0`),
  ],
);

/**
 * Todo lo que pasa con los huevos, siempre contado en huevos (un cartón = 30).
 * Inventario de un tamaño = entradas − ventas − rotos; nunca negativo (lo valida el servicio con bloqueo por tamaño).
 */
export const huevoMovimientos = pgTable(
  'huevo_movimientos',
  {
    id: bigint({ mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    /** Día del negocio (America/Bogota). */
    fecha: date({ mode: 'string' }).notNull(),
    tipoId: bigint({ mode: 'number' })
      .notNull()
      .references(() => huevoTipos.id, { onDelete: 'restrict' }),
    clase: claseMovimientoHuevo().notNull(),
    huevos: integer().notNull(),
    /** Venta: precio del cartón equivalente (valor = huevos / 30 × precio). Entrada y rotos: 0. */
    precioCarton: numeric({ precision: 12, scale: 2, mode: 'number' }).notNull().default(0),
    /** Venta: cliente · entrada: galpón de origen (opcional). */
    tercero: text(),
    /** Solo ventas. */
    metodoPago: metodoPago(),
    notas: text(),
    /** Clave del cobro: todas las líneas de un mismo cobro del carrito la comparten (evita cobrar dos veces). */
    idempotencyKey: text(),
    registradoPor: bigint({ mode: 'number' }).references(() => usuarios.id),
    registradoPorNombre: text(),
    /** Id en Supabase (hue_movimientos) para los importados. */
    legacyId: bigint({ mode: 'number' }),
    creadoEn: creadoEn(),
  },
  (t) => [
    index('huevo_movimientos_fecha_idx').on(t.fecha.desc(), t.id.desc()),
    index('huevo_movimientos_tipo_idx').on(t.tipoId),
    index('huevo_movimientos_idempotency_idx').on(t.idempotencyKey),
    check('huevo_movimientos_huevos_validos', sql`${t.huevos} > 0`),
    check('huevo_movimientos_precio_valido', sql`${t.precioCarton} >= 0`),
    check(
      'huevo_movimientos_pago_solo_ventas',
      sql`(${t.clase} = 'venta' and ${t.metodoPago} is not null) or (${t.clase} <> 'venta' and ${t.metodoPago} is null)`,
    ),
  ],
);
