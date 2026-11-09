import { Router } from 'express';
import * as configuracion from '../../controllers/configuracion/configuracion.controller.js';
import { requerirRol } from '../../middlewares/auth/autenticar.js';
import { validar } from '../../middlewares/validacion/validar.js';
import { actualizarConfiguracionSchema } from '../../validators/configuracion/configuracion.validator.js';

/** Ajustes del negocio: todos los usuarios con sesión los leen; solo el admin los cambia. */
export const configuracionRoutes = Router();

configuracionRoutes.get('/', configuracion.obtener);
configuracionRoutes.patch('/', requerirRol('admin'), validar({ body: actualizarConfiguracionSchema }), configuracion.actualizar);
