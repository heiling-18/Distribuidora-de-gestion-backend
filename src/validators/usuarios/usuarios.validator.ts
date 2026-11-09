import { z } from 'zod';
import { ROLES } from '../../interfaces/auth/auth.js';
import { claveNueva } from '../auth/auth.validator.js';

const nombre = z.string().trim().min(2, 'El nombre es muy corto').max(100);

export const crearUsuarioSchema = z.object({
  email: z.string().trim().pipe(z.email('Correo inválido')),
  nombre,
  rol: z.enum(ROLES),
  clave: claveNueva,
});

export const actualizarUsuarioSchema = z
  .object({
    nombre: nombre.optional(),
    rol: z.enum(ROLES).optional(),
    activo: z.boolean().optional(),
  })
  .strict()
  .refine((d) => Object.keys(d).length > 0, 'No enviaste ningún cambio');

export const restablecerClaveSchema = z.object({ clave: claveNueva });
