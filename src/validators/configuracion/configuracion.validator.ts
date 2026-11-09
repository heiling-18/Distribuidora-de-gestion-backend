import { z } from 'zod';

/** Ajustes que el administrador puede cambiar. */
export const actualizarConfiguracionSchema = z
  .object({
    nombreNegocio: z.string().trim().min(1).max(80),
    /** NIT que aparece en los tickets, p. ej. "901.458.712-4". */
    nit: z.string().trim().max(30),
    /** Celular que recibe el resumen de cada venta por WhatsApp (solo dígitos, sin +57). */
    telefonoWhatsapp: z.string().trim().regex(/^\d{0,15}$/, 'Solo números, sin espacios ni +57'),
  })
  .partial()
  .strict()
  .refine((d) => Object.keys(d).length > 0, 'No enviaste ningún cambio');

export type ActualizarConfiguracionDto = z.infer<typeof actualizarConfiguracionSchema>;
