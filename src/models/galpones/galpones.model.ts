import { sql } from 'drizzle-orm';
import { bigint, boolean, check, date, index, integer, numeric, pgTable, text, unique } from 'drizzle-orm/pg-core';
import { actualizadoEn, creadoEn } from '../comunes/columnas.js';
import { usuarios } from '../usuarios/usuarios.model.js';

export const galpones = pgTable(
  'galpones',
  {
    id: bigint({ mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    nombre: text().notNull(),
    avesIniciales: integer().notNull(),
    fechaLlegada: date({ mode: 'string' }).notNull(),
    edadSemanasLlegada: integer().notNull().default(0),
    /** Alimento por ave al día. Gallinas en postura ≈ 115 g. */
    gramosAveDia: numeric({ precision: 6, scale: 1, mode: 'number' }).notNull().default(115),
    activo: boolean().notNull().default(true),
    creadoEn: creadoEn(),
  },
  (t) => [
    check('galpones_aves_validas', sql`${t.avesIniciales} >= 0 and ${t.edadSemanasLlegada} >= 0`),
    check('galpones_gramos_validos', sql`${t.gramosAveDia} > 0`),
  ],
);

/** Registro diario por galpón (uno por día). */
export const galponRegistros = pgTable(
  'galpon_registros',
  {
    id: bigint({ mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    galponId: bigint({ mode: 'number' })
      .notNull()
      .references(() => galpones.id, { onDelete: 'restrict' }),
    fecha: date({ mode: 'string' }).notNull(),
    huevos: integer().notNull().default(0),
    muertas: integer().notNull().default(0),
    alimentoKg: numeric({ precision: 8, scale: 2, mode: 'number' }).notNull().default(0),
    notas: text(),
    registradoPor: bigint({ mode: 'number' }).references(() => usuarios.id),
    registradoPorNombre: text(),
    creadoEn: creadoEn(),
    actualizadoEn: actualizadoEn(),
  },
  (t) => [
    unique('galpon_registros_un_dia').on(t.galponId, t.fecha),
    index('galpon_registros_fecha_idx').on(t.fecha.desc()),
    check(
      'galpon_registros_valores_validos',
      sql`${t.huevos} >= 0 and ${t.muertas} >= 0 and ${t.alimentoKg} >= 0`,
    ),
  ],
);
