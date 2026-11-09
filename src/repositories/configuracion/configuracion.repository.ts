import { db, type Db, type Tx } from '../../database/client.js';
import { configuracion } from '../../models/index.js';

export async function todas(ej: Db | Tx = db): Promise<Record<string, unknown>> {
  const filas = await ej.select({ clave: configuracion.clave, valor: configuracion.valor }).from(configuracion);
  return Object.fromEntries(filas.map((f) => [f.clave, f.valor]));
}

export async function guardar(clave: string, valor: unknown, usuarioId: number, tx: Tx): Promise<void> {
  await tx
    .insert(configuracion)
    .values({ clave, valor, actualizadoPor: usuarioId })
    .onConflictDoUpdate({ target: configuracion.clave, set: { valor, actualizadoPor: usuarioId, actualizadoEn: new Date() } });
}
