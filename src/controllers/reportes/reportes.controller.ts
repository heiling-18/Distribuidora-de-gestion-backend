import type { RequestHandler } from 'express';
import { usuarioActual } from '../../middlewares/auth/autenticar.js';
import * as reportesService from '../../services/reportes/reportes.service.js';

export const dashboard: RequestHandler = async (req, res) => {
  res.json(await reportesService.dashboard(usuarioActual(req)));
};

export const mes: RequestHandler = async (req, res) => {
  const { mes } = req.query as { mes?: string };
  res.json({ reporte: await reportesService.reporteMes(mes) });
};

export const historico: RequestHandler = async (_req, res) => {
  res.json({ historico: await reportesService.historico() });
};

export const listarCierres: RequestHandler = async (_req, res) => {
  res.json({ cierres: await reportesService.listarCierresMensuales() });
};

export const cerrarMes: RequestHandler = async (req, res) => {
  const { mes } = req.body as { mes: string };
  res.status(201).json({ cierre: await reportesService.cerrarMes(usuarioActual(req), mes, req.ip ?? null) });
};
