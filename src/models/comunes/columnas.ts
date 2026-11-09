import { numeric, timestamp } from 'drizzle-orm/pg-core';

/** Dinero en pesos con 2 decimales. Se lee como number en TypeScript. */
export const dinero = () => numeric({ precision: 14, scale: 2, mode: 'number' });
/** Cantidades de inventario (admite kilos con decimales). */
export const cantidad = () => numeric({ precision: 12, scale: 3, mode: 'number' });

export const creadoEn = () => timestamp({ withTimezone: true }).notNull().defaultNow();
export const actualizadoEn = () =>
  timestamp({ withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());
