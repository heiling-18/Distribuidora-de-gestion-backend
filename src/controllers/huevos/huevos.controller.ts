import type { RequestHandler } from 'express';
import { usuarioActual } from '../../middlewares/auth/autenticar.js';
import * as huevosService from '../../services/huevos/huevos.service.js';
import type {
  ActualizarMovimientoDto,
  ActualizarTipoDto,
  CrearTipoDto,
  FiltroMovimientos,
  IngresoDto,
  RotosDto,
  VenderDto,
} from '../../validators/huevos/huevos.validator.js';

const idDe = (req: Parameters<RequestHandler>[0]) => (req.params as unknown as { id: number }).id;

export const resumen: RequestHandler = async (_req, res) => {
  res.json(await huevosService.resumen());
};

export const listarTipos: RequestHandler = async (req, res) => {
  const { activo } = req.query as { activo: 'true' | 'false' | 'todos' };
  res.json({ tipos: await huevosService.listarTipos(activo) });
};

export const crearTipo: RequestHandler = async (req, res) => {
  res.status(201).json({ tipo: await huevosService.crearTipo(usuarioActual(req), req.body as CrearTipoDto, req.ip ?? null) });
};

export const actualizarTipo: RequestHandler = async (req, res) => {
  res.json({ tipo: await huevosService.actualizarTipo(usuarioActual(req), idDe(req), req.body as ActualizarTipoDto, req.ip ?? null) });
};

export const eliminarTipo: RequestHandler = async (req, res) => {
  await huevosService.eliminarTipo(usuarioActual(req), idDe(req), req.ip ?? null);
  res.status(204).end();
};

/** { movimientos, total, repetida }: 201 si es nueva, 200 si es un reintento con la misma clave. */
export const vender: RequestHandler = async (req, res) => {
  const resultado = await huevosService.vender(usuarioActual(req), req.body as VenderDto);
  res.status(resultado.repetida ? 200 : 201).json(resultado);
};

export const rotos: RequestHandler = async (req, res) => {
  res.status(201).json({ movimiento: await huevosService.registrarRotos(usuarioActual(req), req.body as RotosDto) });
};

export const ingreso: RequestHandler = async (req, res) => {
  res.status(201).json(await huevosService.registrarIngreso(usuarioActual(req), req.body as IngresoDto, req.ip ?? null));
};

export const listarMovimientos: RequestHandler = async (req, res) => {
  res.json(await huevosService.listarMovimientos(req.query as unknown as FiltroMovimientos));
};

export const actualizarMovimiento: RequestHandler = async (req, res) => {
  const movimiento = await huevosService.actualizarMovimiento(usuarioActual(req), idDe(req), req.body as ActualizarMovimientoDto, req.ip ?? null);
  res.json({ movimiento });
};

export const eliminarMovimiento: RequestHandler = async (req, res) => {
  await huevosService.eliminarMovimiento(usuarioActual(req), idDe(req), req.ip ?? null);
  res.status(204).end();
};
