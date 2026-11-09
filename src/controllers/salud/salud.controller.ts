import type { RequestHandler } from 'express';
import { obtenerEstado } from '../../services/salud/salud.service.js';

export const verSalud: RequestHandler = async (_req, res) => {
  const estado = await obtenerEstado();
  res.status(estado.ok ? 200 : 503).json(estado);
};
