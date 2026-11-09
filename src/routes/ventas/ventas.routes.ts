import { Router } from 'express';
import * as ventas from '../../controllers/ventas/ventas.controller.js';
import { requerirRol } from '../../middlewares/auth/autenticar.js';
import { validar } from '../../middlewares/validacion/validar.js';
import { paramId } from '../../validators/comunes/comunes.validator.js';
import { anularVentaSchema, listarVentasSchema, registrarVentaSchema } from '../../validators/ventas/ventas.validator.js';

/** Ventas: administrador y vendedor. Anular, solo administrador. */
export const ventasRoutes = Router();

ventasRoutes.use(requerirRol('admin', 'vendedor'));

ventasRoutes.post('/', validar({ body: registrarVentaSchema }), ventas.registrar);
ventasRoutes.get('/', validar({ query: listarVentasSchema }), ventas.listar);
ventasRoutes.get('/:id', validar({ params: paramId }), ventas.obtener);
ventasRoutes.post('/:id/anular', requerirRol('admin'), validar({ params: paramId, body: anularVentaSchema }), ventas.anular);
