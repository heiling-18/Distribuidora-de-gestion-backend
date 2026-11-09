import { z } from 'zod';
import { LARGO_MINIMO_CLAVE } from '../../utils/seguridad/password.js';

export const claveNueva = z
  .string()
  .min(LARGO_MINIMO_CLAVE, `La clave debe tener al menos ${LARGO_MINIMO_CLAVE} caracteres`)
  .max(200);

export const loginSchema = z.object({
  email: z.string().trim().pipe(z.email('Correo inválido')),
  clave: z.string().min(1, 'Escribe tu clave').max(200),
});

export const cambiarClaveSchema = z.object({
  claveActual: z.string().min(1).max(200),
  claveNueva,
});
