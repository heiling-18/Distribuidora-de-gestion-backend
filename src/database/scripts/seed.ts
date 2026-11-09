/**
 * Usuarios de prueba y configuración base para desarrollo. No crea productos, clientes ni galpones:
 * esos datos se cargan desde la app (o llegan con la importación de Supabase).
 * Se puede correr varias veces: no duplica nada.
 * Se niega a correr en producción.
 */
import { hash } from '@node-rs/argon2';
import { env } from '../../config/env.js';
import { configuracion, usuarios } from '../../models/index.js';
import { logger } from '../../utils/logger/logger.js';
import { cerrarDb, db } from '../client.js';

if (env.esProduccion) {
  throw new Error('El seed es solo para desarrollo');
}

/** Clave de los usuarios de prueba. Se cambia con SEED_PASSWORD en .env. */
const CLAVE_PRUEBA = process.env.SEED_PASSWORD ?? 'dyms-dev-2026';

async function sembrar() {
  const passwordHash = await hash(CLAVE_PRUEBA);

  await db.transaction(async (tx) => {
    await tx
      .insert(usuarios)
      .values([
        { email: 'admin@dyms.local', nombre: 'Administrador', rol: 'admin', passwordHash },
        { email: 'vendedor@dyms.local', nombre: 'Vendedor de prueba', rol: 'vendedor', passwordHash },
        { email: 'galponero@dyms.local', nombre: 'Galponero de prueba', rol: 'galponero', passwordHash },
      ])
      .onConflictDoNothing();

    await tx
      .insert(configuracion)
      .values([
        { clave: 'nombre_negocio', valor: "DYM'S" },
        { clave: 'telefono_whatsapp', valor: '' },
      ])
      .onConflictDoNothing();
  });

  logger.info('Seed listo. Usuarios: admin@dyms.local, vendedor@dyms.local, galponero@dyms.local (clave: SEED_PASSWORD)');
}

sembrar()
  .catch((err) => {
    logger.error({ err }, 'Falló el seed');
    process.exitCode = 1;
  })
  .finally(cerrarDb);
