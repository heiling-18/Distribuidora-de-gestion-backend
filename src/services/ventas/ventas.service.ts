import { db, type Tx } from '../../database/client.js';
import type { UsuarioSesion } from '../../interfaces/auth/auth.js';
import { registrarEvento } from '../../repositories/auditoria/auditoria.repository.js';
import * as cajaRepo from '../../repositories/caja/caja.repository.js';
import { mesCerrado } from '../../repositories/cierresMensuales/cierresMensuales.repository.js';
import * as clientesRepo from '../../repositories/clientes/clientes.repository.js';
import * as productosRepo from '../../repositories/productos/productos.repository.js';
import * as ventasRepo from '../../repositories/ventas/ventas.repository.js';
import { AppError } from '../../utils/errores/AppError.js';
import { buscarErrorPg } from '../../utils/errores/erroresPg.js';
import { mesNegocio } from '../../utils/fecha/fecha.js';
import { armarPagina } from '../../utils/paginacion/paginacion.js';
import type { FiltroVentas, RegistrarVentaDto } from '../../validators/ventas/ventas.validator.js';

const aCentavos = (n: number) => Math.round(n * 100) / 100;
const aMilesimas = (n: number) => Math.round(n * 1000) / 1000;

/** Precio por mayor; si no está configurado (0) se usa el detal con 5 % de descuento, como en el sistema actual. */
export function precioMayorista(p: productosRepo.FilaProducto): number {
  return p.precioMayorista > 0 ? p.precioMayorista : aCentavos(p.precioVenta * 0.95);
}

export interface ResultadoVenta {
  venta: ventasRepo.VentaConItems;
  /** true si la venta ya existía con esa idempotencyKey (reintento). */
  repetida: boolean;
}

/** Firma de una venta para comparar reintentos: vendedor, pago, cliente y productos (sin importar el orden). */
function firma(v: { vendedorId: number | null; metodoPago: string; clienteId?: number | null; items: { productoId: number | null; cantidad: number; tipoPrecio: string }[] }) {
  const items = v.items.map((i) => `${i.productoId}:${i.cantidad}:${i.tipoPrecio}`).sort();
  return JSON.stringify([v.vendedorId, v.metodoPago, v.clienteId ?? null, items]);
}

/**
 * Venta ya registrada con la misma clave. Solo es un reintento si es la misma venta;
 * si la clave llega con otro contenido es un error del cliente y no se devuelve la venta vieja.
 */
async function ventaRepetida(vendedor: UsuarioSesion, dto: RegistrarVentaDto, previa: ventasRepo.FilaVenta): Promise<ResultadoVenta> {
  const venta = await ventasRepo.conItems(previa);
  const igual =
    firma({ vendedorId: venta.vendedorId, metodoPago: venta.metodoPago, clienteId: venta.clienteId, items: venta.items }) ===
    firma({ vendedorId: vendedor.id, metodoPago: dto.metodoPago, clienteId: dto.clienteId, items: dto.items });
  if (!igual) {
    throw AppError.conflicto('Esa clave de venta ya se usó para otra venta. Vuelve a intentar el cobro.', { codigo: 'IDEMPOTENCIA_DISTINTA' });
  }
  return { venta, repetida: true };
}

export async function registrarVenta(vendedor: UsuarioSesion, dto: RegistrarVentaDto): Promise<ResultadoVenta> {
  const previa = await ventasRepo.buscarPorIdempotencia(dto.idempotencyKey);
  if (previa) return ventaRepetida(vendedor, dto, previa);

  try {
    const venta = await db.transaction((tx) => registrarEnTransaccion(tx, vendedor, dto));
    return { venta, repetida: false };
  } catch (err) {
    // Dos peticiones con la misma clave al mismo tiempo: la segunda choca con el índice único y devuelve la primera.
    if (buscarErrorPg(err)?.constraint === 'ventas_idempotency_unico') {
      const existente = await ventasRepo.buscarPorIdempotencia(dto.idempotencyKey);
      if (existente) return ventaRepetida(vendedor, dto, existente);
    }
    throw err;
  }
}

