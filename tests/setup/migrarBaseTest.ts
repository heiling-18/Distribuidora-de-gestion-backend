/**
 * Se ejecuta una vez antes de todos los tests: deja dyms_test con el esquema al día.
 * env.ts garantiza que con NODE_ENV=test solo se toca una base *_test.
 */
export default async function () {
  process.env.NODE_ENV = 'test';
  const { aplicarMigraciones } = await import('../../src/database/scripts/migrar.js');
  const { cerrarDb } = await import('../../src/database/client.js');
  await aplicarMigraciones();
  await cerrarDb();
}
