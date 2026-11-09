import { crearApp } from './app.js';
import { env } from './config/env.js';
import { cerrarDb } from './database/client.js';
import { logger } from './utils/logger/logger.js';

const app = crearApp();

const servidor = app.listen(env.PORT, () => {
  logger.info(`API escuchando en http://localhost:${env.PORT} (${env.NODE_ENV})`);
});

/** Cierre ordenado: deja terminar las peticiones en curso y libera las conexiones a PostgreSQL. */
function apagar(senal: string) {
  logger.info(`${senal} recibido, cerrando...`);
  servidor.close(async () => {
    await cerrarDb();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGINT', () => apagar('SIGINT'));
process.on('SIGTERM', () => apagar('SIGTERM'));
