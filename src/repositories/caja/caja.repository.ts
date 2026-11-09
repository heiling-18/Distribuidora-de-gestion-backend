import { and, count, desc, eq, gte, lte, sql, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { db, type Db, type Tx } from '../../database/client.js';
import { cajas, cierresCaja, gastos, usuarios, ventas } from '../../models/index.js';
import { offsetDe, type Paginacion } from '../../utils/paginacion/paginacion.js';

type Ejecutor = Db | Tx;
export type FilaCaja = typeof cajas.$inferSelect;
export type FilaCierre = typeof cierresCaja.$inferSelect;

const abre = alias(usuarios, 'abre');
const cierra = alias(usuarios, 'cierra');

const columnasCaja = {
  id: cajas.id,
  fecha: cajas.fecha,
  estado: cajas.estado,
  montoInicial: cajas.montoInicial,
  abiertaEn: cajas.abiertaEn,
  abiertaPor: abre.nombre,
  cerradaEn: cajas.cerradaEn,
  cerradaPor: cierra.nombre,
};

function consultaCaja(ej: Ejecutor) {
  return ej
    .select(columnasCaja)
    .from(cajas)
    .leftJoin(abre, eq(abre.id, cajas.abiertaPor))
    .leftJoin(cierra, eq(cierra.id, cajas.cerradaPor));
}

export type CajaConNombres = Awaited<ReturnType<typeof buscarAbierta>>;

export async function buscarAbierta(ej: Ejecutor = db) {
  const [fila] = await consultaCaja(ej).where(eq(cajas.estado, 'abierta')).limit(1);
  return fila;
}

/** Toma la caja abierta con bloqueo de fila: otro cierre simultáneo espera a que esta transacción termine. */
export async function bloquearAbierta(tx: Tx): Promise<FilaCaja | undefined> {
  const [fila] = await tx.select().from(cajas).where(eq(cajas.estado, 'abierta')).limit(1).for('update');
  return fila;
}

/**
 * Toma la caja abierta con bloqueo compartido: varias ventas pueden registrarse a la vez,
 * pero un cierre espera a que terminen (y una venta espera a que termine un cierre en curso).
 */
export async function compartirAbierta(tx: Tx): Promise<FilaCaja | undefined> {
  const [fila] = await tx.select().from(cajas).where(eq(cajas.estado, 'abierta')).limit(1).for('share');
  return fila;
}

/** Una caja concreta con bloqueo compartido (para saber si sigue abierta mientras se edita algo ligado a ella). */
export async function compartirPorId(id: number, tx: Tx): Promise<FilaCaja | undefined> {
  const [fila] = await tx.select().from(cajas).where(eq(cajas.id, id)).limit(1).for('share');
  return fila;
}

export async function crear(datos: { fecha: string; montoInicial: number; abiertaPor: number }, ej: Ejecutor = db) {
  const [fila] = await ej.insert(cajas).values(datos).returning();
  return fila!;
}

export async function marcarCerrada(id: number, cerradaPor: number, tx: Tx): Promise<void> {
  await tx
    .update(cajas)
    .set({ estado: 'cerrada', cerradaPor, cerradaEn: new Date() })
    .where(eq(cajas.id, id));
}

export interface TotalesCaja {
  ventasEfectivo: number;
  ventasTransferencia: number;
  numVentas: number;
  numAnuladas: number;
  gastosEfectivo: number;
}

/** Totales de una caja calculados en la base. Solo cuentan las ventas y gastos ligados a esa caja. */
export async function calcularTotales(cajaId: number, ej: Ejecutor = db): Promise<TotalesCaja> {
  const [v] = await ej
    .select({
      ventasEfectivo: sql<number>`coalesce(sum(${ventas.total}) filter (where ${ventas.estado} = 'completada' and ${ventas.metodoPago} = 'efectivo'), 0)`.mapWith(Number),
      ventasTransferencia: sql<number>`coalesce(sum(${ventas.total}) filter (where ${ventas.estado} = 'completada' and ${ventas.metodoPago} = 'transferencia'), 0)`.mapWith(Number),
      numVentas: sql<number>`count(*) filter (where ${ventas.estado} = 'completada')`.mapWith(Number),
      numAnuladas: sql<number>`count(*) filter (where ${ventas.estado} = 'anulada')`.mapWith(Number),
    })
    .from(ventas)
    .where(eq(ventas.cajaId, cajaId));

  const [g] = await ej
    .select({ gastosEfectivo: sql<number>`coalesce(sum(${gastos.monto}), 0)`.mapWith(Number) })
    .from(gastos)
    .where(and(eq(gastos.cajaId, cajaId), eq(gastos.metodoPago, 'efectivo')));

  return { ...v!, gastosEfectivo: g!.gastosEfectivo };
}

export async function crearCierre(datos: typeof cierresCaja.$inferInsert, tx: Tx): Promise<FilaCierre> {
  const [fila] = await tx.insert(cierresCaja).values(datos).returning();
  return fila!;
}

const columnasCierre = {
  id: cierresCaja.id,
  cajaId: cierresCaja.cajaId,
  fecha: cajas.fecha,
  abiertaEn: cajas.abiertaEn,
  montoInicial: cierresCaja.montoInicial,
  ventasEfectivo: cierresCaja.ventasEfectivo,
  ventasTransferencia: cierresCaja.ventasTransferencia,
  gastosEfectivo: cierresCaja.gastosEfectivo,
  dineroEsperado: cierresCaja.dineroEsperado,
  dineroReal: cierresCaja.dineroReal,
  diferencia: cierresCaja.diferencia,
  observaciones: cierresCaja.observaciones,
  responsable: cierresCaja.responsable,
  cerradoEn: cierresCaja.cerradoEn,
};

export async function listarCierres(filtro: Paginacion & { desde?: string; hasta?: string }, ej: Ejecutor = db) {
  const condiciones: SQL[] = [];
  if (filtro.desde) condiciones.push(gte(cajas.fecha, filtro.desde));
  if (filtro.hasta) condiciones.push(lte(cajas.fecha, filtro.hasta));
  const donde = condiciones.length ? and(...condiciones) : undefined;

  const [datos, [conteo]] = await Promise.all([
    ej
      .select(columnasCierre)
      .from(cierresCaja)
      .innerJoin(cajas, eq(cajas.id, cierresCaja.cajaId))
      .where(donde)
      .orderBy(desc(cierresCaja.cerradoEn))
      .limit(filtro.limite)
      .offset(offsetDe(filtro)),
    ej.select({ total: count() }).from(cierresCaja).innerJoin(cajas, eq(cajas.id, cierresCaja.cajaId)).where(donde),
  ]);
  return { datos, total: conteo?.total ?? 0 };
}

export async function buscarCierre(id: number, ej: Ejecutor = db) {
  const [fila] = await ej
    .select(columnasCierre)
    .from(cierresCaja)
    .innerJoin(cajas, eq(cajas.id, cierresCaja.cajaId))
    .where(eq(cierresCaja.id, id))
    .limit(1);
  return fila;
}
