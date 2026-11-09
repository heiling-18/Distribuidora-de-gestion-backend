import { z } from 'zod';
import { paginacionSchema } from '../../utils/paginacion/paginacion.js';
import { fechaDia, filtroActivo, textoOpcional } from '../comunes/comunes.validator.js';

const entero = (max: number) => z.number().int('Debe ser un número entero').min(0, 'No puede ser negativo').max(max);

const campos = {
  nombre: z.string().trim().min(1).max(80),
  avesIniciales: entero(1_000_000),
  fechaLlegada: fechaDia,
  edadSemanasLlegada: entero(200),
  gramosAveDia: z.number().positive().max(1000),
};

export const crearGalponSchema = z
  .object({ ...campos, edadSemanasLlegada: campos.edadSemanasLlegada.default(0), gramosAveDia: campos.gramosAveDia.default(115) })
  .strict();

export const actualizarGalponSchema = z
  .object({ ...campos, activo: z.boolean() })
  .partial()
  .strict()
  .refine((d) => Object.keys(d).length > 0, 'No enviaste ningún cambio');

export const listarGalponesSchema = z.object({ activo: filtroActivo });

export const paramRegistro = z.object({
  id: z.coerce.number().int().positive(),
  fecha: fechaDia,
});

export const guardarRegistroSchema = z
  .object({
    huevos: entero(1_000_000).default(0),
    muertas: entero(1_000_000).default(0),
    alimentoKg: z.number().min(0).max(100_000).default(0),
    notas: textoOpcional(500),
  })
  .strict();

export const listarRegistrosSchema = paginacionSchema.extend({
  galponId: z.coerce.number().int().positive().optional(),
  desde: fechaDia.optional(),
  hasta: fechaDia.optional(),
});

export type CrearGalponDto = z.infer<typeof crearGalponSchema>;
export type ActualizarGalponDto = z.infer<typeof actualizarGalponSchema>;
export type GuardarRegistroDto = z.infer<typeof guardarRegistroSchema>;
export type FiltroRegistros = z.infer<typeof listarRegistrosSchema>;
