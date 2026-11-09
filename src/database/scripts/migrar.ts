import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { env } from '../../config/env.js';
import { logger } from '../../utils/logger/logger.js';
import { cerrarDb, db } from '../client.js';

const carpetaMigraciones = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

/** Aplica las migraciones pendientes. Solo agrega lo que falta; nunca vuelve a correr una ya aplicada. */
export async function aplicarMigraciones(): Promise<void> {
  const base = new URL(env.databaseUrl).pathname.slice(1);
  logger.info(`Aplicando migraciones en "${base}"...`);
  await migrate(db, { migrationsFolder: carpetaMigraciones });
  logger.info('Migraciones al día');
}

// Ejecutado directamente: `npm run db:migrate`
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  aplicarMigraciones()
    .catch((err) => {
      logger.error({ err }, 'Falló la migración');
      process.exitCode = 1;
    })
    .finally(cerrarDb);
}
