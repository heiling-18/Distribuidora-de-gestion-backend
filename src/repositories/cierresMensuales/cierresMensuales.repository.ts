import { desc, eq } from 'drizzle-orm';
import { db, type Db, type Tx } from '../../database/client.js';
import { cierresMensuales } from '../../models/index.js';

type Ejecutor = Db | Tx;
export type FilaCierreMensual = typeof cierresMensuales.$inferSelect;

/** true si el mes ("YYYY-MM-01") ya tiene acta de cierre. */
export async function mesCerrado(mes: string, ej: Ejecutor = db): Promise<boolean> {
  return (await ej.$count(cierresMensuales, eq(cierresMensuales.mes, mes))) > 0;
}

export async function buscarPorMes(mes: string, ej: Ejecutor = db): Promise<FilaCierreMensual | undefined> {
  const [fila] = await ej.select().from(cierresMensuales).where(eq(cierresMensuales.mes, mes)).limit(1);
  return fila;
}

export function listar(ej: Ejecutor = db): Promise<FilaCierreMensual[]> {
  return ej.select().from(cierresMensuales).orderBy(desc(cierresMensuales.mes));
}

export async function crear(datos: typeof cierresMensuales.$inferInsert, tx: Tx): Promise<FilaCierreMensual> {
  const [fila] = await tx.insert(cierresMensuales).values(datos).returning();
  return fila!;
}
