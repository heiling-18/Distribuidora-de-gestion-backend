import { pool } from '../../database/client.js';

export async function pingBaseDeDatos(): Promise<void> {
  await pool.query('select 1');
}
