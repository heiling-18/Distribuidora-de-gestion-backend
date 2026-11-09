import { z } from 'zod';
import { paginacionSchema } from '../../utils/paginacion/paginacion.js';
import { fechaDia } from '../comunes/comunes.validator.js';

const maxDecimales = (decimales: number) => (n: number) => {
  const factor = 10 ** decimales;
  return Math.abs(n * factor - Math.round(n * factor)) < 1e-6;
};

const itemVenta = z
  .object({
    productoId: z.number().int().positive(),
    cantidad: z.number().positive('La cantidad debe ser mayor a 0').max(100_000).refine(maxDecimales(3), 'Máximo 3 decimales'),
    tipoPrecio: z.enum(['detal', 'mayorista']).default('detal'),
  })
  .strict();

/**
 * El cliente solo dice qué productos y cuántos. Los precios, el IVA y los totales
 * los pone el servidor desde la base; por eso se rechaza cualquier otro campo.
 */
export const registrarVentaSchema = z
  .object({
    /** UUID que genera el frontend por cada intento de venta: reintentar con el mismo no duplica la venta. */
    idempotencyKey: z.uuid('idempotencyKey debe ser un UUID'),
    metodoPago: z.enum(['efectivo', 'transferencia']),
    clienteId: z.number().int().positive().optional(),
    /** Solo si no se elige un cliente registrado. Por defecto "Cliente General". */
    clienteNombre: z.string().trim().min(1).max(120).optional(),
    items: z.array(itemVenta).min(1, 'La venta no tiene productos').max(100),
  })
  .strict()
  .refine((v) => !(v.clienteId && v.clienteNombre), 'Envía clienteId o clienteNombre, no ambos');

export type RegistrarVentaDto = z.infer<typeof registrarVentaSchema>;

export const listarVentasSchema = paginacionSchema.extend({
  desde: fechaDia.optional(),
  hasta: fechaDia.optional(),
  estado: z.enum(['completada', 'anulada']).optional(),
  metodoPago: z.enum(['efectivo', 'transferencia']).optional(),
  cajaId: z.coerce.number().int().positive().optional(),
  vendedorId: z.coerce.number().int().positive().optional(),
  clienteId: z.coerce.number().int().positive().optional(),
  /** Busca por número de ticket o nombre del cliente. */
  q: z.string().trim().min(1).max(100).optional(),
  /** Incluir los productos de cada venta (para tablas y exportar). */
  conItems: z.enum(['true', 'false']).optional(),
});

export type FiltroVentas = z.infer<typeof listarVentasSchema>;

export const anularVentaSchema = z
  .object({
    motivo: z.string().trim().min(3, 'Escribe el motivo de la anulación').max(200),
  })
  .strict();
