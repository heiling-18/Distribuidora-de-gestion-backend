import { sql } from 'drizzle-orm';
import { bigint, boolean, check, date, index, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { creadoEn, dinero } from '../comunes/columnas.js';
import { estadoCaja } from '../comunes/enums.js';
import { usuarios } from '../usuarios/usuarios.model.js';

export const cajas = pgTable(
  'cajas',
  {
    id: bigint({ mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    /** Día del negocio (America/Bogota) en que se abrió. */
    fecha: date({ mode: 'string' }).notNull(),
    estado: estadoCaja().notNull().default('abierta'),
    montoInicial: dinero().notNull(),
    abiertaPor: bigint({ mode: 'number' }).references(() => usuarios.id),
    abiertaEn: creadoEn(),
    cerradaPor: bigint({ mode: 'number' }).references(() => usuarios.id),
    cerradaEn: timestamp({ withTimezone: true }),
    /** Lo que se dejó en la gaveta al cerrar: con eso se abre sola la caja del día siguiente. */
    baseSiguiente: dinero(),
    /** true si la abrió el sistema (con la base del cierre anterior) y no una persona. */
    aperturaAutomatica: boolean().notNull().default(false),
    /** Base con la que se abrió, antes de que el administrador la ajustara. */
    baseOriginal: dinero(),
    ajusteMotivo: text(),
    /** Nombre del administrador que ajustó la base. */
    ajustadaPor: text(),
  },
  (t) => [
    // Solo puede haber una caja abierta a la vez.
    uniqueIndex('cajas_una_abierta').on(t.estado).where(sql`${t.estado} = 'abierta'`),
    index('cajas_fecha_idx').on(t.fecha),
    check('cajas_monto_inicial_valido', sql`${t.montoInicial} >= 0`),
    check('cajas_bases_validas', sql`coalesce(${t.baseSiguiente}, 0) >= 0 and coalesce(${t.baseOriginal}, 0) >= 0`),
    check(
      'cajas_cierre_consistente',
      sql`(${t.estado} = 'abierta' and ${t.cerradaEn} is null) or (${t.estado} = 'cerrada' and ${t.cerradaEn} is not null)`,
    ),
  ],
);

/** Comprobante de arqueo. Uno por caja; nunca se edita ni se borra. */
export const cierresCaja = pgTable('cierres_caja', {
  id: bigint({ mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  cajaId: bigint({ mode: 'number' })
    .notNull()
    .unique()
    .references(() => cajas.id),
  montoInicial: dinero().notNull(),
  ventasEfectivo: dinero().notNull(),
  ventasTransferencia: dinero().notNull(),
  gastosEfectivo: dinero().notNull(),
  dineroEsperado: dinero().notNull(),
  dineroReal: dinero().notNull(),
  diferencia: dinero().notNull(),
  observaciones: text(),
  /** Lo que quedó en la gaveta para mañana (null en cierres importados de antes). */
  baseSiguiente: dinero(),
  /** Lo que se sacó de la gaveta: dinero contado − base para mañana. */
  retirado: dinero(),
  cerradoPor: bigint({ mode: 'number' }).references(() => usuarios.id),
  /** Nombre de quien cerró (para cierres importados sin usuario enlazado). */
  responsable: text().notNull(),
  cerradoEn: creadoEn(),
});
