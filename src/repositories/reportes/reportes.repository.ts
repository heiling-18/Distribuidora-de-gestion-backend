import { and, desc, eq, gte, lt, sql } from 'drizzle-orm';
import { db, type Db, type Tx } from '../../database/client.js';
import { gastos, productos, ventaItems, ventas } from '../../models/index.js';
import { diaNegocio, inicioDelDia } from '../comunes/fechasSql.js';

type Ejecutor = Db | Tx;

const completada = sql`${ventas.estado} = 'completada'`;
const suma = (col: unknown, filtro = completada) => sql<number>`coalesce(sum(${col}) filter (where ${filtro}), 0)`.mapWith(Number);

/** Ventas con fecha en [desde, hasta) — días del negocio. */
const ventasEntre = (desde: string, hasta: string) =>
  and(sql`${ventas.fecha} >= ${inicioDelDia(desde)}`, sql`${ventas.fecha} < ${inicioDelDia(hasta)}`);

export interface TotalesPeriodo {
  totalVentas: number;
  ventasEfectivo: number;
  ventasTransferencia: number;
  ivaTotal: number;
  gananciaBruta: number;
  numVentas: number;
  numAnuladas: number;
  unidadesVendidas: number;
  totalGastos: number;
  utilidadNeta: number;
}

/** Totales de un periodo [desde, hasta). Sin `desde`, desde el inicio de los tiempos. */
export async function totalesPeriodo(desde: string | null, hasta: string, ej: Ejecutor = db): Promise<TotalesPeriodo> {
  const filtroVentas = desde ? ventasEntre(desde, hasta) : sql`${ventas.fecha} < ${inicioDelDia(hasta)}`;
  const filtroGastos = desde ? and(gte(gastos.fecha, desde), lt(gastos.fecha, hasta)) : lt(gastos.fecha, hasta);

  // En serie, no en paralelo: dentro de una transacción todas comparten una sola conexión.
  const [v] = await ej
      .select({
        totalVentas: suma(ventas.total),
        ventasEfectivo: suma(ventas.total, sql`${completada} and ${ventas.metodoPago} = 'efectivo'`),
        ventasTransferencia: suma(ventas.total, sql`${completada} and ${ventas.metodoPago} = 'transferencia'`),
        ivaTotal: suma(ventas.ivaTotal),
        gananciaBruta: suma(ventas.gananciaBruta),
        numVentas: sql<number>`count(*) filter (where ${completada})`.mapWith(Number),
        numAnuladas: sql<number>`count(*) filter (where ${ventas.estado} = 'anulada')`.mapWith(Number),
      })
      .from(ventas)
      .where(filtroVentas);
  const [u] = await ej
    .select({ unidades: sql<number>`coalesce(sum(${ventaItems.cantidad}), 0)`.mapWith(Number) })
    .from(ventaItems)
    .innerJoin(ventas, eq(ventas.id, ventaItems.ventaId))
    .where(and(filtroVentas, completada));
  const [g] = await ej
    .select({ total: sql<number>`coalesce(sum(${gastos.monto}), 0)`.mapWith(Number) })
    .from(gastos)
    .where(filtroGastos);

  return {
    ...v!,
    unidadesVendidas: u!.unidades,
    totalGastos: g!.total,
    utilidadNeta: Math.round((v!.gananciaBruta - g!.total) * 100) / 100,
  };
}

export function ventasPorDia(desde: string, hasta: string, ej: Ejecutor = db) {
  const dia = diaNegocio(ventas.fecha);
  return ej
    .select({
      dia: sql<string>`${dia}::text`,
      total: suma(ventas.total),
      numVentas: sql<number>`count(*) filter (where ${completada})`.mapWith(Number),
    })
    .from(ventas)
    .where(ventasEntre(desde, hasta))
    .groupBy(dia)
    .orderBy(dia);
}

export function topProductos(desde: string, hasta: string, limite: number, ej: Ejecutor = db) {
  const cantidad = sql<number>`sum(${ventaItems.cantidad})`.mapWith(Number);
  return ej
    .select({
      productoId: ventaItems.productoId,
      producto: sql<string>`max(${ventaItems.productoNombre})`,
      cantidad,
      total: sql<number>`sum(${ventaItems.total})`.mapWith(Number),
    })
    .from(ventaItems)
    .innerJoin(ventas, eq(ventas.id, ventaItems.ventaId))
    .where(and(ventasEntre(desde, hasta), completada))
    .groupBy(ventaItems.productoId)
    .orderBy(desc(cantidad))
    .limit(limite);
}

