import type { RequestHandler } from 'express';
import type { Rol } from '../../interfaces/auth/auth.js';
import { usuarioActual } from '../../middlewares/auth/autenticar.js';
import * as usuariosService from '../../services/usuarios/usuarios.service.js';

type ConId = { id: number };

export const listar: RequestHandler = async (_req, res) => {
  res.json({ usuarios: await usuariosService.listarUsuarios() });
};

export const obtener: RequestHandler = async (req, res) => {
  const { id } = req.params as unknown as ConId;
  res.json({ usuario: await usuariosService.obtenerUsuario(id) });
};

export const crear: RequestHandler = async (req, res) => {
  const datos = req.body as { email: string; nombre: string; rol: Rol; clave: string };
  const usuario = await usuariosService.crearUsuario(usuarioActual(req), datos, req.ip ?? null);
  res.status(201).json({ usuario });
};

export const actualizar: RequestHandler = async (req, res) => {
  const { id } = req.params as unknown as ConId;
  const cambios = req.body as { nombre?: string; rol?: Rol; activo?: boolean };
  const usuario = await usuariosService.actualizarUsuario(usuarioActual(req), id, cambios, req.ip ?? null);
  res.json({ usuario });
};

export const restablecerClave: RequestHandler = async (req, res) => {
  const { id } = req.params as unknown as ConId;
  const { clave } = req.body as { clave: string };
  await usuariosService.restablecerClave(usuarioActual(req), id, clave, req.ip ?? null);
  res.status(204).end();
};
