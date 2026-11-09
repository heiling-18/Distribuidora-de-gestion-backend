import type { UsuarioSesion } from '../auth/auth.js';

declare global {
  namespace Express {
    interface Request {
      /** Lo llena el middleware autenticar. */
      usuario?: UsuarioSesion;
    }
  }
}

export {};
