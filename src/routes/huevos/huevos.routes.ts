import { Router } from 'express';
import * as huevos from '../../controllers/huevos/huevos.controller.js';
import { requerirRol } from '../../middlewares/auth/autenticar.js';
import { validar } from '../../middlewares/validacion/validar.js';
import { paramId } from '../../validators/comunes/comunes.validator.js';
import {
  actualizarMovimientoSchema,
  actualizarTipoSchema,
  crearTipoSchema,
  ingresoSchema,
  listarMovimientosSchema,
  listarTiposSchema,
  rotosSchema,
  venderSchema,
} from '../../validators/huevos/huevos.validator.js';

/**
 * Huevos: administrador y vendedor. El vendedor anota ingresos, ventas y rotos de hoy y cambia precios;
 * el administrador además crea, renombra y borra tamaños, anota otros días y corrige o borra movimientos.
 */
export const huevosRoutes = Router();

const soloAdmin = requerirRol('admin');

huevosRoutes.use(requerirRol('admin', 'vendedor'));

huevosRoutes.get('/resumen', huevos.resumen);

huevosRoutes.get('/tipos', validar({ query: listarTiposSchema }), huevos.listarTipos);
huevosRoutes.post('/tipos', soloAdmin, validar({ body: crearTipoSchema }), huevos.crearTipo);
huevosRoutes.patch('/tipos/:id', validar({ params: paramId, body: actualizarTipoSchema }), huevos.actualizarTipo);
huevosRoutes.delete('/tipos/:id', soloAdmin, validar({ params: paramId }), huevos.eliminarTipo);

huevosRoutes.post('/ventas', validar({ body: venderSchema }), huevos.vender);
huevosRoutes.post('/rotos', validar({ body: rotosSchema }), huevos.rotos);
huevosRoutes.post('/ingresos', validar({ body: ingresoSchema }), huevos.ingreso);

huevosRoutes.get('/movimientos', validar({ query: listarMovimientosSchema }), huevos.listarMovimientos);
huevosRoutes.patch('/movimientos/:id', soloAdmin, validar({ params: paramId, body: actualizarMovimientoSchema }), huevos.actualizarMovimiento);
huevosRoutes.delete('/movimientos/:id', soloAdmin, validar({ params: paramId }), huevos.eliminarMovimiento);
