import { pgEnum } from 'drizzle-orm/pg-core';

export const rolUsuario = pgEnum('rol_usuario', ['admin', 'vendedor', 'galponero']);
export const metodoPago = pgEnum('metodo_pago', ['efectivo', 'transferencia']);
export const tipoPrecio = pgEnum('tipo_precio', ['detal', 'mayorista']);
export const estadoVenta = pgEnum('estado_venta', ['completada', 'anulada']);
export const estadoCaja = pgEnum('estado_caja', ['abierta', 'cerrada']);
export const unidadMedida = pgEnum('unidad_medida', ['bulto', 'unidad', 'kilo']);
export const categoriaGasto = pgEnum('categoria_gasto', [
  'arriendo',
  'compra_inventario',
  'servicios',
  'nomina',
  'transporte',
  'otros',
]);
export const tipoMovimientoInventario = pgEnum('tipo_movimiento_inventario', [
  'inicial',
  'compra',
  'venta',
  'anulacion',
  'ajuste',
]);
