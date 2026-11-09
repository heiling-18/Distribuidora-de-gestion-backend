import type { RequestHandler } from 'express';
import { usuarioActual } from '../../middlewares/auth/autenticar.js';
import * as clientesService from '../../services/clientes/clientes.service.js';
import type { ActualizarClienteDto, CrearClienteDto, FiltroClientes } from '../../validators/clientes/clientes.validator.js';

const idDe = (req: Parameters<RequestHandler>[0]) => (req.params as unknown as { id: number }).id;

export const listar: RequestHandler = async (req, res) => {
  res.json(await clientesService.listarClientes(usuarioActual(req), req.query as unknown as FiltroClientes));
};

export const obtener: RequestHandler = async (req, res) => {
  res.json({ cliente: await clientesService.obtenerCliente(usuarioActual(req), idDe(req)) });
};

export const crear: RequestHandler = async (req, res) => {
  const cliente = await clientesService.crearCliente(usuarioActual(req), req.body as CrearClienteDto, req.ip ?? null);
  res.status(201).json({ cliente });
};

export const actualizar: RequestHandler = async (req, res) => {
  const cliente = await clientesService.actualizarCliente(usuarioActual(req), idDe(req), req.body as ActualizarClienteDto, req.ip ?? null);
  res.json({ cliente });
};

export const desactivar: RequestHandler = async (req, res) => {
  res.json({ cliente: await clientesService.desactivarCliente(usuarioActual(req), idDe(req), req.ip ?? null) });
};
