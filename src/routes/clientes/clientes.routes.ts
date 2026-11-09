import { Router } from 'express';
import * as clientes from '../../controllers/clientes/clientes.controller.js';
import { requerirRol } from '../../middlewares/auth/autenticar.js';
import { validar } from '../../middlewares/validacion/validar.js';
import { actualizarClienteSchema, crearClienteSchema, listarClientesSchema } from '../../validators/clientes/clientes.validator.js';
import { paramId } from '../../validators/comunes/comunes.validator.js';

/** Clientes: admin y vendedor consultan, crean y editan; solo el admin los desactiva. */
export const clientesRoutes = Router();

clientesRoutes.use(requerirRol('admin', 'vendedor'));

clientesRoutes.get('/', validar({ query: listarClientesSchema }), clientes.listar);
clientesRoutes.get('/:id', validar({ params: paramId }), clientes.obtener);
clientesRoutes.post('/', validar({ body: crearClienteSchema }), clientes.crear);
clientesRoutes.patch('/:id', validar({ params: paramId, body: actualizarClienteSchema }), clientes.actualizar);
clientesRoutes.delete('/:id', requerirRol('admin'), validar({ params: paramId }), clientes.desactivar);
