import cookieParser from 'cookie-parser';
import express from 'express';
import { pinoHttp } from 'pino-http';
import { manejarErrores } from './middlewares/errores/manejarErrores.js';
import { noEncontrado } from './middlewares/errores/noEncontrado.js';
import { cabecerasSeguras, corsPermitido, limiteGeneral } from './middlewares/seguridad/seguridad.js';
import { rutas } from './routes/index.js';
import { logger } from './utils/logger/logger.js';

export function crearApp() {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', 1); // detrás de un proxy (Railway, Nginx) para que el rate limit vea la IP real

  app.use(pinoHttp({ logger }));
  app.use(cabecerasSeguras);
  app.use(corsPermitido);
  // cookieParser antes del límite: el límite cuenta por sesión.
  app.use(cookieParser());
  app.use(limiteGeneral);
  app.use(express.json({ limit: '100kb' }));

  app.use('/api', rutas);

  app.use(noEncontrado);
  app.use(manejarErrores);

  return app;
}
