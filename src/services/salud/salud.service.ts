import { pingBaseDeDatos } from '../../repositories/salud/salud.repository.js';
import { logger } from '../../utils/logger/logger.js';

export interface EstadoSalud {
  ok: boolean;
  baseDeDatos: 'ok' | 'error';
}

export async function obtenerEstado(): Promise<EstadoSalud> {
  try {
    await pingBaseDeDatos();
    return { ok: true, baseDeDatos: 'ok' };
  } catch (err) {
    logger.error({ err }, 'La base de datos no responde');
    return { ok: false, baseDeDatos: 'error' };
  }
}
