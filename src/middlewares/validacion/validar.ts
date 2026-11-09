import type { RequestHandler } from 'express';
import type { ZodType } from 'zod';

interface Esquemas {
  body?: ZodType;
  query?: ZodType;
  params?: ZodType;
}

/**
 * Valida y limpia body, query y params con zod antes de llegar al controlador.
 * Si algo no cumple, el ZodError llega al manejador central y responde 400.
 */
export function validar(esquemas: Esquemas): RequestHandler {
  return (req, _res, next) => {
    if (esquemas.body) req.body = esquemas.body.parse(req.body);
    if (esquemas.params) req.params = esquemas.params.parse(req.params) as typeof req.params;
    // En Express 5 req.query es de solo lectura: se reemplaza la propiedad.
    if (esquemas.query) {
      Object.defineProperty(req, 'query', { value: esquemas.query.parse(req.query), writable: true });
    }
    next();
  };
}
