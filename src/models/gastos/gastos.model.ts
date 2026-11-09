import { sql } from 'drizzle-orm';
import { bigint, check, date, index, pgTable, text } from 'drizzle-orm/pg-core';
import { cajas } from '../caja/cajas.model.js';
import { actualizadoEn, creadoEn, dinero } from '../comunes/columnas.js';
import { categoriaGasto, metodoPago } from '../comunes/enums.js';
import { usuarios } from '../usuarios/usuarios.model.js';

export const gastos = pgTable(
  'gastos',
  {
    id: bigint({ mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    /** Día del negocio al que pertenece el gasto. */
    fecha: date({ mode: 'string' }).notNull(),
    categoria: categoriaGasto().notNull(),
    descripcion: text().notNull(),
    monto: dinero().notNull(),
    /** Si sale en efectivo se descuenta del dinero esperado en caja. */
    metodoPago: metodoPago().notNull().default('efectivo'),
    cajaId: bigint({ mode: 'number' }).references(() => cajas.id),
    registradoPor: bigint({ mode: 'number' }).references(() => usuarios.id),
    creadoEn: creadoEn(),
    actualizadoEn: actualizadoEn(),
  },
  (t) => [
    index('gastos_fecha_idx').on(t.fecha.desc()),
    index('gastos_caja_idx').on(t.cajaId),
    check('gastos_monto_positivo', sql`${t.monto} > 0`),
  ],
);
