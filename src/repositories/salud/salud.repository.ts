import { pool } from '../../database/client.js';

export async function pingBaseDeDatos(): Promise<void> {
  await pool.query('select 1');
}

/**
 * Marcas de tiempo (`created_at`) de las migraciones aplicadas, de la tabla que lleva Drizzle.
 * Vacío si todavía no se ha migrado nada.
 */
export async function migracionesAplicadas(): Promise<number[]> {
  const { rows } = await pool.query<{ existe: boolean }>("select to_regclass('drizzle.__drizzle_migrations') is not null as existe");
  if (!rows[0]?.existe) return [];
  const res = await pool.query<{ created_at: string }>('select created_at from drizzle.__drizzle_migrations order by created_at');
  return res.rows.map((r) => Number(r.created_at));
}
