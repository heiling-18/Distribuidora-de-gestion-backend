import { sql } from 'drizzle-orm';
import { db, type Tx } from '../../database/client.js';
import type { UsuarioSesion } from '../../interfaces/auth/auth.js';
import { registrarEvento } from '../../repositories/auditoria/auditoria.repository.js';
import * as huevosRepo from '../../repositories/huevos/huevos.repository.js';
import { AppError } from '../../utils/errores/AppError.js';
import { fechaNegocio, mesNegocio, mesSiguiente, sumarDias } from '../../utils/fecha/fecha.js';
import type {
  ActualizarMovimientoDto,
  ActualizarTipoDto,
  CrearTipoDto,
  FiltroMovimientos,
  IngresoDto,
  RotosDto,
  VenderDto,
} from '../../validators/huevos/huevos.validator.js';

const { HUEVOS_POR_CARTON } = huevosRepo;

/** Valor de una cantidad de huevos a un precio por cartón de 30 (redondeado a pesos, como en la página). */
export const valorHuevos = (huevos: number, precioCarton: number) => Math.round((huevos / HUEVOS_POR_CARTON) * precioCarton);

/** Precio de un huevo suelto: el del cartón dividido entre 30, redondeado. */
export const precioUnidad = (precioCarton: number) => Math.round(precioCarton / HUEVOS_POR_CARTON);

const huevosDe = (forma: 'carton' | 'unidad', cantidad: number) => (forma === 'carton' ? cantidad * HUEVOS_POR_CARTON : cantidad);

/** El vendedor anota solo el día de hoy; el administrador, cualquier día que no sea futuro. */
function validarFecha(usuario: UsuarioSesion, fecha: string) {
  const hoy = fechaNegocio();
  if (fecha > hoy) throw AppError.solicitudInvalida('No se pueden anotar días futuros');
  if (usuario.rol !== 'admin' && fecha !== hoy) throw AppError.prohibido('Solo puedes anotar movimientos del día de hoy');
}

/** Tamaños pedidos: todos deben existir y estar activos. */
async function tiposActivos(ids: number[], tx: Tx) {
  const tipos = new Map((await huevosRepo.buscarTipos([...new Set(ids)], tx)).map((t) => [t.id, t]));
  for (const id of ids) {
    const t = tipos.get(id);
    if (!t || !t.activo) throw AppError.noEncontrado(`El tamaño ${id} no existe o está desactivado`);
  }
  return tipos;
}

/**
 * Con los tamaños ya bloqueados: ningún tamaño puede quedar con inventario negativo.
 * Se llama después de cambiar los movimientos; si falla, la transacción se revierte.
 */
async function exigirSaldoNoNegativo(tipoIds: number[], tx: Tx) {
  const saldos = await huevosRepo.saldos(tipoIds, tx);
  for (const id of tipoIds) {
    const saldo = saldos.get(id) ?? 0;
    if (saldo < 0) {
      const tipo = await huevosRepo.buscarTipo(id, tx);
      throw AppError.conflicto(`El inventario de huevos ${tipo?.nombre ?? id} quedaría en negativo (${saldo} huevos)`);
    }
  }
}

/**
 * Antes de sacar huevos (venta o rotos): bloquea los tamaños y revisa que alcancen.
 * `pedido`: huevos que se van a sacar por tamaño.
 */
async function reservar(pedido: Map<number, number>, tipos: Map<number, huevosRepo.FilaTipo>, tx: Tx) {
  await huevosRepo.bloquearTipos([...pedido.keys()], tx);
  const saldos = await huevosRepo.saldos([...pedido.keys()], tx);
  for (const [id, huevos] of pedido) {
    const hay = Math.max(0, saldos.get(id) ?? 0);
    if (huevos > hay) {
      throw AppError.conflicto(`No hay suficientes huevos ${tipos.get(id)!.nombre}: quedan ${hay}`, { tipoId: id, pedido: huevos, disponible: hay });
    }
  }
}

