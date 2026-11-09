import jwt from 'jsonwebtoken';
import { env } from '../../config/env.js';
import type { Rol } from '../../interfaces/auth/auth.js';

const EMISOR = 'dyms-api';

export interface PayloadSesion {
  /** id del usuario */
  sub: string;
  rol: Rol;
  /** versionSesion del usuario al emitir el token */
  v: number;
}

export function firmarToken(payload: PayloadSesion): string {
  return jwt.sign(payload, env.JWT_SECRET, {
    algorithm: 'HS256',
    issuer: EMISOR,
    expiresIn: Math.round(env.SESION_HORAS * 3600),
  });
}

/** Devuelve el payload o null si el token es inválido, está vencido o fue alterado. */
export function verificarToken(token: string): PayloadSesion | null {
  try {
    const datos = jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'], issuer: EMISOR });
    if (typeof datos !== 'object' || typeof datos.sub !== 'string' || typeof datos.v !== 'number') return null;
    return { sub: datos.sub, rol: datos.rol as Rol, v: datos.v };
  } catch {
    return null;
  }
}
