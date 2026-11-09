import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import type { RespuestaError } from '../../interfaces/http/api.js';
import { AppError } from '../../utils/errores/AppError.js';
import { traducirErrorPg } from '../../utils/errores/erroresPg.js';
import { logger } from '../../utils/logger/logger.js';

/** Errores que lanza el propio Express (JSON mal formado, cuerpo muy grande, etc.). */
function esErrorHttp(err: unknown): err is { status: number; expose: boolean; message: string } {
  return typeof err === 'object' && err !== null && 'status' in err && 'expose' in err;
}

export const manejarErrores: ErrorRequestHandler = (errOriginal, req, res, _next) => {
  const err = traducirErrorPg(errOriginal) ?? errOriginal;
  let status = 500;
  let cuerpo: RespuestaError = { error: { codigo: 'ERROR_INTERNO', mensaje: 'Ocurrió un error inesperado' } };

  if (err instanceof AppError) {
    status = err.status;
    cuerpo = { error: { codigo: err.codigo, mensaje: err.message, detalles: err.detalles } };
  } else if (err instanceof ZodError) {
    status = 400;
    cuerpo = {
      error: {
        codigo: 'VALIDACION',
        mensaje: 'Los datos enviados no son válidos',
        detalles: err.issues.map((i) => ({ campo: i.path.join('.'), mensaje: i.message })),
      },
    };
  } else if (esErrorHttp(err) && err.expose) {
    status = err.status;
    cuerpo = { error: { codigo: 'SOLICITUD_INVALIDA', mensaje: err.message } };
  }

  if (status >= 500) {
    (req.log ?? logger).error({ err }, 'Error no controlado');
  }
  res.status(status).json(cuerpo);
};
