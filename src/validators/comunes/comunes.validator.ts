import { z } from 'zod';

/** Parámetro :id numérico positivo. */
export const paramId = z.object({
  id: z.coerce.number().int().positive(),
});

const conDecimales = (decimales: number) => (n: number) => {
  const factor = 10 ** decimales;
  return Math.abs(n * factor - Math.round(n * factor)) < 1e-6;
};

/** Monto en pesos: no negativo, máximo 2 decimales. */
export const montoPesos = z
  .number({ error: 'Debe ser un número' })
  .nonnegative('No puede ser negativo')
  .max(10_000_000_000, 'Monto demasiado alto')
  .refine(conDecimales(2), 'Máximo 2 decimales');

/** Cantidad de inventario: máximo 3 decimales (kilos). Puede ser negativa en ajustes. */
export const cantidadInventario = z
  .number({ error: 'Debe ser un número' })
  .min(-1_000_000)
  .max(1_000_000)
  .refine(conDecimales(3), 'Máximo 3 decimales');

/** Fecha del calendario, "YYYY-MM-DD". */
export const fechaDia = z.iso.date('Fecha inválida, usa YYYY-MM-DD');

/** Filtro ?activo=true|false|todos para listados con borrado lógico. Por defecto solo activos. */
export const filtroActivo = z.enum(['true', 'false', 'todos']).default('true');

/** Texto de búsqueda libre. */
export const busqueda = z.string().trim().min(1).max(100);

/** Texto opcional: cadena vacía se guarda como null. */
export const textoOpcional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((s) => (s === '' ? null : s))
    .nullable()
    .optional();
