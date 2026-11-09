import { and, asc, count, desc, eq, ilike, inArray, or, sql, type SQL } from 'drizzle-orm';
import { db, type Db, type Tx } from '../../database/client.js';
import { inventarioMovimientos, productos, usuarios } from '../../models/index.js';
import { patronContiene } from '../../utils/busqueda/busqueda.js';
import { offsetDe, type Paginacion } from '../../utils/paginacion/paginacion.js';
import type { FiltroProductos } from '../../validators/productos/productos.validator.js';

type Ejecutor = Db | Tx;
export type FilaProducto = typeof productos.$inferSelect;

/**
 * Bloquea los productos para modificar su stock. Siempre en orden de id,
 * para que dos ventas con los mismos productos no se bloqueen mutuamente (deadlock).
 */
export function bloquearPorIds(ids: number[], tx: Tx): Promise<FilaProducto[]> {
  if (!ids.length) return Promise.resolve([]);
  return tx.select().from(productos).where(inArray(productos.id, ids)).orderBy(productos.id).for('update');
}

/** Suma (positivo) o resta (negativo) stock y devuelve el stock resultante. */
export async function moverStock(id: number, cantidad: number, tx: Tx): Promise<number> {
  const [fila] = await tx
    .update(productos)
    .set({ stock: sql`${productos.stock} + ${cantidad}` })
    .where(eq(productos.id, id))
    .returning({ stock: productos.stock });
  return fila!.stock;
}

export async function registrarMovimientos(movs: (typeof inventarioMovimientos.$inferInsert)[], tx: Tx): Promise<void> {
  if (movs.length) await tx.insert(inventarioMovimientos).values(movs);
}

export async function buscarPorId(id: number, ej: Ejecutor = db): Promise<FilaProducto | undefined> {
  const [fila] = await ej.select().from(productos).where(eq(productos.id, id)).limit(1);
  return fila;
}

export async function crear(datos: typeof productos.$inferInsert, tx: Tx): Promise<FilaProducto> {
  const [fila] = await tx.insert(productos).values(datos).returning();
  return fila!;
}

export async function actualizar(
  id: number,
  cambios: Partial<Omit<typeof productos.$inferInsert, 'id' | 'stock'>>,
  tx: Tx,
): Promise<FilaProducto | undefined> {
  const [fila] = await tx.update(productos).set(cambios).where(eq(productos.id, id)).returning();
  return fila;
}

export async function listar(filtro: FiltroProductos, ej: Ejecutor = db) {
  const c: SQL[] = [];
  if (filtro.activo !== 'todos') c.push(eq(productos.activo, filtro.activo === 'true'));
  if (filtro.categoria) c.push(eq(productos.categoria, filtro.categoria));
  if (filtro.stockBajo === 'true') c.push(sql`${productos.stock} <= ${productos.stockMinimo}`);
  if (filtro.q) {
    const patron = patronContiene(filtro.q);
    c.push(or(ilike(productos.nombre, patron), ilike(productos.codigo, patron))!);
  }
  const donde = c.length ? and(...c) : undefined;

  const [datos, [conteo]] = await Promise.all([
    ej.select().from(productos).where(donde).orderBy(asc(productos.nombre), asc(productos.id)).limit(filtro.limite).offset(offsetDe(filtro)),
    ej.select({ total: count() }).from(productos).where(donde),
  ]);
  return { datos, total: conteo?.total ?? 0 };
}

export async function listarMovimientos(productoId: number, pag: Paginacion, ej: Ejecutor = db) {
  const donde = eq(inventarioMovimientos.productoId, productoId);
  const [datos, [conteo]] = await Promise.all([
    ej
      .select({
        id: inventarioMovimientos.id,
        tipo: inventarioMovimientos.tipo,
        cantidad: inventarioMovimientos.cantidad,
        stockResultante: inventarioMovimientos.stockResultante,
        ventaId: inventarioMovimientos.ventaId,
        motivo: inventarioMovimientos.motivo,
        usuario: usuarios.nombre,
        creadoEn: inventarioMovimientos.creadoEn,
      })
      .from(inventarioMovimientos)
      .leftJoin(usuarios, eq(usuarios.id, inventarioMovimientos.usuarioId))
      .where(donde)
      .orderBy(desc(inventarioMovimientos.creadoEn), desc(inventarioMovimientos.id))
      .limit(pag.limite)
      .offset(offsetDe(pag)),
    ej.select({ total: count() }).from(inventarioMovimientos).where(donde),
  ]);
  return { datos, total: conteo?.total ?? 0 };
}