const conValor = (m: huevosRepo.FilaMovimiento) => ({ ...m, valor: m.clase === 'venta' ? valorHuevos(m.huevos, m.precioCarton) : 0 });

// ---------------------------------------------------------------------
// Resumen (Inicio)
// ---------------------------------------------------------------------

export async function resumen() {
  const hoy = fechaNegocio();
  const [tipos, saldos, delDia] = await Promise.all([
    huevosRepo.listarTipos('todos'),
    huevosRepo.saldos(),
    huevosRepo.totales(hoy, sumarDias(hoy, 1)),
  ]);
  // Activos, y los desactivados que aún tienen huevos en bodega.
  const porTamano = tipos
    .map((t) => {
      const enBodega = Math.max(0, saldos.get(t.id) ?? 0);
      return { tipoId: t.id, nombre: t.nombre, precioVenta: t.precioVenta, activo: t.activo, enBodega, valorBodega: valorHuevos(enBodega, t.precioVenta) };
    })
    .filter((t) => t.activo || t.enBodega > 0);
  return {
    fecha: hoy,
    porTamano,
    bodega: {
      huevos: porTamano.reduce((s, t) => s + t.enBodega, 0),
      valor: porTamano.reduce((s, t) => s + t.valorBodega, 0),
    },
    hoy: delDia,
  };
}

// ---------------------------------------------------------------------
// Tamaños
// ---------------------------------------------------------------------

export function listarTipos(activo: 'true' | 'false' | 'todos') {
  return huevosRepo.listarTipos(activo);
}

export async function crearTipo(admin: UsuarioSesion, dto: CrearTipoDto, ip: string | null) {
  return db.transaction(async (tx) => {
    const tipo = await huevosRepo.crearTipo({ ...dto, orden: dto.orden ?? (await huevosRepo.siguienteOrden(tx)) }, tx);
    await registrarEvento({ usuarioId: admin.id, accion: 'huevo_tipo.crear', entidad: 'huevo_tipo', entidadId: tipo.id, despues: tipo, ip }, tx);
    return tipo;
  });
}

/** Admin y vendedor cambian el precio; nombre, orden y activo solo el administrador. */
export async function actualizarTipo(usuario: UsuarioSesion, id: number, cambios: ActualizarTipoDto, ip: string | null) {
  if (usuario.rol !== 'admin' && Object.keys(cambios).some((k) => k !== 'precioVenta')) {
    throw AppError.prohibido('Solo el administrador puede renombrar, ordenar o desactivar tamaños');
  }
  return db.transaction(async (tx) => {
    const antes = await huevosRepo.buscarTipo(id, tx);
    if (!antes) throw AppError.noEncontrado('Tamaño no encontrado');
    const despues = await huevosRepo.actualizarTipo(id, cambios, tx);
    await registrarEvento({ usuarioId: usuario.id, accion: 'huevo_tipo.actualizar', entidad: 'huevo_tipo', entidadId: id, antes, despues, ip }, tx);
    return despues;
  });
}

/** Un tamaño solo se borra si no tiene movimientos; si los tiene, se desactiva. */
export async function eliminarTipo(admin: UsuarioSesion, id: number, ip: string | null) {
  await db.transaction(async (tx) => {
    const tipo = await huevosRepo.buscarTipo(id, tx);
    if (!tipo) throw AppError.noEncontrado('Tamaño no encontrado');
    if ((await huevosRepo.contarMovimientosDeTipo(id, tx)) > 0) {
      throw AppError.conflicto('Este tamaño tiene movimientos: desactívalo en lugar de borrarlo');
    }
    await huevosRepo.eliminarTipo(id, tx);
    await registrarEvento({ usuarioId: admin.id, accion: 'huevo_tipo.eliminar', entidad: 'huevo_tipo', entidadId: id, antes: tipo, ip }, tx);
  });
}

// ---------------------------------------------------------------------
// Ventas, rotos e ingresos
// ---------------------------------------------------------------------

