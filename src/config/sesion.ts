import type { CookieOptions } from 'express';
import { env } from './env.js';

export const NOMBRE_COOKIE_SESION = 'dyms_sesion';

export const opcionesCookieSesion: CookieOptions = {
  httpOnly: true, // JavaScript del navegador no puede leerla
  secure: env.esProduccion || env.COOKIE_SAMESITE === 'none', // solo viaja por HTTPS en producción
  sameSite: env.COOKIE_SAMESITE,
  path: '/',
  maxAge: env.SESION_HORAS * 3600 * 1000,
};
