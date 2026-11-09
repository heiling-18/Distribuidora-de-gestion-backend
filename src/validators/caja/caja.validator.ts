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
    observaciones: z.string().trim().max(500).optional(),
  })
  .strict();

export const listarCierresSchema = paginacionSchema.extend({
  desde: fechaDia.optional(),
  hasta: fechaDia.optional(),
});
