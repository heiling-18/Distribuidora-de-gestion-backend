import { db, type Tx } from '../../database/client.js';
import type { UsuarioSesion } from '../../interfaces/auth/auth.js';
import { registrarEvento } from '../../repositories/auditoria/auditoria.repository.js';
import * as productosRepo from '../../repositories/productos/productos.repository.js';
import { AppError } from '../../utils/errores/AppError.js';
import { armarPagina, type Paginacion } from '../../utils/paginacion/paginacion.js';
import type {
  ActualizarProductoDto,
  AjusteStockDto,
  CrearProductoDto,
  FiltroProductos,
} from '../../validators/productos/productos.validator.js';

type FilaProducto = productosRepo.FilaProducto;

/** El precio de compra (costo) solo lo ve el administrador. */
export function paraRol(p: FilaProducto, usuario: UsuarioSesion) {
  if (usuario.rol === 'admin') return p;
  const { precioCompra: _costo, ...resto } = p;
  return resto;
}

function validarCantidadEntera(unidad: FilaProducto['unidadMedida'], cantidad: number, campo: string) {
  if (unidad !== 'kilo' && !Number.isInteger(cantidad)) {
    throw AppError.solicitudInvalida(`${campo}: los productos por ${unidad} solo admiten cantidades enteras`);
  }
}

export async function listarProductos(usuario: UsuarioSesion, filtro: FiltroProductos) {
  // Solo el admin puede ver productos inactivos.
  const efectivo = usuario.rol === 'admin' ? filtro : { ...filtro, activo: 'true' as const };
  const { datos, total } = await productosRepo.listar(efectivo);
  return armarPagina(datos.map((p) => paraRol(p, usuario)), total, filtro);
}

export async function obtenerProducto(usuario: UsuarioSesion, id: number) {
  const p = await productosRepo.buscarPorId(id);
  if (!p || (!p.activo && usuario.rol !== 'admin')) throw AppError.noEncontrado('Producto no encontrado');
  return paraRol(p, usuario);
}

export async function crearProducto(admin: UsuarioSesion, dto: CrearProductoDto, ip: string | null) {
  const { stockInicial, ...datos } = dto;
  validarCantidadEntera(datos.unidadMedida, stockInicial, 'stockInicial');

  return db.transaction(async (tx) => {
    const p = await productosRepo.crear({ ...datos, stock: stockInicial }, tx);
    if (stockInicial > 0) {
      await productosRepo.registrarMovimientos(
        [{ productoId: p.id, tipo: 'inicial', cantidad: stockInicial, stockResultante: stockInicial, usuarioId: admin.id, motivo: 'Stock inicial' }],
        tx,
      );
    }
    await registrarEvento({ usuarioId: admin.id, accion: 'producto.crear', entidad: 'producto', entidadId: p.id, despues: p, ip }, tx);
    return p;
  });
}

export async function actualizarProducto(admin: UsuarioSesion, id: number, cambiosConAjuste: ActualizarProductoDto, ip: string | null) {
  const { ajusteStock, ...cambios } = cambiosConAjuste;
  return db.transaction(async (tx) => {
    const [antes] = await productosRepo.bloquearPorIds([id], tx);
    if (!antes) throw AppError.noEncontrado('Producto no encontrado');
    if (cambios.unidadMedida && cambios.unidadMedida !== 'kilo') validarCantidadEntera(cambios.unidadMedida, antes.stock, 'El stock actual');

    // Datos y existencias en la misma transacción: si el ajuste falla, no se guarda nada.
    let despues = Object.keys(cambios).length ? (await productosRepo.actualizar(id, cambios, tx))! : antes;
    if (ajusteStock) despues = { ...despues, stock: await aplicarAjuste(tx, admin, despues, ajusteStock, ip) };
    const cambioPrecio = ['precioCompra', 'precioVenta', 'precioMayorista', 'ivaPorcentaje'].some(
      (k) => k in cambios && cambios[k as keyof typeof cambios] !== antes[k as keyof FilaProducto],
    );
    await registrarEvento(
      {
        usuarioId: admin.id,
        accion: cambioPrecio ? 'producto.cambiar_precio' : 'producto.actualizar',
        entidad: 'producto',
        entidadId: id,
        antes,
        despues,
        ip,
      },
      tx,
    );
    return despues;
  });
}

/** Borrado lógico: el producto deja de aparecer, pero sus ventas e historial se conservan. */
export function desactivarProducto(admin: UsuarioSesion, id: number, ip: string | null) {
  return actualizarProducto(admin, id, { activo: false }, ip);
}

/** Aplica un ajuste de stock a un producto ya bloqueado, dentro de la transacción dada. */
async function aplicarAjuste(tx: Tx, admin: UsuarioSesion, p: FilaProducto, dto: AjusteStockDto, ip: string | null): Promise<number> {
  validarCantidadEntera(p.unidadMedida, dto.cantidad, 'cantidad');
  if (p.stock + dto.cantidad < 0) {
    throw AppError.conflicto(`El ajuste dejaría el stock en negativo: hay ${p.stock}`, { stockActual: p.stock });
  }

  const stockResultante = await productosRepo.moverStock(p.id, dto.cantidad, tx);
  await productosRepo.registrarMovimientos(
    [{ productoId: p.id, tipo: dto.tipo, cantidad: dto.cantidad, stockResultante, motivo: dto.motivo, usuarioId: admin.id }],
    tx,
  );
  await registrarEvento(
    {
      usuarioId: admin.id,
      accion: 'producto.ajustar_stock',
      entidad: 'producto',
      entidadId: p.id,
      antes: { stock: p.stock },
      despues: { stock: stockResultante, tipo: dto.tipo, motivo: dto.motivo },
      ip,
    },
    tx,
  );
  return stockResultante;
}

export async function ajustarStock(admin: UsuarioSesion, id: number, dto: AjusteStockDto, ip: string | null) {
  return db.transaction(async (tx) => {
    const [p] = await productosRepo.bloquearPorIds([id], tx);
    if (!p) throw AppError.noEncontrado('Producto no encontrado');
    return { ...p, stock: await aplicarAjuste(tx, admin, p, dto, ip) };
  });
}

export async function movimientosDe(id: number, pag: Paginacion) {
  if (!(await productosRepo.buscarPorId(id))) throw AppError.noEncontrado('Producto no encontrado');
  const { datos, total } = await productosRepo.listarMovimientos(id, pag);
  return armarPagina(datos, total, pag);
}