async function registrarEnTransaccion(
  tx: Tx,
  vendedor: UsuarioSesion,
  dto: RegistrarVentaDto,
): Promise<ventasRepo.VentaConItems> {
  const caja = await cajaRepo.compartirAbierta(tx);
  if (!caja) throw AppError.conflicto('No hay una caja abierta. Abre la caja antes de vender.');

  let cliente = { id: null as number | null, nombre: dto.clienteNombre ?? 'Cliente General', documento: null as string | null };
  if (dto.clienteId) {
    const c = await clientesRepo.buscarActivoPorId(dto.clienteId, tx);
    if (!c) throw AppError.noEncontrado('El cliente no existe o está inactivo');
    cliente = { id: c.id, nombre: c.nombre, documento: c.documento };
  }

  // Bloquea los productos: dos ventas del mismo producto se atienden una después de la otra.
  const ids = [...new Set(dto.items.map((i) => i.productoId))];
  const productos = new Map((await productosRepo.bloquearPorIds(ids, tx)).map((p) => [p.id, p]));

  const pedidoPorProducto = new Map<number, number>();
  const lineas = dto.items.map((item) => {
    const p = productos.get(item.productoId);
    if (!p || !p.activo) throw AppError.noEncontrado(`El producto ${item.productoId} no existe o está inactivo`);
    if (p.unidadMedida !== 'kilo' && !Number.isInteger(item.cantidad)) {
      throw AppError.solicitudInvalida(`"${p.nombre}" se vende por ${p.unidadMedida}: la cantidad debe ser entera`);
    }
    pedidoPorProducto.set(p.id, aMilesimas((pedidoPorProducto.get(p.id) ?? 0) + item.cantidad));

    const precioUnitario = item.tipoPrecio === 'mayorista' ? precioMayorista(p) : p.precioVenta;
    // Los precios de venta ya incluyen el IVA (así se calculan en el formulario de producto):
    // el IVA se separa del total, no se suma encima.
    const totalLinea = aCentavos(item.cantidad * precioUnitario);
    const ivaMonto = aCentavos(totalLinea - totalLinea / (1 + p.ivaPorcentaje / 100));
    const subtotal = aCentavos(totalLinea - ivaMonto);
    return {
      producto: p,
      fila: {
        productoId: p.id,
        productoNombre: p.nombre,
        categoria: p.categoria,
        unidadMedida: p.unidadMedida,
        cantidad: item.cantidad,
        tipoPrecio: item.tipoPrecio,
        precioUnitario,
        costoUnitario: p.precioCompra,
        ivaPorcentaje: p.ivaPorcentaje,
        subtotal,
        ivaMonto,
        total: totalLinea,
      },
    };
  });

  const sinStock = [...pedidoPorProducto]
    .map(([id, pedido]) => ({ p: productos.get(id)!, pedido }))
    .filter(({ p, pedido }) => pedido > p.stock)
    .map(({ p, pedido }) => ({ productoId: p.id, producto: p.nombre, pedido, disponible: p.stock }));
  if (sinStock.length) {
    const [primero] = sinStock;
    throw AppError.conflicto(`Stock insuficiente para "${primero!.producto}": quedan ${primero!.disponible}`, sinStock);
  }

  const subtotal = aCentavos(lineas.reduce((s, l) => s + l.fila.subtotal, 0));
  const ivaTotal = aCentavos(lineas.reduce((s, l) => s + l.fila.ivaMonto, 0));
  const costoTotal = aCentavos(lineas.reduce((s, l) => s + l.fila.cantidad * l.fila.costoUnitario, 0));

  const venta = await ventasRepo.insertarCabecera(
    {
      cajaId: caja.id,
      clienteId: cliente.id,
      clienteNombre: cliente.nombre,
      clienteDocumento: cliente.documento,
      vendedorId: vendedor.id,
      vendedorNombre: vendedor.nombre,
      metodoPago: dto.metodoPago,
      subtotal,
      ivaTotal,
      total: aCentavos(subtotal + ivaTotal),
      costoTotal,
      // El IVA no es ganancia: se le debe a la DIAN.
      gananciaBruta: aCentavos(subtotal - costoTotal),
      idempotencyKey: dto.idempotencyKey,
    },
    tx,
  );
  await ventasRepo.insertarItems(lineas.map((l) => ({ ...l.fila, ventaId: venta.id })), tx);

  const movimientos = [];
  for (const [productoId, pedido] of pedidoPorProducto) {
    const stockResultante = await productosRepo.moverStock(productoId, -pedido, tx);
    movimientos.push({ productoId, tipo: 'venta' as const, cantidad: -pedido, stockResultante, ventaId: venta.id, usuarioId: vendedor.id });
  }
  await productosRepo.registrarMovimientos(movimientos, tx);

  return ventasRepo.conItems(venta, tx);
}