/** Huevos por tamaño de un cobro, sin importar el orden de las líneas (para comparar reintentos). */
const firma = (lineas: { tipoId: number; huevos: number }[]) =>
  lineas
    .map((l) => `${l.tipoId}:${l.huevos}`)
    .sort()
    .join(',');

function respuestaVenta(movimientos: huevosRepo.FilaMovimiento[], repetida: boolean) {
  const lineas = movimientos.map(conValor);
  return { movimientos: lineas, total: lineas.reduce((s, l) => s + l.valor, 0), repetida };
}

/**
 * Cobro del carrito: varias líneas (tamaños, por cartón o por unidad), todas o ninguna.
 * El precio sale del tamaño; por unidad se cobra round(precio / 30) el huevo.
 */
export async function vender(usuario: UsuarioSesion, dto: VenderDto) {
  const fecha = dto.fecha ?? fechaNegocio();
  validarFecha(usuario, fecha);

  return db.transaction(async (tx) => {
    // Misma clave a la vez: la segunda espera y encuentra la primera.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`huevos_venta_${dto.idempotencyKey}`}))`);
    const lineasPedidas = dto.items.map((i) => ({ ...i, huevos: huevosDe(i.forma, i.cantidad) }));

    const previas = await huevosRepo.buscarPorIdempotencia(dto.idempotencyKey, tx);
    if (previas.length) {
      if (firma(previas) !== firma(lineasPedidas)) {
        throw AppError.conflicto('Esa clave de venta ya se usó para otra venta. Vuelve a intentar el cobro.', { codigo: 'IDEMPOTENCIA_DISTINTA' });
      }
      return respuestaVenta(previas, true);
    }

    const tipos = await tiposActivos(lineasPedidas.map((l) => l.tipoId), tx);
    const pedido = new Map<number, number>();
    for (const l of lineasPedidas) pedido.set(l.tipoId, (pedido.get(l.tipoId) ?? 0) + l.huevos);
    await reservar(pedido, tipos, tx);

    const movimientos = await huevosRepo.insertarMovimientos(
      lineasPedidas.map((l) => {
        const precioVenta = tipos.get(l.tipoId)!.precioVenta;
        return {
          fecha,
          tipoId: l.tipoId,
          clase: 'venta' as const,
          huevos: l.huevos,
          // Por unidad se guarda el cartón equivalente: valor = huevos / 30 × precio da exacto.
          precioCarton: l.forma === 'carton' ? precioVenta : precioUnidad(precioVenta) * HUEVOS_POR_CARTON,
          tercero: dto.cliente ?? null,
          metodoPago: dto.metodoPago,
          idempotencyKey: dto.idempotencyKey,
          registradoPor: usuario.id,
          registradoPorNombre: usuario.nombre,
        };
      }),
      tx,
    );
    return respuestaVenta(movimientos, false);
  });
}

export async function registrarRotos(usuario: UsuarioSesion, dto: RotosDto) {
  const fecha = dto.fecha ?? fechaNegocio();
  validarFecha(usuario, fecha);
  return db.transaction(async (tx) => {
    const tipos = await tiposActivos([dto.tipoId], tx);
    const huevos = huevosDe(dto.forma, dto.cantidad);
    await reservar(new Map([[dto.tipoId, huevos]]), tipos, tx);
    const [mov] = await huevosRepo.insertarMovimientos(
      [{ fecha, tipoId: dto.tipoId, clase: 'perdida', huevos, notas: dto.notas ?? null, registradoPor: usuario.id, registradoPorNombre: usuario.nombre }],
      tx,
    );
    return mov!;
  });
}

