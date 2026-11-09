import { and, count, desc, eq, gte, lte, sql, type SQL } from 'drizzle-orm';
import { db, type Db, type Tx } from '../../database/client.js';
import { gastos, usuarios } from '../../models/index.js';
import { offsetDe } from '../../utils/paginacion/paginacion.js';
import type { FiltroGastos } from '../../validators/gastos/gastos.validator.js';

type Ejecutor = Db | Tx;
export type FilaGasto = typeof gastos.$inferSelect;

const columnas = {
  id: gastos.id,
  fecha: gastos.fecha,
  categoria: gastos.categoria,
  descripcion: gastos.descripcion,
  monto: gastos.monto,
  metodoPago: gastos.metodoPago,
  cajaId: gastos.cajaId,
  registradoPor: usuarios.nombre,
  creadoEn: gastos.creadoEn,
  actualizadoEn: gastos.actualizadoEn,
};

export async function buscarPorId(id: number, ej: Ejecutor = db) {
  const [fila] = await ej
    .select(columnas)
    .from(gastos)
    .leftJoin(usuarios, eq(usuarios.id, gastos.registradoPor))
    .where(eq(gastos.id, id))
    .limit(1);
  return fila;
}

export async function bloquearPorId(id: number, tx: Tx): Promise<FilaGasto | undefined> {
  const [fila] = await tx.select().from(gastos).where(eq(gastos.id, id)).limit(1).for('update');
  return fila;
}

export async function crear(datos: typeof gastos.$inferInsert, tx: Tx): Promise<FilaGasto> {
  const [fila] = await tx.insert(gastos).values(datos).returning();
  return fila!;
}

export async function actualizar(id: number, cambios: Partial<typeof gastos.$inferInsert>, tx: Tx): Promise<FilaGasto> {
  const [fila] = await tx.update(gastos).set(cambios).where(eq(gastos.id, id)).returning();
  return fila!;
}

export async function eliminar(id: number, tx: Tx): Promise<void> {
  await tx.delete(gastos).where(eq(gastos.id, id));
}

export async function listar(filtro: FiltroGastos, ej: Ejecutor = db) {
  const c: SQL[] = [];
  if (filtro.desde) c.push(gte(gastos.fecha, filtro.desde));
  if (filtro.hasta) c.push(lte(gastos.fecha, filtro.hasta));
  if (filtro.categoria) c.push(eq(gastos.categoria, filtro.categoria));
  if (filtro.metodoPago) c.push(eq(gastos.metodoPago, filtro.metodoPago));
  if (filtro.cajaId) c.push(eq(gastos.cajaId, filtro.cajaId));
  const donde = c.length ? and(...c) : undefined;

  const [datos, [conteo], [suma]] = await Promise.all([
    ej
      .select(columnas)
      .from(gastos)
      .leftJoin(usuarios, eq(usuarios.id, gastos.registradoPor))
      .where(donde)
      .orderBy(desc(gastos.fecha), desc(gastos.id))
      .limit(filtro.limite)
      .offset(offsetDe(filtro)),
    ej.select({ total: count() }).from(gastos).where(donde),
    ej.select({ monto: sql<number>`coalesce(sum(${gastos.monto}), 0)`.mapWith(Number) }).from(gastos).where(donde),
  ]);
  return { datos, total: conteo?.total ?? 0, montoTotal: suma?.monto ?? 0 };
}
