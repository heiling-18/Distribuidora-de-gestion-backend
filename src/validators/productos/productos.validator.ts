import { z } from 'zod';
import { paginacionSchema } from '../../utils/paginacion/paginacion.js';
import { busqueda, cantidadInventario, filtroActivo, montoPesos, textoOpcional } from '../comunes/comunes.validator.js';

const unidad = z.enum(['bulto', 'unidad', 'kilo']);
const iva = z.number().min(0).max(100);
const cantidadNoNegativa = cantidadInventario.refine((n) => n >= 0, 'No puede ser negativo');

const camposProducto = {
  codigo: textoOpcional(40),
  nombre: z.string().trim().min(2, 'El nombre es muy corto').max(150),
  categoria: z.string().trim().min(1).max(60),
  unidadMedida: unidad,
  precioCompra: montoPesos,
  precioVenta: montoPesos,
  precioMayorista: montoPesos,
  ivaPorcentaje: iva,
  stockMinimo: cantidadNoNegativa,
};

export const crearProductoSchema = z
  .object({
    ...camposProducto,
    categoria: camposProducto.categoria.default('Purinas y Concentrados'),
    unidadMedida: unidad.default('bulto'),
    precioCompra: montoPesos.default(0),
    ivaPorcentaje: iva.default(0),
    stockMinimo: cantidadNoNegativa.default(0),
    /** Stock con el que arranca. Queda registrado como movimiento "inicial". */
    stockInicial: cantidadNoNegativa.default(0),
  })
  .strict();

/** El stock no se edita aquí: solo con ajuste de stock (queda en el historial). */
export const ajusteStockSchema = z
  .object({
    /** compra: entra mercancía (cantidad positiva). ajuste: corrección por conteo, daño, etc. (puede ser negativa). */
    tipo: z.enum(['compra', 'ajuste']),
    cantidad: cantidadInventario.refine((n) => n !== 0, 'La cantidad no puede ser 0'),
    motivo: z.string().trim().min(3, 'Escribe el motivo').max(200),
  })
  .strict()
  .refine((d) => d.tipo !== 'compra' || d.cantidad > 0, { message: 'Una compra debe sumar stock', path: ['cantidad'] });

/**
 * El stock no se edita directo: si la ficha también cambia existencias, viene como ajuste
 * (queda en el historial) y se aplica en la misma transacción que los demás cambios.
 */
export const actualizarProductoSchema = z
  .object({ ...camposProducto, activo: z.boolean(), ajusteStock: ajusteStockSchema })
  .partial()
  .strict()
  .refine((d) => Object.keys(d).length > 0, 'No enviaste ningún cambio');

export const listarProductosSchema = paginacionSchema.extend({
  q: busqueda.optional(),
  categoria: z.string().trim().min(1).max(60).optional(),
  activo: filtroActivo,
  /** Solo productos con stock en o por debajo del mínimo. */
  stockBajo: z.enum(['true', 'false']).optional(),
});

export type CrearProductoDto = z.infer<typeof crearProductoSchema>;
export type ActualizarProductoDto = z.infer<typeof actualizarProductoSchema>;
export type AjusteStockDto = z.infer<typeof ajusteStockSchema>;
export type FiltroProductos = z.infer<typeof listarProductosSchema>;
