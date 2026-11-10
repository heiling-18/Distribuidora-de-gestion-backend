import { db, type Tx } from '../../database/client.js';
import type { UsuarioSesion } from '../../interfaces/auth/auth.js';
import { registrarEvento } from '../../repositories/auditoria/auditoria.repository.js';
import * as cajaRepo from '../../repositories/caja/caja.repository.js';
import { mesCerrado } from '../../repositories/cierresMensuales/cierresMensuales.repository.js';
import * as gastosRepo from '../../repositories/gastos/gastos.repository.js';
import { AppError } from '../../utils/errores/AppError.js';
import { fechaNegocio, mesDeDia } from '../../utils/fecha/fecha.js';
import { armarPagina } from '../../utils/paginacion/paginacion.js';
import type { ActualizarGastoDto, CrearGastoDto, FiltroGastos } from '../../validators/gastos/gastos.validator.js';

async function validarFecha(fecha: string, tx: Tx) {
  if (fecha > fechaNegocio()) throw AppError.solicitudInvalida('No se pueden registrar gastos con fecha futura');
  if (await mesCerrado(mesDeDia(fecha), tx)) throw AppError.conflicto('Ese mes ya está cerrado; no se pueden registrar ni cambiar gastos');
}

/**
 * Un gasto en efectivo de hoy sale del cajón: se liga a la caja abierta para que se descuente
 * del dinero esperado. Los de otros días o por transferencia no tocan la caja.
 */
async function cajaPara(fecha: string, metodoPago: 'efectivo' | 'transferencia', tx: Tx): Promise<number | null> {
  if (metodoPago !== 'efectivo' || fecha !== fechaNegocio()) return null;
  return (await cajaRepo.compartirAbierta(tx))?.id ?? null;
}

/** Un gasto que ya entró en un arqueo cerrado no se puede tocar: cambiaría un cierre que ya se firmó. */
async function validarCajaNoCerrada(cajaId: number | null, tx: Tx) {
  if (!cajaId) return;
  const caja = await cajaRepo.compartirPorId(cajaId, tx);
  if (caja?.estado === 'cerrada') throw AppError.conflicto('Este gasto pertenece a una caja ya cerrada; no se puede modificar');
}

export async function listarGastos(filtro: FiltroGastos) {
  const { datos, total, montoTotal } = await gastosRepo.listar(filtro);
  return { ...armarPagina(datos, total, filtro), montoTotal };
}

export async function obtenerGasto(id: number) {
  const g = await gastosRepo.buscarPorId(id);
  if (!g) throw AppError.noEncontrado('Gasto no encontrado');
  return g;
}

/**
 * Registra un gasto. Si es en efectivo de hoy y no hay caja abierta, se guarda igual pero con un aviso:
 * no quedará descontado en ningún arqueo.
 */
export async function crearGasto(admin: UsuarioSesion, dto: CrearGastoDto, ip: string | null) {
  const fecha = dto.fecha ?? fechaNegocio();
  return db.transaction(async (tx) => {
    await validarFecha(fecha, tx);
    const cajaId = await cajaPara(fecha, dto.metodoPago, tx);
    const gasto = await gastosRepo.crear({ ...dto, fecha, cajaId, registradoPor: admin.id }, tx);
    await registrarEvento({ usuarioId: admin.id, accion: 'gasto.crear', entidad: 'gasto', entidadId: gasto.id, despues: gasto, ip }, tx);
    const sinCaja = dto.metodoPago === 'efectivo' && fecha === fechaNegocio() && !cajaId;
    return {
      gasto: (await gastosRepo.buscarPorId(gasto.id, tx))!,
      aviso: sinCaja ? 'No hay una caja abierta: este gasto en efectivo no se descontará de ningún arqueo.' : null,
    };
  });
}

export async function actualizarGasto(admin: UsuarioSesion, id: number, cambios: ActualizarGastoDto, ip: string | null) {
  return db.transaction(async (tx) => {
    const antes = await gastosRepo.bloquearPorId(id, tx);
    if (!antes) throw AppError.noEncontrado('Gasto no encontrado');
    await validarCajaNoCerrada(antes.cajaId, tx);
    await validarFecha(antes.fecha, tx);

    const fecha = cambios.fecha ?? antes.fecha;
    const metodoPago = cambios.metodoPago ?? antes.metodoPago;
    if (cambios.fecha) await validarFecha(fecha, tx);

    const despues = await gastosRepo.actualizar(id, { ...cambios, cajaId: await cajaPara(fecha, metodoPago, tx) }, tx);
    await registrarEvento({ usuarioId: admin.id, accion: 'gasto.actualizar', entidad: 'gasto', entidadId: id, antes, despues, ip }, tx);
    return (await gastosRepo.buscarPorId(id, tx))!;
  });
}

export async function eliminarGasto(admin: UsuarioSesion, id: number, ip: string | null) {
  await db.transaction(async (tx) => {
    const antes = await gastosRepo.bloquearPorId(id, tx);
    if (!antes) throw AppError.noEncontrado('Gasto no encontrado');
    await validarCajaNoCerrada(antes.cajaId, tx);
    await validarFecha(antes.fecha, tx);
    await gastosRepo.eliminar(id, tx);
    // La auditoría guarda el gasto completo: el borrado queda trazable.
    await registrarEvento({ usuarioId: admin.id, accion: 'gasto.eliminar', entidad: 'gasto', entidadId: id, antes, ip }, tx);
  });
}
