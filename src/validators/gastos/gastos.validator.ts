import { z } from 'zod';
import { paginacionSchema } from '../../utils/paginacion/paginacion.js';
import { fechaDia, montoPesos } from '../comunes/comunes.validator.js';

export const CATEGORIAS_GASTO = ['arriendo', 'compra_inventario', 'servicios', 'nomina', 'transporte', 'otros'] as const;

const campos = {
  /** Día al que pertenece el gasto. Por defecto, hoy. */
  fecha: fechaDia,
  categoria: z.enum(CATEGORIAS_GASTO),
  descripcion: z.string().trim().min(2, 'Describe el gasto').max(300),
  monto: montoPesos.refine((n) => n > 0, 'El monto debe ser mayor a 0'),
  /** efectivo sale del cajón y se descuenta del dinero esperado de la caja abierta. */
  metodoPago: z.enum(['efectivo', 'transferencia']),
};

export const crearGastoSchema = z
  .object({ ...campos, fecha: campos.fecha.optional(), metodoPago: campos.metodoPago.default('efectivo') })
  .strict();

export const actualizarGastoSchema = z
  .object(campos)
  .partial()
  .strict()
  .refine((d) => Object.keys(d).length > 0, 'No enviaste ningún cambio');

export const listarGastosSchema = paginacionSchema.extend({
  desde: fechaDia.optional(),
  hasta: fechaDia.optional(),
  categoria: z.enum(CATEGORIAS_GASTO).optional(),
  metodoPago: z.enum(['efectivo', 'transferencia']).optional(),
  cajaId: z.coerce.number().int().positive().optional(),
});

export type CrearGastoDto = z.infer<typeof crearGastoSchema>;
export type ActualizarGastoDto = z.infer<typeof actualizarGastoSchema>;
export type FiltroGastos = z.infer<typeof listarGastosSchema>;
