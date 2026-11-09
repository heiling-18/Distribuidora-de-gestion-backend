import { createHash } from 'node:crypto';
import cors from 'cors';
import type { Request } from 'express';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import helmet from 'helmet';
import { env } from '../../config/env.js';
import { NOMBRE_COOKIE_SESION } from '../../config/sesion.js';

export const cabecerasSeguras = helmet();

export const corsPermitido = cors({
  origin: env.corsOrigins,
  credentials: true, // la sesión viaja en cookie httpOnly
});

/**
 * Clave del límite general. El frontend llama a la API a través del reenvío de Next, así que todas
 * las peticiones llegan con la IP del servidor de Next: contar por IP juntaría a todos los usuarios.
 * Se cuenta por sesión (hash de la cookie) y, si no hay sesión, por IP.
 */
function clavePorSesion(req: Request): string {
  const token = (req.cookies as Record<string, string> | undefined)?.[NOMBRE_COOKIE_SESION];
  if (token) return `sesion:${createHash('sha256').update(token).digest('hex')}`;
  return `ip:${ipKeyGenerator(req.ip ?? '')}`;
}

/** Límite general: 300 peticiones por minuto por sesión. */
export const limiteGeneral = rateLimit({
  windowMs: 60_000,
  limit: 300,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: clavePorSesion,
  skip: () => env.esTest,
});

/** Correo del intento de login, normalizado. */
function clavePorCorreo(req: Request): string {
  const email = (req.body as { email?: unknown } | undefined)?.email;
  return `login:${String(email ?? '').trim().toLowerCase()}`;
}

/**
 * Login: máximo 10 intentos fallidos por correo cada 15 minutos (los exitosos no cuentan).
 * Por correo y no por IP: detrás del proxy de Next la IP es la misma para todos.
 */
export const limiteLogin = rateLimit({
  windowMs: 15 * 60_000,
  limit: 10,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: clavePorCorreo,
  skip: () => env.esTest,
  message: {
    error: { codigo: 'DEMASIADOS_INTENTOS', mensaje: 'Demasiados intentos fallidos. Espera 15 minutos e inténtalo de nuevo.' },
  },
});
