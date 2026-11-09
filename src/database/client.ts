import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { env } from '../config/env.js';
import { logger } from '../utils/logger/logger.js';
import * as schema from '../models/index.js';

export const pool = new pg.Pool({
  connectionString: env.databaseUrl,
  max: 10,
  connectionTimeoutMillis: 5_000,
  idleTimeoutMillis: 30_000,
});

pool.on('error', (err) => logger.error({ err }, 'Error inesperado en una conexión inactiva de PostgreSQL'));

export const db = drizzle({ client: pool, schema, casing: 'snake_case' });

export type Db = typeof db;
/** Transacción de Drizzle: se pasa a los repositorios para que todo ocurra en la misma transacción. */
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

export async function cerrarDb(): Promise<void> {
  await pool.end();
}
