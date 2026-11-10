import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { migracionesAplicadas, pingBaseDeDatos } from '../../repositories/salud/salud.repository.js';
import { logger } from '../../utils/logger/logger.js';

export interface EstadoMigraciones {
  /** Nombre de la última migración aplicada en la base (null si no hay ninguna). */
  ultima: string | null;
  /** Migraciones que trae el código y aún no están en la base. Debe ser 0 en producción. */
  pendientes: number;
}

export interface EstadoSalud {
  ok: boolean;
  baseDeDatos: 'ok' | 'error';
  migraciones?: EstadoMigraciones;
}

interface EntradaJournal {
  tag: string;
  when: number;
}

/** Migraciones que trae el código (el journal de Drizzle; el build lo copia a dist/). */
const archivoJournal = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'database', 'migrations', 'meta', '_journal.json');

function migracionesDelCodigo(): EntradaJournal[] {
  return (JSON.parse(readFileSync(archivoJournal, 'utf8')) as { entries: EntradaJournal[] }).entries;
}

async function estadoMigraciones(): Promise<EstadoMigraciones> {
  const aplicadas = new Set(await migracionesAplicadas());
  const delCodigo = migracionesDelCodigo();
  return {
    ultima: delCodigo.filter((m) => aplicadas.has(m.when)).at(-1)?.tag ?? null,
    pendientes: delCodigo.filter((m) => !aplicadas.has(m.when)).length,
  };
}

export async function obtenerEstado(): Promise<EstadoSalud> {
  try {
    await pingBaseDeDatos();
  } catch (err) {
    logger.error({ err }, 'La base de datos no responde');
    return { ok: false, baseDeDatos: 'error' };
  }
  try {
    return { ok: true, baseDeDatos: 'ok', migraciones: await estadoMigraciones() };
  } catch (err) {
    // No poder leer el estado de las migraciones no tumba el chequeo de salud.
    logger.warn({ err }, 'No se pudo leer el estado de las migraciones');
    return { ok: true, baseDeDatos: 'ok' };
  }
}
