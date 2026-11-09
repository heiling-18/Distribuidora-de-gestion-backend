import type { RequestHandler } from 'express';
import { usuarioActual } from '../../middlewares/auth/autenticar.js';
import * as cajaService from '../../services/caja/caja.service.js';
import type { Paginacion } from '../../utils/paginacion/paginacion.js';

export const actual: RequestHandler = async (_req, res) => {
  res.json({ caja: await cajaService.cajaActual() });
};

export const resumen: RequestHandler = async (_req, res) => {
  res.json({ resumen: await cajaService.resumenActual() });
};

export const abrir: RequestHandler = async (req, res) => {
  const { montoInicial } = req.body as { montoInicial: number };
  const caja = await cajaService.abrirCaja(usuarioActual(req), montoInicial, req.ip ?? null);
  res.status(201).json({ caja });
};

export const cerrar: RequestHandler = async (req, res) => {
  const datos = req.body as { dineroReal: number; observaciones?: string };
  const cierre = await cajaService.cerrarCaja(usuarioActual(req), datos, req.ip ?? null);
  res.json({ cierre });
};

export const listarCierres: RequestHandler = async (req, res) => {
  const filtro = req.query as unknown as Paginacion & { desde?: string; hasta?: string };
  res.json(await cajaService.listarCierres(filtro));
};

export const obtenerCierre: RequestHandler = async (req, res) => {
  const { id } = req.params as unknown as { id: number };
  res.json({ cierre: await cajaService.obtenerCierre(id) });
};
