import { and, asc, count, desc, eq, gte, lte, sql, type SQL } from 'drizzle-orm';
import { db, type Db, type Tx } from '../../database/client.js';
import { galponRegistros, galpones } from '../../models/index.js';
import { offsetDe } from '../../utils/paginacion/paginacion.js';
import type { FiltroRegistros } from '../../validators/galpones/galpones.validator.js';

type Ejecutor = Db | Tx;
export type FilaGalpon = typeof galpones.$inferSelect;
export type FilaRegistro = typeof galponRegistros.$inferSelect;

/** Galpones con las aves muertas acumuladas y el registro de un día. */
export function listarConTotales(filtroActivo: 'true' | 'false' | 'todos', dia: string, ej: Ejecutor = db) {
  const muertas = sql<number>`coalesce((select sum(${galponRegistros.muertas}) from ${galponRegistros} where ${galponRegistros.galponId} = ${galpones.id}), 0)`.mapWith(Number);
  const registrosDia = sql<number>`(select count(*) from ${galponRegistros} where ${galponRegistros.galponId} = ${galpones.id} and ${galponRegistros.fecha} = ${dia})`.mapWith(Number);
  return ej
    .select({ galpon: galpones, muertasTotales: muertas, registradoHoy: registrosDia })
    .from(galpones)
    .where(filtroActivo === 'todos' ? undefined : eq(galpones.activo, filtroActivo === 'true'))
    .orderBy(asc(galpones.nombre), asc(galpones.id));
}

export async function buscarPorId(id: number, ej: Ejecutor = db): Promise<FilaGalpon | undefined> {
  const [fila] = await ej.select().from(galpones).where(eq(galpones.id, id)).limit(1);
  return fila;
}

export async function bloquearPorId(id: number, tx: Tx): Promise<FilaGalpon | undefined> {
  const [fila] = await tx.select().from(galpones).where(eq(galpones.id, id)).limit(1).for('update');
  return fila;
}

export async function crear(datos: typeof galpones.$inferInsert, tx: Tx): Promise<FilaGalpon> {
  const [fila] = await tx.insert(galpones).values(datos).returning();
  return fila!;
}

export async function actualizar(id: number, cambios: Partial<typeof galpones.$inferInsert>, tx: Tx): Promise<FilaGalpon> {
  const [fila] = await tx.update(galpones).set(cambios).where(eq(galpones.id, id)).returning();
  return fila!;
}

export async function eliminar(id: number, tx: Tx): Promise<void> {
  await tx.delete(galpones).where(eq(galpones.id, id));
}

export async function contarRegistros(galponId: number, ej: Ejecutor = db): Promise<number> {
  return ej.$count(galponRegistros, eq(galponRegistros.galponId, galponId));
}

/**
 * Muertas acumuladas de un galpón. Con `sinElDia`, no cuenta el registro de ese día
 * (el que se va a reemplazar al corregirlo).
 */
export async function muertasAcumuladas(galponId: number, opciones: { sinElDia?: string } = {}, ej: Ejecutor = db): Promise<number> {
  const condiciones = [eq(galponRegistros.galponId, galponId)];
  if (opciones.sinElDia) condiciones.push(sql`${galponRegistros.fecha} <> ${opciones.sinElDia}`);
  const [fila] = await ej
    .select({ total: sql<number>`coalesce(sum(${galponRegistros.muertas}), 0)`.mapWith(Number) })
    .from(galponRegistros)
    .where(and(...condiciones));
  return fila!.total;
}

/** Crea o reemplaza el registro de un galpón en un día (uno por día). */
export async function guardarRegistro(datos: typeof galponRegistros.$inferInsert, tx: Tx): Promise<FilaRegistro> {
  const { galponId: _g, fecha: _f, ...cambios } = datos;
  const [fila] = await tx
    .insert(galponRegistros)
    .values(datos)
    .onConflictDoUpdate({ target: [galponRegistros.galponId, galponRegistros.fecha], set: { ...cambios, actualizadoEn: new Date() } })
    .returning();
  return fila!;
}

export async function buscarRegistro(id: number, ej: Ejecutor = db): Promise<FilaRegistro | undefined> {
  const [fila] = await ej.select().from(galponRegistros).where(eq(galponRegistros.id, id)).limit(1);
  return fila;
}

export async function eliminarRegistro(id: number, tx: Tx): Promise<void> {
  await tx.delete(galponRegistros).where(eq(galponRegistros.id, id));
}

export async function listarRegistros(filtro: FiltroRegistros, ej: Ejecutor = db) {
  const c: SQL[] = [];
  if (filtro.galponId) c.push(eq(galponRegistros.galponId, filtro.galponId));
  if (filtro.desde) c.push(gte(galponRegistros.fecha, filtro.desde));
  if (filtro.hasta) c.push(lte(galponRegistros.fecha, filtro.hasta));
  const donde = c.length ? and(...c) : undefined;

  const [datos, [conteo], [totales]] = await Promise.all([
    ej
      .select({ registro: galponRegistros, galpon: galpones.nombre })
      .from(galponRegistros)
      .innerJoin(galpones, eq(galpones.id, galponRegistros.galponId))
      .where(donde)
      .orderBy(desc(galponRegistros.fecha), asc(galpones.nombre))
      .limit(filtro.limite)
      .offset(offsetDe(filtro)),
    ej.select({ total: count() }).from(galponRegistros).where(donde),
    ej
      .select({
        huevos: sql<number>`coalesce(sum(${galponRegistros.huevos}), 0)`.mapWith(Number),
        muertas: sql<number>`coalesce(sum(${galponRegistros.muertas}), 0)`.mapWith(Number),
        alimentoKg: sql<number>`coalesce(sum(${galponRegistros.alimentoKg}), 0)`.mapWith(Number),
      })
      .from(galponRegistros)
      .where(donde),
  ]);
  return { datos: datos.map((d) => ({ ...d.registro, galpon: d.galpon })), total: conteo?.total ?? 0, totales: totales! };
}
