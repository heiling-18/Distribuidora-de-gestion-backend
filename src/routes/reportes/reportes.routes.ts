import { Router } from 'express';
import * as reportes from '../../controllers/reportes/reportes.controller.js';
import { requerirRol } from '../../middlewares/auth/autenticar.js';
import { validar } from '../../middlewares/validacion/validar.js';
import { cerrarMesSchema, reporteMesSchema } from '../../validators/reportes/reportes.validator.js';

/** Dashboard: admin y vendedor. Reportes y cierres de mes: solo administrador. */
export const reportesRoutes = Router();

const soloAdmin = requerirRol('admin');

reportesRoutes.get('/dashboard', requerirRol('admin', 'vendedor'), reportes.dashboard);
reportesRoutes.get('/mes', soloAdmin, validar({ query: reporteMesSchema }), reportes.mes);
reportesRoutes.get('/historico', soloAdmin, reportes.historico);
reportesRoutes.get('/cierres-mes', soloAdmin, reportes.listarCierres);
reportesRoutes.post('/cierres-mes', soloAdmin, validar({ body: cerrarMesSchema }), reportes.cerrarMes);
