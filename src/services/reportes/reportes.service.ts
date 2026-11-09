import { sql } from 'drizzle-orm';
import { db } from '../../database/client.js';
import type { UsuarioSesion } from '../../interfaces/auth/auth.js';
import { registrarEvento } from '../../repositories/auditoria/auditoria.repository.js';
import * as cajaRepo from '../../repositories/caja/caja.repository.js';
import * as cierresRepo from '../../repositories/cierresMensuales/cierresMensuales.repository.js';
import * as reportesRepo from '../../repositories/reportes/reportes.repository.js';
import { AppError } from '../../utils/errores/AppError.js';
import { fechaNegocio, mesNegocio, mesSiguiente, sumarDias } from '../../utils/fecha/fecha.js';

const margen = (ganancia: number, total: number) => (total > 0 ? Math.round((ganancia / total) * 10000) / 100 : 0);

/** Panel de inicio. El vendedor no ve ganancias. */
export async function dashboard(usuario: UsuarioSesion) {
  const hoy = fechaNegocio();
  const manana = sumarDias(hoy, 1);

  const inicioSemana = sumarDias(hoy, -6);

  const [totalesHoy, caja, stockBajo, totalStockBajo, ultimas, porDia, inventario] = await Promise.all([
    reportesRepo.totalesPeriodo(hoy, manana),
    cajaRepo.buscarAbierta(),
    reportesRepo.productosStockBajo(5),
    reportesRepo.contarStockBajo(),
    reportesRepo.ultimasVentas(5),
    reportesRepo.ventasPorDia(inicioSemana, manana),
    reportesRepo.valorInventario(),
  ]);

  // Últimos 7 días, incluidos los que no tuvieron ventas.
  const totalPorDia = new Map(porDia.map((d) => [d.dia, d.total]));
  const semana = Array.from({ length: 7 }, (_, i) => {
    const dia = sumarDias(inicioSemana, i);
    return { dia, total: totalPorDia.get(dia) ?? 0 };
  });

  const { gananciaBruta, utilidadNeta, ...ventasHoy } = totalesHoy;
  const { inversion, ...inventarioPublico } = inventario;
  const esAdmin = usuario.rol === 'admin';
  return {
    fecha: hoy,
    hoy: esAdmin ? { ...ventasHoy, gananciaBruta, utilidadNeta } : ventasHoy,
    caja: caja ? { id: caja.id, estado: caja.estado, abiertaPor: caja.abiertaPor, esDeOtroDia: caja.fecha !== hoy } : null,
    stockBajo: { total: totalStockBajo, productos: stockBajo },
    ultimasVentas: ultimas,
    semana,
    // La inversión (a precio de compra) solo la ve el administrador.
    inventario: esAdmin ? inventario : inventarioPublico,
  };
}

export async function reporteMes(mes = mesNegocio()) {
  const hasta = mesSiguiente(mes);
  const [totales, porDia, top, gastos, cierre] = await Promise.all([
    reportesRepo.totalesPeriodo(mes, hasta),
    reportesRepo.ventasPorDia(mes, hasta),
    reportesRepo.topProductos(mes, hasta, 10),
    reportesRepo.gastosPorCategoria(mes, hasta),
    cierresRepo.buscarPorMes(mes),
  ]);
  return {
    mes,
    ...totales,
    margen: margen(totales.gananciaBruta, totales.totalVentas),
    ventasPorDia: porDia,
    topProductos: top,
    gastosPorCategoria: gastos,
    /** Acta guardada si el mes ya se cerró (sus cifras no cambian aunque se corrija algo después). */
    cierre: cierre ?? null,
  };
}

export async function historico() {
  const [totales, porMes] = await Promise.all([
    reportesRepo.totalesPeriodo(null, mesSiguiente(mesNegocio())),
    reportesRepo.historicoPorMes(),
  ]);
  return { ...totales, margen: margen(totales.gananciaBruta, totales.totalVentas), porMes };
}

export function listarCierresMensuales() {
  return cierresRepo.listar();
}

/**
 * Cierra un mes: guarda el acta con sus cifras y bloquea anulaciones y gastos de ese mes.
 * Solo meses que ya terminaron.
 */
export async function cerrarMes(admin: UsuarioSesion, mes: string, ip: string | null) {
  if (mes >= mesNegocio()) throw AppError.conflicto('Solo se pueden cerrar meses que ya terminaron');

  return db.transaction(async (tx) => {
    // Bloqueo por mes: dos cierres del mismo mes a la vez se atienden en fila.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`cierre_mes_${mes}`}))`);
    if (await cierresRepo.mesCerrado(mes, tx)) throw AppError.conflicto('Ese mes ya está cerrado');

    const t = await reportesRepo.totalesPeriodo(mes, mesSiguiente(mes), tx);
    const cierre = await cierresRepo.crear(
      {
        mes,
        totalVentas: t.totalVentas,
        ventasEfectivo: t.ventasEfectivo,
        ventasTransferencia: t.ventasTransferencia,
        gananciaBruta: t.gananciaBruta,
        totalGastos: t.totalGastos,
        utilidadNeta: t.utilidadNeta,
        numVentas: t.numVentas,
        numAnuladas: t.numAnuladas,
        unidadesVendidas: t.unidadesVendidas,
        cerradoPor: admin.id,
        cerradoPorNombre: admin.nombre,
      },
      tx,
    );
    await registrarEvento({ usuarioId: admin.id, accion: 'mes.cerrar', entidad: 'cierre_mensual', entidadId: cierre.id, despues: cierre, ip }, tx);
    return cierre;
  });
}
