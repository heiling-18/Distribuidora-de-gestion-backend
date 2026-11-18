import { z } from 'zod';
import { paginacionSchema } from '../../utils/paginacion/paginacion.js';
import { fechaDia, montoPesos } from '../comunes/comunes.validator.js';

export const abrirCajaSchema = z
  .object({
    montoInicial: montoPesos,
  })
  .strict();

/**
 * Al cerrar, el cliente solo informa lo que contó. Lo esperado y la diferencia
 * los calcula el servidor; por eso se rechaza cualquier otro campo.
 */
export const cerrarCajaSchema = z
  .object({
    dineroReal: montoPesos,
    /** Lo que se deja en la gaveta para abrir mañana (0 ≤ base ≤ dineroReal). Si no viene, se deja todo. */
    baseSiguiente: montoPesos.optional(),
    observaciones: z.string().trim().max(500).optional(),
  })
  .strict();

/** El administrador cambia la base de la caja abierta, siempre con un motivo. */
export const ajustarBaseSchema = z
  .object({
    monto: montoPesos,
    motivo: z.string().trim().min(1, 'Escribe por qué cambias la base').max(120),
  })
  .strict();

export const listarCierresSchema = paginacionSchema.extend({
  desde: fechaDia.optional(),
  hasta: fechaDia.optional(),
});
