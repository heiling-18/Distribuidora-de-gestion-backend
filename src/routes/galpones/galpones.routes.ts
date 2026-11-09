import { Router } from 'express';
import * as galpones from '../../controllers/galpones/galpones.controller.js';
import { requerirRol } from '../../middlewares/auth/autenticar.js';
import { validar } from '../../middlewares/validacion/validar.js';
import { paramId } from '../../validators/comunes/comunes.validator.js';
import {
  actualizarGalponSchema,
  crearGalponSchema,
  guardarRegistroSchema,
  listarGalponesSchema,
  listarRegistrosSchema,
  paramRegistro,
} from '../../validators/galpones/galpones.validator.js';

/** Galpones: admin y galponero. Crear, editar y borrar galpones o registros: solo administrador. */
export const galponesRoutes = Router();

const soloAdmin = requerirRol('admin');

galponesRoutes.use(requerirRol('admin', 'galponero'));

galponesRoutes.get('/', validar({ query: listarGalponesSchema }), galpones.listar);
galponesRoutes.post('/', soloAdmin, validar({ body: crearGalponSchema }), galpones.crear);

// Registros diarios (antes de "/:id" para que "registros" no se tome como id)
galponesRoutes.get('/registros', validar({ query: listarRegistrosSchema }), galpones.listarRegistros);
galponesRoutes.delete('/registros/:id', soloAdmin, validar({ params: paramId }), galpones.eliminarRegistro);
galponesRoutes.put('/:id/registros/:fecha', validar({ params: paramRegistro, body: guardarRegistroSchema }), galpones.guardarRegistro);

galponesRoutes.patch('/:id', soloAdmin, validar({ params: paramId, body: actualizarGalponSchema }), galpones.actualizar);
galponesRoutes.delete('/:id', soloAdmin, validar({ params: paramId }), galpones.eliminar);
