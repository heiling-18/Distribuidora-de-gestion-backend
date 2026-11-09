import { bigint, index, jsonb, pgTable, text } from 'drizzle-orm/pg-core';
import { creadoEn } from '../comunes/columnas.js';
import { usuarios } from '../usuarios/usuarios.model.js';

/** Registro de acciones sensibles: quién, qué, cuándo, y el antes y después. */
export const auditoria = pgTable(
  'auditoria',
  {
    id: bigint({ mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    usuarioId: bigint({ mode: 'number' }).references(() => usuarios.id),
    /** Ej.: "venta.anular", "producto.cambiar_precio", "caja.cerrar". */
    accion: text().notNull(),
    entidad: text().notNull(),
    entidadId: text(),
    antes: jsonb(),
    despues: jsonb(),
    ip: text(),
    creadoEn: creadoEn(),
  },
  (t) => [
    index('auditoria_entidad_idx').on(t.entidad, t.entidadId),
    index('auditoria_fecha_idx').on(t.creadoEn.desc()),
  ],
);
