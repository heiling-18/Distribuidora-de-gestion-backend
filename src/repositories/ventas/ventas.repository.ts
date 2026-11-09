import { and, asc, count, desc, eq, ilike, inArray, or, sql, type SQL } from 'drizzle-orm';
import { db, type Db, type Tx } from '../../database/client.js';
import { ventaItems, ventas } from '../../models/index.js';
import { patronContiene } from '../../utils/busqueda/busqueda.js';
import { inicioDelDia } from '../comunes/fechasSql.js';
import { offsetDe } from '../../utils/paginacion/paginacion.js';
import type { FiltroVentas } from '../../validators/ventas/ventas.validator.js';

type Ejecutor = Db | Tx;
export type FilaVenta = typeof ventas.$inferSelect;
export type FilaItem = typeof ventaItems.$inferSelect;

/** Columnas internas que no se devuelven al cliente. */
function aPublica({ idempotencyKey: _k, legacyId: _l, ...resto }: FilaVenta) {
  return resto;
}
export type VentaPublica = ReturnType<typeof aPublica>;
export type VentaConItems = VentaPublica & { items: Omit<FilaItem, 'ventaId'>[] };

export async function buscarPorIdempotencia(clave: string, ej: Ejecutor = db): Promise<FilaVenta | undefined> {
  const [fila] = await ej.select().from(ventas).where(eq(ventas.idempotencyKey, clave)).limit(1);
  return fila;
}

export async function insertarCabecera(datos: typeof ventas.$inferInsert, tx: Tx): Promise<FilaVenta> {
  const [fila] = await tx.insert(ventas).values(datos).returning();
  return fila!;
}

export async function insertarItems(items: (typeof ventaItems.$inferInsert)[], tx: Tx): Promise<void> {
  await tx.insert(ventaItems).values(items);
}

export async function bloquearPorId(id: number, tx: Tx): Promise<FilaVenta | undefined> {
  const [fila] = await tx.select().from(ventas).where(eq(ventas.id, id)).limit(1).for('update');
  return fila;
}

export function itemsDe(ventaId: number, ej: Ejecutor = db): Promise<FilaItem[]> {
  return ej.select().from(ventaItems).where(eq(ventaItems.ventaId, ventaId)).orderBy(asc(ventaItems.id));
}

export async function marcarAnulada(
  id: number,
  datos: { motivo: string; anuladaPor: number },
  tx: Tx,
): Promise<FilaVenta> {
  const [fila] = await tx
    .update(ventas)
    .set({ estado: 'anulada', motivoAnulacion: datos.motivo, anuladaPor: datos.anuladaPor, anuladaEn: new Date() })
    .where(eq(ventas.id, id))
    .returning();
  return fila!;
}

export async function conItems(venta: FilaVenta, ej: Ejecutor = db): Promise<VentaConItems> {
  const items = (await itemsDe(venta.id, ej)).map(({ ventaId: _v, ...item }) => item);
  return { ...aPublica(venta), items };
}

export async function buscarConItems(id: number, ej: Ejecutor = db): Promise<VentaConItems | undefined> {
  const [venta] = await ej.select().from(ventas).where(eq(ventas.id, id)).limit(1);
  return venta ? conItems(venta, ej) : undefined;
}

export async function listar(filtro: FiltroVentas, ej: Ejecutor = db) {
  const c: SQL[] = [];
  if (filtro.desde) c.push(sql`${ventas.fecha} >= ${inicioDelDia(filtro.desde)}`);
  if (filtro.hasta) c.push(sql`${ventas.fecha} < ${inicioDelDia(filtro.hasta)} + interval '1 day'`);
  if (filtro.estado) c.push(eq(ventas.estado, filtro.estado));
  if (filtro.metodoPago) c.push(eq(ventas.metodoPago, filtro.metodoPago));
  if (filtro.cajaId) c.push(eq(ventas.cajaId, filtro.cajaId));
  if (filtro.vendedorId) c.push(eq(ventas.vendedorId, filtro.vendedorId));
  if (filtro.clienteId) c.push(eq(ventas.clienteId, filtro.clienteId));
  if (filtro.q) {
    const numero = /^\d+$/.test(filtro.q) ? eq(ventas.numero, Number(filtro.q)) : undefined;
    c.push(or(ilike(ventas.clienteNombre, patronContiene(filtro.q)), numero)!);
  }
  const donde = c.length ? and(...c) : undefined;

  const [filas, [conteo]] = await Promise.all([
    ej.select().from(ventas).where(donde).orderBy(desc(ventas.fecha), desc(ventas.id)).limit(filtro.limite).offset(offsetDe(filtro)),
    ej.select({ total: count() }).from(ventas).where(donde),
  ]);
  if (filtro.conItems !== 'true' || filas.length === 0) {
    return { datos: filas.map(aPublica), total: conteo?.total ?? 0 };
  }

  // Los productos de todas las ventas de la página en una sola consulta.
  const items = await ej
    .select()
    .from(ventaItems)
    .where(inArray(ventaItems.ventaId, filas.map((v) => v.id)))
    .orderBy(asc(ventaItems.id));
  const porVenta = new Map<number, Omit<FilaItem, 'ventaId'>[]>();
  for (const { ventaId, ...item } of items) porVenta.set(ventaId, [...(porVenta.get(ventaId) ?? []), item]);

  return { datos: filas.map((v) => ({ ...aPublica(v), items: porVenta.get(v.id) ?? [] })), total: conteo?.total ?? 0 };
}
