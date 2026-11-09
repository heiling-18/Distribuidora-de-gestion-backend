import { z } from 'zod';
import { paginacionSchema } from '../../utils/paginacion/paginacion.js';
import { busqueda, filtroActivo, textoOpcional } from '../comunes/comunes.validator.js';

const campos = {
  documento: textoOpcional(30),
  nombre: z.string().trim().min(2, 'El nombre es muy corto').max(150),
  telefono: textoOpcional(30),
  direccion: textoOpcional(200),
};

export const crearClienteSchema = z.object(campos).strict();

export const actualizarClienteSchema = z
  .object({ ...campos, activo: z.boolean() })
  .partial()
  .strict()
  .refine((d) => Object.keys(d).length > 0, 'No enviaste ningún cambio');

export const listarClientesSchema = paginacionSchema.extend({
  /** Busca por nombre, documento o teléfono. */
  q: busqueda.optional(),
  activo: filtroActivo,
});

export type CrearClienteDto = z.infer<typeof crearClienteSchema>;
export type ActualizarClienteDto = z.infer<typeof actualizarClienteSchema>;
export type FiltroClientes = z.infer<typeof listarClientesSchema>;
