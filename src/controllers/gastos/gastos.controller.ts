import type { RequestHandler } from 'express';
import { usuarioActual } from '../../middlewares/auth/autenticar.js';
import * as gastosService from '../../services/gastos/gastos.service.js';
import type { ActualizarGastoDto, CrearGastoDto, FiltroGastos } from '../../validators/gastos/gastos.validator.js';

const idDe = (req: Parameters<RequestHandler>[0]) => (req.params as unknown as { id: number }).id;

export const listar: RequestHandler = async (req, res) => {
  res.json(await gastosService.listarGastos(req.query as unknown as FiltroGastos));
};

export const obtener: RequestHandler = async (req, res) => {
  res.json({ gasto: await gastosService.obtenerGasto(idDe(req)) });
};

export const crear: RequestHandler = async (req, res) => {
  // { gasto, aviso }: aviso si es efectivo de hoy y no hay caja abierta.
  res.status(201).json(await gastosService.crearGasto(usuarioActual(req), req.body as CrearGastoDto, req.ip ?? null));
};

export const actualizar: RequestHandler = async (req, res) => {
  const gasto = await gastosService.actualizarGasto(usuarioActual(req), idDe(req), req.body as ActualizarGastoDto, req.ip ?? null);
  res.json({ gasto });
};

export const eliminar: RequestHandler = async (req, res) => {
  await gastosService.eliminarGasto(usuarioActual(req), idDe(req), req.ip ?? null);
  res.status(204).end();
};
