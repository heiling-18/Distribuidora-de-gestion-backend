import type { Request, RequestHandler } from 'express';
import { NOMBRE_COOKIE_SESION } from '../../config/sesion.js';
import type { Rol, UsuarioSesion } from '../../interfaces/auth/auth.js';
import { sesionDesdeToken } from '../../services/auth/auth.service.js';
import { AppError } from '../../utils/errores/AppError.js';

function leerToken(req: Request): string | undefined {
  const cookie = (req.cookies as Record<string, string> | undefined)?.[NOMBRE_COOKIE_SESION];
  if (cookie) return cookie;
  // Alternativa para clientes que no usan cookies (apps móviles, scripts).
  const cabecera = req.headers.authorization;
  return cabecera?.startsWith('Bearer ') ? cabecera.slice(7) : undefined;
}

/** Exige una sesión válida. Todo lo que se monte después de este middleware queda protegido. */
export const autenticar: RequestHandler = async (req, _res, next) => {
  const token = leerToken(req);
  if (!token) return next(AppError.noAutenticado());

  const usuario = await sesionDesdeToken(token);
  if (!usuario) return next(AppError.noAutenticado('Tu sesión expiró o ya no es válida. Inicia sesión de nuevo.'));

  req.usuario = usuario;
  next();
};

/** Permite el paso solo a los roles indicados. Va después de `autenticar`. */
export function requerirRol(...roles: Rol[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.usuario) return next(AppError.noAutenticado());
    if (!roles.includes(req.usuario.rol)) return next(AppError.prohibido());
    next();
  };
}

/** Usuario autenticado de la petición (para controladores detrás de `autenticar`). */
export function usuarioActual(req: Request): UsuarioSesion {
  if (!req.usuario) throw AppError.noAutenticado();
  return req.usuario;
}
