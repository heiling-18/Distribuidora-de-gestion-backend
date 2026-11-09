import { bigint, boolean, index, pgTable, text, uniqueIndex } from 'drizzle-orm/pg-core';
import { actualizadoEn, creadoEn } from '../comunes/columnas.js';

export const clientes = pgTable(
  'clientes',
  {
    id: bigint({ mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    documento: text(),
    nombre: text().notNull(),
    telefono: text(),
    direccion: text(),
    activo: boolean().notNull().default(true),
    creadoEn: creadoEn(),
    actualizadoEn: actualizadoEn(),
  },
  (t) => [uniqueIndex('clientes_documento_unico').on(t.documento), index('clientes_nombre_idx').on(t.nombre)],
);
