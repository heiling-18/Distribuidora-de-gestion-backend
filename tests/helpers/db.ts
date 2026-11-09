import { sql } from 'drizzle-orm';
import { env } from '../../src/config/env.js';
import { db, type Tx } from '../../src/database/client.js';

/**
 * Vacía todas las tablas de la base de pruebas. Para tests que pasan por HTTP
 * y no pueden usar una transacción revertida. Se niega a correr fuera de una base *_test.
 */
export async function limpiarBase(): Promise<void> {
  if (!env.esTest || !new URL(env.databaseUrl).pathname.endsWith('_test')) {
    throw new Error('limpiarBase solo puede correr contra una base *_test');
  }
  const filas = await db.execute<{ tabla: string }>(
    sql`select tablename as tabla from pg_tables where schemaname = 'public'`,
  );
  const tablas = filas.rows.map((f) => `"${f.tabla}"`).join(', ');
  if (tablas) await db.execute(sql.raw(`truncate ${tablas} restart identity cascade`));
}

class Revertir extends Error {}

/**
 * Corre la prueba dentro de una transacción y la revierte al final,
 * para que ningún test deje datos en la base.
 */
export async function enTransaccionRevertida(prueba: (tx: Tx) => Promise<void>): Promise<void> {
  try {
    await db.transaction(async (tx) => {
      await prueba(tx);
      throw new Revertir();
    });
  } catch (err) {
    if (!(err instanceof Revertir)) throw err;
  }
}

/** Ejecuta una operación en un savepoint y devuelve el error de PostgreSQL, si lo hubo. */
export async function errorDe(tx: Tx, operacion: (tx: Tx) => Promise<unknown>): Promise<string | undefined> {
  try {
    await tx.transaction(async (sp) => {
      await operacion(sp);
    });
    return undefined;
  } catch (err) {
    const causa = (err as { cause?: { constraint?: string; message?: string } }).cause;
    return causa?.constraint ?? causa?.message ?? (err as Error).message;
  }
}
