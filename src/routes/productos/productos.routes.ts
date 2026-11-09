import { Router } from 'express';
import * as productos from '../../controllers/productos/productos.controller.js';
import { requerirRol } from '../../middlewares/auth/autenticar.js';
import { validar } from '../../middlewares/validacion/validar.js';
import { paginacionSchema } from '../../utils/paginacion/paginacion.js';
import { paramId } from '../../validators/comunes/comunes.validator.js';
import {
  actualizarProductoSchema,
  ajusteStockSchema,
  crearProductoSchema,
  listarProductosSchema,
} from '../../validators/productos/productos.validator.js';

/** Productos: admin y vendedor consultan; solo el admin crea, edita y ajusta stock. */
export const productosRoutes = Router();

const soloAdmin = requerirRol('admin');

productosRoutes.use(requerirRol('admin', 'vendedor'));

productosRoutes.get('/', validar({ query: listarProductosSchema }), productos.listar);
productosRoutes.get('/:id', validar({ params: paramId }), productos.obtener);
productosRoutes.post('/', soloAdmin, validar({ body: crearProductoSchema }), productos.crear);
productosRoutes.patch('/:id', soloAdmin, validar({ params: paramId, body: actualizarProductoSchema }), productos.actualizar);
productosRoutes.delete('/:id', soloAdmin, validar({ params: paramId }), productos.desactivar);
productosRoutes.post('/:id/ajuste-stock', soloAdmin, validar({ params: paramId, body: ajusteStockSchema }), productos.ajustarStock);
productosRoutes.get('/:id/movimientos', soloAdmin, validar({ params: paramId, query: paginacionSchema }), productos.movimientos);