export async function listarVentas(filtro: FiltroVentas) {
  const { datos, total } = await ventasRepo.listar(filtro);
  return armarPagina(datos, total, filtro);
}

export async function obtenerVenta(id: number) {
  const venta = await ventasRepo.buscarConItems(id);
  if (!venta) throw AppError.noEncontrado('Venta no encontrada');
  return venta;
}

export async function anularVenta(admin: UsuarioSesion, id: number, motivo: string, ip: string | null) {
  return db.transaction(async (tx) => {
    const venta = await ventasRepo.bloquearPorId(id, tx);
    if (!venta) throw AppError.noEncontrado('Venta no encontrada');
    if (venta.estado === 'anulada') throw AppError.conflicto(`La venta #${venta.numero} ya está anulada`);
    if (await mesCerrado(mesNegocio(venta.fecha), tx)) {
      throw AppError.conflicto('El mes de esta venta ya está cerrado; no se puede anular');
    }
    // Una venta que ya entró en un arqueo cerrado no se anula: cambiaría un cierre de caja ya firmado.
    // (Bloqueo compartido: si la caja se está cerrando en este momento, se espera a que termine.)
    if (venta.cajaId) {
      const caja = await cajaRepo.compartirPorId(venta.cajaId, tx);
      if (caja?.estado === 'cerrada') {
        throw AppError.conflicto('La caja de esta venta ya se cerró; no se puede anular. Si devolvieron la mercancía, registra el ajuste de stock y el gasto de la devolución.');
      }
    }

    // Devuelve el stock por producto_id (nunca por nombre). Líneas sin producto (importadas) no mueven stock.
    const items = await ventasRepo.itemsDe(venta.id, tx);
    const devolucion = new Map<number, number>();
    for (const it of items) {
      if (it.productoId) devolucion.set(it.productoId, aMilesimas((devolucion.get(it.productoId) ?? 0) + it.cantidad));
    }
    await productosRepo.bloquearPorIds([...devolucion.keys()], tx);
    const movimientos = [];
    for (const [productoId, cantidad] of devolucion) {
      const stockResultante = await productosRepo.moverStock(productoId, cantidad, tx);
      movimientos.push({ productoId, tipo: 'anulacion' as const, cantidad, stockResultante, ventaId: venta.id, usuarioId: admin.id, motivo });
    }
    await productosRepo.registrarMovimientos(movimientos, tx);

    const anulada = await ventasRepo.marcarAnulada(venta.id, { motivo, anuladaPor: admin.id }, tx);
    await registrarEvento(
      {
        usuarioId: admin.id,
        accion: 'venta.anular',
        entidad: 'venta',
        entidadId: venta.id,
        antes: { estado: venta.estado },
        despues: { estado: 'anulada', motivo },
        ip,
      },
      tx,
    );
    return ventasRepo.conItems(anulada, tx);
  });
}
