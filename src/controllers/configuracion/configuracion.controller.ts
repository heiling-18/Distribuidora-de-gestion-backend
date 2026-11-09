import type { RequestHandler } from 'express';
import { usuarioActual } from '../../middlewares/auth/autenticar.js';
import * as configService from '../../services/configuracion/configuracion.service.js';
import type { ActualizarConfiguracionDto } from '../../validators/configuracion/configuracion.validator.js';

export const obtener: RequestHandler = async (_req, res) => {
  res.json({ configuracion: await configService.obtener() });
};

export const actualizar: RequestHandler = async (req, res) => {
  const configuracion = await configService.actualizar(usuarioActual(req), req.body as ActualizarConfiguracionDto, req.ip ?? null);
  res.json({ configuracion });
};