export function gastosPorCategoria(desde: string, hasta: string, ej: Ejecutor = db) {
  const total = sql<number>`sum(${gastos.monto})`.mapWith(Number);
  return ej
    .select({ categoria: gastos.categoria, total, cantidad: sql<number>`count(*)`.mapWith(Number) })
    .from(gastos)
    .where(and(gte(gastos.fecha, desde), lt(gastos.fecha, hasta)))
    .groupBy(gastos.categoria)
    .orderBy(desc(total));
}

/** Ventas, ganancia y gastos de cada mes con movimiento. */
export async function historicoPorMes(ej: Ejecutor = db) {
  const mesVenta = sql`date_trunc('month', ${diaNegocio(ventas.fecha)})::date`;
  const mesGasto = sql`date_trunc('month', ${gastos.fecha})::date`;

  const [porMesVentas, porMesGastos] = await Promise.all([
    ej
      .select({
        mes: sql<string>`${mesVenta}::text`,
        totalVentas: suma(ventas.total),
        gananciaBruta: suma(ventas.gananciaBruta),
        numVentas: sql<number>`count(*) filter (where ${completada})`.mapWith(Number),
      })
      .from(ventas)
      .groupBy(mesVenta),
    ej
      .select({ mes: sql<string>`${mesGasto}::text`, totalGastos: sql<number>`sum(${gastos.monto})`.mapWith(Number) })
      .from(gastos)
      .groupBy(mesGasto),
  ]);

  const meses = new Map<string, { mes: string; totalVentas: number; gananciaBruta: number; numVentas: number; totalGastos: number }>();
  for (const v of porMesVentas) meses.set(v.mes, { ...v, totalGastos: 0 });
  for (const g of porMesGastos) {
    const m = meses.get(g.mes) ?? { mes: g.mes, totalVentas: 0, gananciaBruta: 0, numVentas: 0, totalGastos: 0 };
    meses.set(g.mes, { ...m, totalGastos: g.totalGastos });
  }
  return [...meses.values()]
    .map((m) => ({ ...m, utilidadNeta: Math.round((m.gananciaBruta - m.totalGastos) * 100) / 100 }))
    .sort((a, b) => b.mes.localeCompare(a.mes));
}

export function productosStockBajo(limite: number, ej: Ejecutor = db) {
  return ej
    .select({ id: productos.id, nombre: productos.nombre, stock: productos.stock, stockMinimo: productos.stockMinimo, unidadMedida: productos.unidadMedida })
    .from(productos)
    .where(and(eq(productos.activo, true), sql`${productos.stock} <= ${productos.stockMinimo}`))
    .orderBy(sql`${productos.stock} - ${productos.stockMinimo}`, productos.nombre)
    .limit(limite);
}

/** Valor del inventario activo: a precio de venta (detal) y a precio de compra. */
export async function valorInventario(ej: Ejecutor = db) {
  const [fila] = await ej
    .select({
      valorVenta: sql<number>`coalesce(sum(${productos.stock} * ${productos.precioVenta}), 0)`.mapWith(Number),
      inversion: sql<number>`coalesce(sum(${productos.stock} * ${productos.precioCompra}), 0)`.mapWith(Number),
      unidades: sql<number>`coalesce(sum(${productos.stock}), 0)`.mapWith(Number),
      referencias: sql<number>`count(*)`.mapWith(Number),
    })
    .from(productos)
    .where(eq(productos.activo, true));
  return { ...fila!, valorVenta: Math.round(fila!.valorVenta * 100) / 100, inversion: Math.round(fila!.inversion * 100) / 100 };
}

export async function contarStockBajo(ej: Ejecutor = db): Promise<number> {
  return ej.$count(productos, and(eq(productos.activo, true), sql`${productos.stock} <= ${productos.stockMinimo}`));
}

export function ultimasVentas(limite: number, ej: Ejecutor = db) {
  return ej
    .select({
      id: ventas.id,
      numero: ventas.numero,
      fecha: ventas.fecha,
      clienteNombre: ventas.clienteNombre,
      vendedorNombre: ventas.vendedorNombre,
      metodoPago: ventas.metodoPago,
      total: ventas.total,
      estado: ventas.estado,
    })
    .from(ventas)
    .orderBy(desc(ventas.fecha), desc(ventas.id))
    .limit(limite);
}
