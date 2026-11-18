import { sql } from 'drizzle-orm';
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

/**
 * Caja abierta y, si no hay, con cuánto se abrirá sola la próxima ("mañana se abre sola con $X").
 * `proximaBase` es null si nunca se ha cerrado una caja con base para mañana (la primera la abre el admin).
 */
export async function cajaActual() {
  const caja = await cajaRepo.buscarAbierta();
  if (caja) {
    // Aviso para la interfaz: quedó abierta una caja de un día anterior.
    return { caja: { ...caja, esDeOtroDia: caja.fecha !== fechaNegocio() }, proximaBase: null };
  }
  const ultima = await cajaRepo.ultima();
  return { caja: null, proximaBase: ultima?.baseSiguiente ?? null };
}

export async function resumenActual(): Promise<ResumenCaja> {
  const caja = await cajaRepo.buscarAbierta();
  if (!caja) throw AppError.conflicto('No hay una caja abierta');
  return armarResumen(caja, await cajaRepo.calcularTotales(caja.id));
}

/**
 * Abre sola la caja del día con lo que se dejó en la gaveta al cerrar la anterior.
 * - Si ya hay una abierta, la devuelve.
 * - No abre si la última caja es de hoy (ya se cerró hoy: la siguiente se abre mañana)
 *   ni si la última no dejó base para mañana (la primera vez la abre el administrador).
 * Devuelve `{ caja, abierta }`: `abierta` es true solo si se abrió en esta llamada.
 */
export async function abrirAutomatica(usuario: UsuarioSesion, ip: string | null) {
  return db.transaction(async (tx) => {
    // Dos personas entrando a la vez no abren dos cajas (ni chocan con el índice único).
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('abrir_caja_automatica'))`);
    const hoy = fechaNegocio();

    const abierta = await cajaRepo.buscarAbierta(tx);
    if (abierta) return { caja: { ...abierta, esDeOtroDia: abierta.fecha !== hoy }, abierta: false };

    const ultima = await cajaRepo.ultima(tx);
    if (!ultima || ultima.baseSiguiente === null || ultima.fecha >= hoy) return { caja: null, abierta: false };

    const nueva = await cajaRepo.crear({ fecha: hoy, montoInicial: ultima.baseSiguiente, abiertaPor: usuario.id, aperturaAutomatica: true }, tx);
    await registrarEvento(
      { usuarioId: usuario.id, accion: 'caja.abrir_automatica', entidad: 'caja', entidadId: nueva.id, despues: nueva, ip },
      tx,
    );
    return { caja: { ...(await cajaRepo.buscarAbierta(tx))!, esDeOtroDia: false }, abierta: true };
  });
}

/** El administrador cambia la base de la caja abierta, con un motivo. Queda la base original y quién la cambió. */
export async function ajustarBase(admin: UsuarioSesion, datos: { monto: number; motivo: string }, ip: string | null) {
  return db.transaction(async (tx) => {
    const antes = await cajaRepo.bloquearAbierta(tx);
    if (!antes) throw AppError.conflicto('No hay una caja abierta');
    await cajaRepo.ajustarBase(antes.id, { ...datos, ajustadaPor: admin.nombre }, tx);
    const despues = (await cajaRepo.buscarAbierta(tx))!;
    await registrarEvento(
      {
        usuarioId: admin.id,
        accion: 'caja.ajustar_base',
        entidad: 'caja',
        entidadId: antes.id,
        antes: { montoInicial: antes.montoInicial },
        despues: { montoInicial: despues.montoInicial, motivo: datos.motivo },
        ip,
      },
      tx,
    );
    return { ...despues, esDeOtroDia: despues.fecha !== fechaNegocio() };
  });
}

/** Apertura manual: solo el administrador (la primera vez, o para abrir de nuevo el mismo día). */
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
  datos: { dineroReal: number; baseSiguiente?: number; observaciones?: string },
  ip: string | null,
) {
  // Lo que se deja en la gaveta para mañana; si no se dice, se deja todo lo contado.
  const baseSiguiente = datos.baseSiguiente ?? datos.dineroReal;
  if (baseSiguiente > datos.dineroReal) {
    throw AppError.solicitudInvalida('No puedes dejar en la gaveta más de lo que contaste');
  }
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
        baseSiguiente,
        retirado: aCentavos(datos.dineroReal - baseSiguiente),
        cerradoPor: usuario.id,
        responsable: usuario.nombre,
      },
      tx,
    );
    await cajaRepo.marcarCerrada(caja.id, { cerradaPor: usuario.id, baseSiguiente }, tx);
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