/** Carga al inventario. Si el precio de venta de un tamaño cambió, se actualiza en la misma operación. */
export async function registrarIngreso(usuario: UsuarioSesion, dto: IngresoDto, ip: string | null) {
  const fecha = dto.fecha ?? fechaNegocio();
  validarFecha(usuario, fecha);
  return db.transaction(async (tx) => {
    const tipos = await tiposActivos(dto.items.map((i) => i.tipoId), tx);

    for (const item of dto.items) {
      const tipo = tipos.get(item.tipoId)!;
      if (tipo.precioVenta !== item.precioVenta) {
        const despues = await huevosRepo.actualizarTipo(tipo.id, { precioVenta: item.precioVenta }, tx);
        await registrarEvento(
          { usuarioId: usuario.id, accion: 'huevo_tipo.precio', entidad: 'huevo_tipo', entidadId: tipo.id, antes: { precioVenta: tipo.precioVenta }, despues: { precioVenta: despues.precioVenta }, ip },
          tx,
        );
        tipos.set(tipo.id, despues);
      }
    }

    const movimientos = await huevosRepo.insertarMovimientos(
      dto.items.map((i) => ({
        fecha,
        tipoId: i.tipoId,
        clase: 'entrada' as const,
        huevos: i.cartones * HUEVOS_POR_CARTON + i.sueltos,
        tercero: dto.origen ?? null,
        registradoPor: usuario.id,
        registradoPorNombre: usuario.nombre,
      })),
      tx,
    );
    return { movimientos, huevos: movimientos.reduce((s, m) => s + m.huevos, 0) };
  });
}

// ---------------------------------------------------------------------
// Historial y correcciones (admin)
// ---------------------------------------------------------------------

export async function listarMovimientos(filtro: FiltroMovimientos) {
  const mes = filtro.mes ?? mesNegocio();
  const hasta = mesSiguiente(mes);
  const [filas, totales] = await Promise.all([huevosRepo.listarMovimientos(mes, hasta, filtro.clase), huevosRepo.totales(mes, hasta)]);
  return {
    mes,
    movimientos: filas.map((f) => ({ ...conValor(f.movimiento), tipo: f.tipo })),
    totales,
  };
}

export async function actualizarMovimiento(admin: UsuarioSesion, id: number, cambios: ActualizarMovimientoDto, ip: string | null) {
  if (cambios.fecha) validarFecha(admin, cambios.fecha);
  return db.transaction(async (tx) => {
    const antes = await huevosRepo.bloquearMovimiento(id, tx);
    if (!antes) throw AppError.noEncontrado('Movimiento no encontrado');
    if (antes.clase !== 'venta' && (cambios.metodoPago !== undefined || (cambios.precioCarton ?? 0) > 0)) {
      throw AppError.solicitudInvalida('El precio y el método de pago solo aplican a ventas');
    }
    if (cambios.tipoId && cambios.tipoId !== antes.tipoId) await tiposActivos([cambios.tipoId], tx);

    const afectados = [antes.tipoId, cambios.tipoId ?? antes.tipoId];
    await huevosRepo.bloquearTipos(afectados, tx);
    const despues = await huevosRepo.actualizarMovimiento(id, cambios, tx);
    await exigirSaldoNoNegativo([...new Set(afectados)], tx);

    await registrarEvento({ usuarioId: admin.id, accion: 'huevo_movimiento.actualizar', entidad: 'huevo_movimiento', entidadId: id, antes, despues, ip }, tx);
    return conValor(despues);
  });
}

/** Borrar un movimiento: se rechaza si deja algún tamaño en negativo (p. ej. un ingreso del que ya se vendió). */
export async function eliminarMovimiento(admin: UsuarioSesion, id: number, ip: string | null) {
  await db.transaction(async (tx) => {
    const antes = await huevosRepo.bloquearMovimiento(id, tx);
    if (!antes) throw AppError.noEncontrado('Movimiento no encontrado');
    await huevosRepo.bloquearTipos([antes.tipoId], tx);
    await huevosRepo.eliminarMovimiento(id, tx);
    await exigirSaldoNoNegativo([antes.tipoId], tx);
    await registrarEvento({ usuarioId: admin.id, accion: 'huevo_movimiento.eliminar', entidad: 'huevo_movimiento', entidadId: id, antes, ip }, tx);
  });
}
