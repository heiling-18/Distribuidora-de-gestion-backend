import { bigint, jsonb, pgTable, text } from 'drizzle-orm/pg-core';
import { actualizadoEn } from '../comunes/columnas.js';
import { usuarios } from '../usuarios/usuarios.model.js';

/** Ajustes del negocio (teléfono de WhatsApp, nombre, etc.) en vez de valores fijos en el código. */
export const configuracion = pgTable('configuracion', {
  clave: text().primaryKey(),
  valor: jsonb().notNull(),
  actualizadoPor: bigint({ mode: 'number' }).references(() => usuarios.id),
  actualizadoEn: actualizadoEn(),
});
