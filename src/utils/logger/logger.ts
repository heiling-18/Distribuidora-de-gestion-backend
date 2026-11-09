import { pino } from 'pino';
import { env } from '../../config/env.js';

export const logger = pino({
  level: env.esTest ? 'silent' : env.LOG_LEVEL,
  // Nunca escribir en los logs la sesión (cookie de petición o la que pone el login) ni claves.
  redact: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]', '*.password', '*.clave'],
  transport: env.NODE_ENV === 'development' ? { target: 'pino-pretty', options: { translateTime: 'SYS:HH:MM:ss' } } : undefined,
});
