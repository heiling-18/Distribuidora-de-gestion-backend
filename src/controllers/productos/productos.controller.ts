import type { RequestHandler } from 'express';
import { usuarioActual } from '../../middlewares/auth/autenticar.js';
import * as productosService from '../../services/productos/productos.service.js';
import type { Paginacion } from '../../utils/paginacion/paginacion.js';
import type {
  ActualizarProductoDto,
  AjusteStockDto,
  CrearProductoDto,
  FiltroProductos,
} from '../../validators/productos/productos.validator.js';

const idDe = (req: Parameters<RequestHandler>[0]) => (req.params as unknown as { id: number }).id;

export const listar: RequestHandler = async (req, res) => {
  res.json(await productosService.listarProductos(usuarioActual(req), req.query as unknown as FiltroProductos));
};

export const obtener: RequestHandler = async (req, res) => {
  res.json({ producto: await productosService.obtenerProducto(usuarioActual(req), idDe(req)) });
};

export const crear: RequestHandler = async (req, res) => {
  const producto = await productosService.crearProducto(usuarioActual(req), req.body as CrearProductoDto, req.ip ?? null);
  res.status(201).json({ producto });
};

export const actualizar: RequestHandler = async (req, res) => {
  const producto = await productosService.actualizarProducto(usuarioActual(req), idDe(req), req.body as ActualizarProductoDto, req.ip ?? null);
  res.json({ producto });
};

export const desactivar: RequestHandler = async (req, res) => {
  const producto = await productosService.desactivarProducto(usuarioActual(req), idDe(req), req.ip ?? null);
  res.json({ producto });
};

export const ajustarStock: RequestHandler = async (req, res) => {
  const producto = await productosService.ajustarStock(usuarioActual(req), idDe(req), req.body as AjusteStockDto, req.ip ?? null);
  res.json({ producto });
};

export const movimientos: RequestHandler = async (req, res) => {
  res.json(await productosService.movimientosDe(idDe(req), req.query as unknown as Paginacion));
};
