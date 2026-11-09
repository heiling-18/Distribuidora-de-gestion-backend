import type { RequestHandler } from 'express';
import { NOMBRE_COOKIE_SESION, opcionesCookieSesion } from '../../config/sesion.js';
import { usuarioActual } from '../../middlewares/auth/autenticar.js';
import * as authService from '../../services/auth/auth.service.js';

const { maxAge: _maxAge, ...opcionesBorrado } = opcionesCookieSesion;

export const login: RequestHandler = async (req, res) => {
  const { email, clave } = req.body as { email: string; clave: string };
  const { usuario, token } = await authService.iniciarSesion(email, clave, req.ip ?? null);
  res.cookie(NOMBRE_COOKIE_SESION, token, opcionesCookieSesion);
  res.json({ usuario });
};

export const logout: RequestHandler = (_req, res) => {
  res.clearCookie(NOMBRE_COOKIE_SESION, opcionesBorrado);
  res.status(204).end();
};

export const yo: RequestHandler = (req, res) => {
  res.json({ usuario: usuarioActual(req) });
};

export const cambiarClave: RequestHandler = async (req, res) => {
  const { claveActual, claveNueva } = req.body as { claveActual: string; claveNueva: string };
  const token = await authService.cambiarMiClave(usuarioActual(req).id, claveActual, claveNueva, req.ip ?? null);
  res.cookie(NOMBRE_COOKIE_SESION, token, opcionesCookieSesion);
  res.status(204).end();
};
