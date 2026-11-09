import { db } from '../../database/client.js';
import type { UsuarioSesion } from '../../interfaces/auth/auth.js';
import { registrarEvento } from '../../repositories/auditoria/auditoria.repository.js';
import * as cajaRepo from '../../repositories/caja/caja.repository.js';
import { AppError } from '../../utils/errores/AppError.js';
import { fechaNegocio } from '../../utils/fecha/fecha.js';
import { armarPagina, type Paginacion } from '../../utils/paginacion/paginacion.js';

/** Redondea a centavos para que las sumas de decimales no dejen residuos (0.1 + 0.2). */
const aCentavos = (n: number) => Math.round(n * 100) / 100;

export interface ResumenCaja extends cajaRepo.TotalesCaja {
  cajaId: number;
  fecha: string;
  montoInicial: number;
  /** Efectivo que debería haber en el cajón: inicial + ventas en efectivo − gastos en efectivo. */
  dineroEsperado: number;
  totalVentas: number;
}

function armarResumen(caja: { id: number; fecha: string; montoInicial: number }, t: cajaRepo.TotalesCaja): ResumenCaja {
  return {
    cajaId: caja.id,
    fecha: caja.fecha,
    montoInicial: caja.montoInicial,
    ...t,
    totalVentas: aCentavos(t.ventasEfectivo + t.ventasTransferencia),
    dineroEsperado: aCentavos(caja.montoInicial + t.ventasEfectivo - t.gastosEfectivo),
  };
}

export async function cajaActual() {
  const caja = await cajaRepo.buscarAbierta();
  if (!caja) return null;
  // Aviso para la interfaz: quedó abierta una caja de un día anterior.
  return { ...caja, esDeOtroDia: caja.fecha !== fechaNegocio() };
}

export async function resumenActual(): Promise<ResumenCaja> {
  const caja = await cajaRepo.buscarAbierta();
  if (!caja) throw AppError.conflicto('No hay una caja abierta');
  return armarResumen(caja, await cajaRepo.calcularTotales(caja.id));
}

export async function abrirCaja(usuario: UsuarioSesion, montoInicial: number, ip: string | null) {
  return db.transaction(async (tx) => {
    // El índice único cajas_una_abierta garantiza que no haya dos abiertas aunque lleguen a la vez.
    const caja = await cajaRepo.crear({ fecha: fechaNegocio(), montoInicial, abiertaPor: usuario.id }, tx);
    await registrarEvento(
      { usuarioId: usuario.id, accion: 'caja.abrir', entidad: 'caja', entidadId: caja.id, despues: caja, ip },
      tx,
    );
    // Misma forma que GET /caja/actual (con el nombre de quien abrió).
    return { ...(await cajaRepo.buscarAbierta(tx))!, esDeOtroDia: false };
  });
}

export async function cerrarCaja(
  usuario: UsuarioSesion,
  datos: { dineroReal: number; observaciones?: string },
  ip: string | null,
) {
  return db.transaction(async (tx) => {
    const caja = await cajaRepo.bloquearAbierta(tx);
    if (!caja) throw AppError.conflicto('No hay una caja abierta para cerrar');

    const resumen = armarResumen(caja, await cajaRepo.calcularTotales(caja.id, tx));
    const cierre = await cajaRepo.crearCierre(
      {
        cajaId: caja.id,
        montoInicial: caja.montoInicial,
        ventasEfectivo: resumen.ventasEfectivo,
        ventasTransferencia: resumen.ventasTransferencia,
        gastosEfectivo: resumen.gastosEfectivo,
        dineroEsperado: resumen.dineroEsperado,
        dineroReal: datos.dineroReal,
        diferencia: aCentavos(datos.dineroReal - resumen.dineroEsperado),
        observaciones: datos.observaciones || null,
        cerradoPor: usuario.id,
        responsable: usuario.nombre,
      },
      tx,
    );
    await cajaRepo.marcarCerrada(caja.id, usuario.id, tx);
    await registrarEvento(
      { usuarioId: usuario.id, accion: 'caja.cerrar', entidad: 'caja', entidadId: caja.id, despues: cierre, ip },
      tx,
    );
    return { ...cierre, fecha: caja.fecha, numVentas: resumen.numVentas, numAnuladas: resumen.numAnuladas };
  });
}

export async function listarCierres(filtro: Paginacion & { desde?: string; hasta?: string }) {
  const { datos, total } = await cajaRepo.listarCierres(filtro);
  return armarPagina(datos, total, filtro);
}

export async function obtenerCierre(id: number) {
  const cierre = await cajaRepo.buscarCierre(id);
  if (!cierre) throw AppError.noEncontrado('Cierre no encontrado');
  return cierre;
}
