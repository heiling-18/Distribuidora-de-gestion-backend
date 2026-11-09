export const ROLES = ['admin', 'vendedor', 'galponero'] as const;
export type Rol = (typeof ROLES)[number];

/** Usuario autenticado de la petición. Nunca incluye el hash de la clave. */
export interface UsuarioSesion {
  id: number;
  email: string;
  nombre: string;
  rol: Rol;
}

/** Usuario tal como lo devuelve la API. */
export interface UsuarioPublico extends UsuarioSesion {
  activo: boolean;
  ultimoLogin: Date | null;
  creadoEn: Date;
}
