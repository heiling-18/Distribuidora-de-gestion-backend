import type { RequestHandler } from 'express';
import { AppError } from '../../utils/errores/AppError.js';

export const noEncontrado: RequestHandler = (req, _res, next) => {
  next(AppError.noEncontrado(`No existe la ruta ${req.method} ${req.path}`));
};
