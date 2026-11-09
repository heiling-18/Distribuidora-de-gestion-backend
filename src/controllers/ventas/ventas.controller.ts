import type { RequestHandler } from 'express';
import type { UsuarioSesion } from '../../interfaces/auth/auth.js';
import { usuarioActual } from '../../middlewares/auth/autenticar.js';
import * as ventasService from '../../services/ventas/ventas.service.js';
import type { FiltroVentas, RegistrarVentaDto } from '../../validators/ventas/ventas.validator.js';

type VentaRespuesta = { costoTotal?: number; gananciaBruta?: number; items?: { costoUnitario?: number }[] };

/** Costos y ganancia solo para el administrador (igual que en productos y en el dashboard). */
function paraRol<T extends VentaRespuesta>(venta: T, usuario: UsuarioSesion) {
  if (usuario.rol === 'admin') return venta;
  const { costoTotal: _c, gananciaBruta: _g, ...resto } = venta;
  return {
    ...resto,
    ...(venta.items ? { items: venta.items.map(({ costoUnitario: _u, ...item }) => item) } : {}),
  };
}

export const registrar: RequestHandler = async (req, res) => {
  const usuario = usuarioActual(req);
  const { venta, repetida } = await ventasService.registrarVenta(usuario, req.body as RegistrarVentaDto);
  // 201 la primera vez; 200 si es un reintento con la misma idempotencyKey.
  res.status(repetida ? 200 : 201).json({ venta: paraRol(venta, usuario), repetida });
};

export const listar: RequestHandler = async (req, res) => {
  const usuario = usuarioActual(req);
  const pagina = await ventasService.listarVentas(req.query as unknown as FiltroVentas);
  res.json({ ...pagina, datos: pagina.datos.map((v) => paraRol(v, usuario)) });
};

export const obtener: RequestHandler = async (req, res) => {
  const { id } = req.params as unknown as { id: number };
  res.json({ venta: paraRol(await ventasService.obtenerVenta(id), usuarioActual(req)) });
};

export const anular: RequestHandler = async (req, res) => {
  const { id } = req.params as unknown as { id: number };
  const { motivo } = req.body as { motivo: string };
  res.json({ venta: await ventasService.anularVenta(usuarioActual(req), id, motivo, req.ip ?? null) });
};
