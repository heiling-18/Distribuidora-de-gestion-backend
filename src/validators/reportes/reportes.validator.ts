import { z } from 'zod';

/** Mes como "YYYY-MM" o "YYYY-MM-01". Se normaliza a "YYYY-MM-01". */
export const mes = z
  .string()
  .trim()
  .regex(/^\d{4}-(0[1-9]|1[0-2])(-01)?$/, 'Mes inválido, usa YYYY-MM')
  .transform((m) => `${m.slice(0, 7)}-01`);

export const reporteMesSchema = z.object({ mes: mes.optional() });

export const cerrarMesSchema = z.object({ mes }).strict();
