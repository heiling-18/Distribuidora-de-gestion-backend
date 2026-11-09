import { Router } from 'express';
import * as caja from '../../controllers/caja/caja.controller.js';
import { requerirRol } from '../../middlewares/auth/autenticar.js';
import { validar } from '../../middlewares/validacion/validar.js';
import { abrirCajaSchema, cerrarCajaSchema, listarCierresSchema } from '../../validators/caja/caja.validator.js';
import { paramId } from '../../validators/comunes/comunes.validator.js';

/** Caja: administrador y vendedor. El galponero no tiene acceso. */
export const cajaRoutes = Router();

cajaRoutes.use(requerirRol('admin', 'vendedor'));

cajaRoutes.get('/actual', caja.actual);
cajaRoutes.get('/actual/resumen', caja.resumen);
cajaRoutes.post('/abrir', validar({ body: abrirCajaSchema }), caja.abrir);
cajaRoutes.post('/cerrar', validar({ body: cerrarCajaSchema }), caja.cerrar);
cajaRoutes.get('/cierres', validar({ query: listarCierresSchema }), caja.listarCierres);
cajaRoutes.get('/cierres/:id', validar({ params: paramId }), caja.obtenerCierre);
