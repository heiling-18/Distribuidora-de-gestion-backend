import { sql } from 'drizzle-orm';
import { bigint, boolean, integer, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { actualizadoEn, creadoEn } from '../comunes/columnas.js';
import { rolUsuario } from '../comunes/enums.js';

export const usuarios = pgTable(
  'usuarios',
  {
    id: bigint({ mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    email: text().notNull(),
    nombre: text().notNull(),
    rol: rolUsuario().notNull(),
    /** argon2 (o bcrypt importado de Supabase, que se re-hashea en el primer login). */
    passwordHash: text(),
    activo: boolean().notNull().default(true),
    /** Se incrementa al cambiar la clave o desactivar al usuario: invalida los JWT emitidos antes. */
    versionSesion: integer().notNull().default(0),
    ultimoLogin: timestamp({ withTimezone: true }),
    creadoEn: creadoEn(),
    actualizadoEn: actualizadoEn(),
  },
  (t) => [uniqueIndex('usuarios_email_unico').on(sql`lower(${t.email})`)],
);
