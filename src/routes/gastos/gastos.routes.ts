import { Router } from 'express';
import * as gastos from '../../controllers/gastos/gastos.controller.js';
import { requerirRol } from '../../middlewares/auth/autenticar.js';
import { validar } from '../../middlewares/validacion/validar.js';
import { paramId } from '../../validators/comunes/comunes.validator.js';
import { actualizarGastoSchema, crearGastoSchema, listarGastosSchema } from '../../validators/gastos/gastos.validator.js';

/** Gastos: solo administrador. (El vendedor ve el total de gastos en efectivo en el resumen de caja.) */
export const gastosRoutes = Router();

gastosRoutes.use(requerirRol('admin'));

gastosRoutes.get('/', validar({ query: listarGastosSchema }), gastos.listar);
gastosRoutes.get('/:id', validar({ params: paramId }), gastos.obtener);
gastosRoutes.post('/', validar({ body: crearGastoSchema }), gastos.crear);
gastosRoutes.patch('/:id', validar({ params: paramId, body: actualizarGastoSchema }), gastos.actualizar);
gastosRoutes.delete('/:id', validar({ params: paramId }), gastos.eliminar);
