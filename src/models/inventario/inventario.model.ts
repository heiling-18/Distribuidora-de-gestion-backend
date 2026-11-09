import { bigint, index, pgTable, text } from 'drizzle-orm/pg-core';
import { cantidad, creadoEn } from '../comunes/columnas.js';
import { tipoMovimientoInventario } from '../comunes/enums.js';
import { productos } from './productos.model.js';
import { usuarios } from '../usuarios/usuarios.model.js';
import { ventas } from '../ventas/ventas.model.js';

/** Historial de cada cambio de stock: ventas, anulaciones, compras y ajustes manuales. */
export const inventarioMovimientos = pgTable(
  'inventario_movimientos',
  {
    id: bigint({ mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    productoId: bigint({ mode: 'number' })
      .notNull()
      .references(() => productos.id),
    tipo: tipoMovimientoInventario().notNull(),
    /** Positivo entra, negativo sale. */
    cantidad: cantidad().notNull(),
    stockResultante: cantidad().notNull(),
    ventaId: bigint({ mode: 'number' }).references(() => ventas.id),
    motivo: text(),
    usuarioId: bigint({ mode: 'number' }).references(() => usuarios.id),
    creadoEn: creadoEn(),
  },
  (t) => [index('inventario_mov_producto_idx').on(t.productoId, t.creadoEn.desc())],
);
