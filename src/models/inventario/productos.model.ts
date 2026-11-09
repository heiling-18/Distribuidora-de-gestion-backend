import { sql } from 'drizzle-orm';
import { bigint, boolean, check, index, numeric, pgTable, text, uniqueIndex } from 'drizzle-orm/pg-core';
import { actualizadoEn, cantidad, creadoEn, dinero } from '../comunes/columnas.js';
import { unidadMedida } from '../comunes/enums.js';

export const productos = pgTable(
  'productos',
  {
    id: bigint({ mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    codigo: text(),
    nombre: text().notNull(),
    categoria: text().notNull().default('Purinas y Concentrados'),
    unidadMedida: unidadMedida().notNull().default('bulto'),
    precioCompra: dinero().notNull().default(0),
    /** Precio detal */
    precioVenta: dinero().notNull(),
    precioMayorista: dinero().notNull(),
    ivaPorcentaje: numeric({ precision: 5, scale: 2, mode: 'number' }).notNull().default(0),
    stock: cantidad().notNull().default(0),
    stockMinimo: cantidad().notNull().default(0),
    activo: boolean().notNull().default(true),
    creadoEn: creadoEn(),
    actualizadoEn: actualizadoEn(),
  },
  (t) => [
    uniqueIndex('productos_codigo_unico').on(t.codigo),
    index('productos_nombre_idx').on(t.nombre),
    check(
      'productos_precios_validos',
      sql`${t.precioCompra} >= 0 and ${t.precioVenta} >= 0 and ${t.precioMayorista} >= 0`,
    ),
    check('productos_iva_valido', sql`${t.ivaPorcentaje} between 0 and 100`),
    check('productos_stock_no_negativo', sql`${t.stock} >= 0 and ${t.stockMinimo} >= 0`),
  ],
);
