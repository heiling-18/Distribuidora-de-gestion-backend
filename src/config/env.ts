import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config({ quiet: true });

const esquema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.url(),
  DATABASE_URL_TEST: z.url().optional(),
  CORS_ORIGIN: z.string().min(1),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET debe tener al menos 32 caracteres'),
  /** Duración de la sesión en horas. */
  SESION_HORAS: z.coerce.number().positive().default(12),
  /** "none" solo si el frontend está en otro dominio (exige HTTPS). */
  COOKIE_SAMESITE: z.enum(['lax', 'strict', 'none']).default('lax'),
  TZ_NEGOCIO: z.string().default('America/Bogota'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
});

const resultado = esquema.safeParse(process.env);
if (!resultado.success) {
  const errores = resultado.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
  throw new Error(`Variables de entorno inválidas:\n${errores}`);
}
const variables = resultado.data;

const esTest = variables.NODE_ENV === 'test';
const databaseUrl = esTest ? variables.DATABASE_URL_TEST : variables.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('Falta DATABASE_URL_TEST para correr los tests');
}
// Protección: los tests vacían tablas, así que solo pueden apuntar a una base *_test.
if (esTest && !new URL(databaseUrl).pathname.endsWith('_test')) {
  throw new Error('En NODE_ENV=test la base de datos debe terminar en "_test"');
}

export const env = {
  ...variables,
  databaseUrl,
  esProduccion: variables.NODE_ENV === 'production',
  esTest,
  corsOrigins: variables.CORS_ORIGIN.split(',').map((o) => o.trim()),
} as const;
