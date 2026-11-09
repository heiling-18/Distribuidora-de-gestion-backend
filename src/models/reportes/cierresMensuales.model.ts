import { sql } from 'drizzle-orm';
import { bigint, check, date, integer, pgTable, text } from 'drizzle-orm/pg-core';
import { cantidad, creadoEn, dinero } from '../comunes/columnas.js';
import { usuarios } from '../usuarios/usuarios.model.js';

/** Acta del mes. Al existir, el mes queda bloqueado para anulaciones y gastos. */
export const cierresMensuales = pgTable(
  'cierres_mensuales',
  {
    id: bigint({ mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    /** Primer día del mes, "2026-10-01". */
    mes: date({ mode: 'string' }).notNull().unique(),
    totalVentas: dinero().notNull(),
    ventasEfectivo: dinero().notNull(),
    ventasTransferencia: dinero().notNull(),
    gananciaBruta: dinero().notNull(),
    totalGastos: dinero().notNull(),
    utilidadNeta: dinero().notNull(),
    numVentas: integer().notNull(),
    numAnuladas: integer().notNull(),
    unidadesVendidas: cantidad().notNull(),
    cerradoPor: bigint({ mode: 'number' }).references(() => usuarios.id),
    cerradoPorNombre: text().notNull(),
    cerradoEn: creadoEn(),
  },
  (t) => [check('cierres_mensuales_primer_dia', sql`extract(day from ${t.mes}) = 1`)],
);
