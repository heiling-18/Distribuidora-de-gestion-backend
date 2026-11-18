import { and, asc, desc, eq, gte, inArray, lt, sql } from 'drizzle-orm';
import { db, type Db, type Tx } from '../../database/client.js';
import { huevoMovimientos, huevoTipos } from '../../models/index.js';

type Ejecutor = Db | Tx;
export type FilaTipo = typeof huevoTipos.$inferSelect;
export type FilaMovimiento = typeof huevoMovimientos.$inferSelect;
export type NuevoMovimiento = typeof huevoMovimientos.$inferInsert;

export const HUEVOS_POR_CARTON = 30;

/** Huevos que suma un movimiento al inventario: + entradas, − ventas y rotos. */
const signo = sql<number>`case when ${huevoMovimientos.clase} = 'entrada' then ${huevoMovimientos.huevos} else -${huevoMovimientos.huevos} end`;

// ---------- Tamaños ----------

export function listarTipos(filtro: 'true' | 'false' | 'todos' = 'todos', ej: Ejecutor = db) {
  return ej
    .select()
    .from(huevoTipos)
    .where(filtro === 'todos' ? undefined : eq(huevoTipos.activo, filtro === 'true'))
    .orderBy(asc(huevoTipos.orden), asc(huevoTipos.nombre));
}

export async function buscarTipo(id: number, ej: Ejecutor = db): Promise<FilaTipo | undefined> {
  const [fila] = await ej.select().from(huevoTipos).where(eq(huevoTipos.id, id)).limit(1);
  return fila;
}

export function buscarTipos(ids: number[], ej: Ejecutor = db): Promise<FilaTipo[]> {
  if (!ids.length) return Promise.resolve([]);
  return ej.select().from(huevoTipos).where(inArray(huevoTipos.id, ids));
}

export async function siguienteOrden(ej: Ejecutor = db): Promise<number> {
  const [fila] = await ej.select({ max: sql<number>`coalesce(max(${huevoTipos.orden}), 0)`.mapWith(Number) }).from(huevoTipos);
  return fila!.max + 1;
}

export async function crearTipo(datos: typeof huevoTipos.$inferInsert, tx: Tx): Promise<FilaTipo> {
  const [fila] = await tx.insert(huevoTipos).values(datos).returning();
  return fila!;
}

export async function actualizarTipo(id: number, cambios: Partial<typeof huevoTipos.$inferInsert>, ej: Ejecutor): Promise<FilaTipo> {
  const [fila] = await ej.update(huevoTipos).set(cambios).where(eq(huevoTipos.id, id)).returning();
  return fila!;
}

export async function eliminarTipo(id: number, tx: Tx): Promise<void> {
  await tx.delete(huevoTipos).where(eq(huevoTipos.id, id));
}

export async function contarMovimientosDeTipo(tipoId: number, ej: Ejecutor = db): Promise<number> {
  return ej.$count(huevoMovimientos, eq(huevoMovimientos.tipoId, tipoId));
}

// ---------- Inventario ----------

/**
 * Bloquea los tamaños (en orden, para no cruzarse) hasta el fin de la transacción:
 * dos ventas del mismo tamaño a la vez se atienden una después de la otra.
 */
export async function bloquearTipos(ids: number[], tx: Tx): Promise<void> {
  for (const id of [...new Set(ids)].sort((a, b) => a - b)) {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`huevo_tipo_${id}`}))`);
  }
}

/** Huevos en bodega por tamaño (puede devolver negativos: el servicio lo valida). */
export async function saldos(ids?: number[], ej: Ejecutor = db): Promise<Map<number, number>> {
  const filas = await ej
    .select({ tipoId: huevoMovimientos.tipoId, saldo: sql<number>`coalesce(sum(${signo}), 0)`.mapWith(Number) })
    .from(huevoMovimientos)
    .where(ids ? inArray(huevoMovimientos.tipoId, ids.length ? ids : [0]) : undefined)
    .groupBy(huevoMovimientos.tipoId);
  return new Map(filas.map((f) => [f.tipoId, f.saldo]));
}

// ---------- Movimientos ----------

export async function insertarMovimientos(filas: NuevoMovimiento[], tx: Tx): Promise<FilaMovimiento[]> {
  if (!filas.length) return [];
  return tx.insert(huevoMovimientos).values(filas).returning();
}

export function buscarPorIdempotencia(clave: string, ej: Ejecutor = db): Promise<FilaMovimiento[]> {
  return ej.select().from(huevoMovimientos).where(eq(huevoMovimientos.idempotencyKey, clave)).orderBy(asc(huevoMovimientos.id));
}

export async function bloquearMovimiento(id: number, tx: Tx): Promise<FilaMovimiento | undefined> {
  const [fila] = await tx.select().from(huevoMovimientos).where(eq(huevoMovimientos.id, id)).limit(1).for('update');
  return fila;
}

export async function actualizarMovimiento(id: number, cambios: Partial<NuevoMovimiento>, tx: Tx): Promise<FilaMovimiento> {
  const [fila] = await tx.update(huevoMovimientos).set(cambios).where(eq(huevoMovimientos.id, id)).returning();
  return fila!;
}

export async function eliminarMovimiento(id: number, tx: Tx): Promise<void> {
  await tx.delete(huevoMovimientos).where(eq(huevoMovimientos.id, id));
}

/** Movimientos de días [desde, hasta), con el nombre del tamaño. Los más recientes primero. */
export function listarMovimientos(desde: string, hasta: string, clase?: FilaMovimiento['clase'], ej: Ejecutor = db) {
  return ej
    .select({ movimiento: huevoMovimientos, tipo: huevoTipos.nombre })
    .from(huevoMovimientos)
    .innerJoin(huevoTipos, eq(huevoTipos.id, huevoMovimientos.tipoId))
    .where(and(gte(huevoMovimientos.fecha, desde), lt(huevoMovimientos.fecha, hasta), clase ? eq(huevoMovimientos.clase, clase) : undefined))
    .orderBy(desc(huevoMovimientos.fecha), desc(huevoMovimientos.id));
}

/** Totales de los movimientos de días [desde, hasta). El valor vendido se redondea por línea, como en la página. */
export async function totales(desde: string, hasta: string, ej: Ejecutor = db) {
  const de = (clase: string) => sql`${huevoMovimientos.clase} = ${clase}`;
  const [fila] = await ej
    .select({
      vendido: sql<number>`coalesce(sum(round(${huevoMovimientos.huevos}::numeric / ${HUEVOS_POR_CARTON} * ${huevoMovimientos.precioCarton})) filter (where ${de('venta')}), 0)`.mapWith(Number),
      huevosVendidos: sql<number>`coalesce(sum(${huevoMovimientos.huevos}) filter (where ${de('venta')}), 0)`.mapWith(Number),
      huevosIngresados: sql<number>`coalesce(sum(${huevoMovimientos.huevos}) filter (where ${de('entrada')}), 0)`.mapWith(Number),
      huevosRotos: sql<number>`coalesce(sum(${huevoMovimientos.huevos}) filter (where ${de('perdida')}), 0)`.mapWith(Number),
    })
    .from(huevoMovimientos)
    .where(and(gte(huevoMovimientos.fecha, desde), lt(huevoMovimientos.fecha, hasta)));
  return fila!;
}
