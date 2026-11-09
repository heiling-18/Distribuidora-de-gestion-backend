import type { RequestHandler } from 'express';
import { usuarioActual } from '../../middlewares/auth/autenticar.js';
import * as galponesService from '../../services/galpones/galpones.service.js';
import type {
  ActualizarGalponDto,
  CrearGalponDto,
  FiltroRegistros,
  GuardarRegistroDto,
} from '../../validators/galpones/galpones.validator.js';

const idDe = (req: Parameters<RequestHandler>[0]) => (req.params as unknown as { id: number }).id;

export const listar: RequestHandler = async (req, res) => {
  const { activo } = req.query as { activo: 'true' | 'false' | 'todos' };
  res.json({ galpones: await galponesService.listarGalpones(usuarioActual(req), activo) });
};

export const crear: RequestHandler = async (req, res) => {
  const galpon = await galponesService.crearGalpon(usuarioActual(req), req.body as CrearGalponDto, req.ip ?? null);
  res.status(201).json({ galpon });
};

export const actualizar: RequestHandler = async (req, res) => {
  const galpon = await galponesService.actualizarGalpon(usuarioActual(req), idDe(req), req.body as ActualizarGalponDto, req.ip ?? null);
  res.json({ galpon });
};

export const eliminar: RequestHandler = async (req, res) => {
  await galponesService.eliminarGalpon(usuarioActual(req), idDe(req), req.ip ?? null);
  res.status(204).end();
};

export const guardarRegistro: RequestHandler = async (req, res) => {
  const { id, fecha } = req.params as unknown as { id: number; fecha: string };
  const registro = await galponesService.guardarRegistro(usuarioActual(req), id, fecha, req.body as GuardarRegistroDto);
  res.json({ registro });
};

export const listarRegistros: RequestHandler = async (req, res) => {
  res.json(await galponesService.listarRegistros(req.query as unknown as FiltroRegistros));
};

export const eliminarRegistro: RequestHandler = async (req, res) => {
  await galponesService.eliminarRegistro(usuarioActual(req), idDe(req), req.ip ?? null);
  res.status(204).end();
};
