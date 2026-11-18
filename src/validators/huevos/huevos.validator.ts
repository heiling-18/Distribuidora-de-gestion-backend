import { z } from 'zod';
import { fechaDia, montoPesos, textoOpcional } from '../comunes/comunes.validator.js';

const nombreTipo = z.string().trim().min(1, 'Escribe el nombre del tamaño').max(30);
const cantidad = (max: number) => z.number({ error: 'Debe ser un número' }).int('Debe ser un número entero').min(0).max(max);
/** carton: 30 huevos · unidad: un huevo suelto. */
const forma = z.enum(['carton', 'unidad']);

export const listarTiposSchema = z.object({
  activo: z.enum(['true', 'false', 'todos']).default('todos'),
});

export const crearTipoSchema = z
  .object({
    nombre: nombreTipo,
    precioVenta: montoPesos.default(0),
    orden: cantidad(1000).optional(),
  })
  .strict();

/** El vendedor solo puede cambiar el precio; nombre y activo son del administrador (lo valida el servicio). */
export const actualizarTipoSchema = z
  .object({
    nombre: nombreTipo,
    precioVenta: montoPesos,
    orden: cantidad(1000),
    activo: z.boolean(),
  })
  .partial()
  .strict()
  .refine((d) => Object.keys(d).length > 0, 'No enviaste ningún cambio');

/** Un cobro del carrito: varias líneas (tamaños, cartón o unidad). El precio lo pone el servidor. */
export const venderSchema = z
  .object({
    idempotencyKey: z.uuid('Clave de venta inválida'),
    fecha: fechaDia.optional(),
    items: z
      .array(
        z
          .object({ tipoId: z.number().int().positive(), forma, cantidad: cantidad(100_000).min(1, 'La cantidad debe ser mayor a 0') })
          .strict(),
      )
      .min(1, 'El carrito está vacío')
      .max(50),
    cliente: textoOpcional(120),
    metodoPago: z.enum(['efectivo', 'transferencia']).default('efectivo'),
  })
  .strict();

export const rotosSchema = z
  .object({
    fecha: fechaDia.optional(),
    tipoId: z.number().int().positive(),
    forma,
    cantidad: cantidad(100_000).min(1, 'La cantidad debe ser mayor a 0'),
    notas: textoOpcional(300),
  })
  .strict();

/** Carga al inventario: por tamaño, cartones + huevos sueltos, con el precio de venta del cartón. */
export const ingresoSchema = z
  .object({
    fecha: fechaDia.optional(),
    /** Galpón de donde salieron (opcional). */
    origen: textoOpcional(120),
    items: z
      .array(
        z
          .object({
            tipoId: z.number().int().positive(),
            cartones: cantidad(100_000).default(0),
            sueltos: cantidad(100_000).default(0),
            precioVenta: montoPesos,
          })
          .strict()
          .refine((i) => i.cartones + i.sueltos > 0, 'Cada línea debe tener al menos un huevo'),
      )
      .min(1, 'No hay nada para ingresar')
      .max(50),
  })
  .strict();

export const listarMovimientosSchema = z.object({
  /** Mes "YYYY-MM-01" (o "YYYY-MM"). Por defecto, el actual. */
  mes: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])(-01)?$/, 'Mes inválido, usa YYYY-MM')
    .transform((m) => `${m.slice(0, 7)}-01`)
    .optional(),
  clase: z.enum(['entrada', 'venta', 'perdida']).optional(),
});

/** Corrección de un movimiento (solo admin). Se valida que el inventario no quede negativo. */
export const actualizarMovimientoSchema = z
  .object({
    fecha: fechaDia,
    tipoId: z.number().int().positive(),
    huevos: cantidad(3_000_000).min(1, 'Debe haber al menos un huevo'),
    precioCarton: montoPesos,
    tercero: textoOpcional(120),
    metodoPago: z.enum(['efectivo', 'transferencia']),
    notas: textoOpcional(300),
  })
  .partial()
  .strict()
  .refine((d) => Object.keys(d).length > 0, 'No enviaste ningún cambio');

export type CrearTipoDto = z.infer<typeof crearTipoSchema>;
export type ActualizarTipoDto = z.infer<typeof actualizarTipoSchema>;
export type VenderDto = z.infer<typeof venderSchema>;
export type RotosDto = z.infer<typeof rotosSchema>;
export type IngresoDto = z.infer<typeof ingresoSchema>;
export type FiltroMovimientos = z.infer<typeof listarMovimientosSchema>;
export type ActualizarMovimientoDto = z.infer<typeof actualizarMovimientoSchema>;
