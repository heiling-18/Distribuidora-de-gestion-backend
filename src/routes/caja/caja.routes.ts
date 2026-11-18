import { Router } from 'express';
import * as caja from '../../controllers/caja/caja.controller.js';
import { requerirRol } from '../../middlewares/auth/autenticar.js';
import { validar } from '../../middlewares/validacion/validar.js';
import { abrirCajaSchema, ajustarBaseSchema, cerrarCajaSchema, listarCierresSchema } from '../../validators/caja/caja.validator.js';
import { paramId } from '../../validators/comunes/comunes.validator.js';

/**
 * Caja: administrador y vendedor. El galponero no tiene acceso.
 * La caja se abre sola cada día con la base que se dejó al cerrar; abrirla a mano y ajustar la base es del admin.
 */
export const cajaRoutes = Router();

const soloAdmin = requerirRol('admin');

cajaRoutes.use(requerirRol('admin', 'vendedor'));

cajaRoutes.get('/actual', caja.actual);
cajaRoutes.get('/actual/resumen', caja.resumen);
cajaRoutes.patch('/actual/base', soloAdmin, validar({ body: ajustarBaseSchema }), caja.ajustarBase);
cajaRoutes.post('/abrir-automatica', caja.abrirAutomatica);
cajaRoutes.post('/abrir', soloAdmin, validar({ body: abrirCajaSchema }), caja.abrir);
cajaRoutes.post('/cerrar', validar({ body: cerrarCajaSchema }), caja.cerrar);
cajaRoutes.get('/cierres', validar({ query: listarCierresSchema }), caja.listarCierres);
cajaRoutes.get('/cierres/:id', validar({ params: paramId }), caja.obtenerCierre);
