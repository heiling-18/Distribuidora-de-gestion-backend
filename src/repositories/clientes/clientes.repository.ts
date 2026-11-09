import { and, asc, count, eq, ilike, or, type SQL } from 'drizzle-orm';
import { db, type Db, type Tx } from '../../database/client.js';
import { clientes } from '../../models/index.js';
import { patronContiene } from '../../utils/busqueda/busqueda.js';
import { offsetDe } from '../../utils/paginacion/paginacion.js';
import type { FiltroClientes } from '../../validators/clientes/clientes.validator.js';

type Ejecutor = Db | Tx;
export type FilaCliente = typeof clientes.$inferSelect;

export async function buscarActivoPorId(id: number, ej: Ejecutor = db): Promise<FilaCliente | undefined> {
  const [fila] = await ej
    .select()
    .from(clientes)
    .where(and(eq(clientes.id, id), eq(clientes.activo, true)))
    .limit(1);
  return fila;
}

export async function buscarPorId(id: number, ej: Ejecutor = db): Promise<FilaCliente | undefined> {
  const [fila] = await ej.select().from(clientes).where(eq(clientes.id, id)).limit(1);
  return fila;
}

export async function bloquearPorId(id: number, tx: Tx): Promise<FilaCliente | undefined> {
  const [fila] = await tx.select().from(clientes).where(eq(clientes.id, id)).limit(1).for('update');
  return fila;
}

export async function crear(datos: typeof clientes.$inferInsert, tx: Tx): Promise<FilaCliente> {
  const [fila] = await tx.insert(clientes).values(datos).returning();
  return fila!;
}

export async function actualizar(id: number, cambios: Partial<typeof clientes.$inferInsert>, tx: Tx): Promise<FilaCliente> {
  const [fila] = await tx.update(clientes).set(cambios).where(eq(clientes.id, id)).returning();
  return fila!;
}

export async function listar(filtro: FiltroClientes, ej: Ejecutor = db) {
  const c: SQL[] = [];
  if (filtro.activo !== 'todos') c.push(eq(clientes.activo, filtro.activo === 'true'));
  if (filtro.q) {
    const patron = patronContiene(filtro.q);
    c.push(or(ilike(clientes.nombre, patron), ilike(clientes.documento, patron), ilike(clientes.telefono, patron))!);
  }
  const donde = c.length ? and(...c) : undefined;

  const [datos, [conteo]] = await Promise.all([
    ej.select().from(clientes).where(donde).orderBy(asc(clientes.nombre), asc(clientes.id)).limit(filtro.limite).offset(offsetDe(filtro)),
    ej.select({ total: count() }).from(clientes).where(donde),
  ]);
  return { datos, total: conteo?.total ?? 0 };
}
