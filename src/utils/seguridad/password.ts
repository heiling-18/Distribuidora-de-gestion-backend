import { hash, verify } from '@node-rs/argon2';
import bcrypt from 'bcryptjs';

export const LARGO_MINIMO_CLAVE = 8;

export function hashearClave(clave: string): Promise<string> {
  return hash(clave);
}

export interface ResultadoVerificacion {
  valida: boolean;
  /** true si la clave estaba en bcrypt (importada de Supabase) y hay que guardarla de nuevo con argon2. */
  requiereRehash: boolean;
}

export async function verificarClave(hashGuardado: string, clave: string): Promise<ResultadoVerificacion> {
  if (hashGuardado.startsWith('$2')) {
    const valida = await bcrypt.compare(clave, hashGuardado);
    return { valida, requiereRehash: valida };
  }
  try {
    return { valida: await verify(hashGuardado, clave), requiereRehash: false };
  } catch {
    return { valida: false, requiereRehash: false };
  }
}

let hashFalso: Promise<string> | undefined;

/**
 * Gasta el mismo tiempo que una verificación real cuando el email no existe,
 * para que no se pueda adivinar qué correos están registrados midiendo el tiempo de respuesta.
 */
export async function verificarClaveFalsa(clave: string): Promise<void> {
  hashFalso ??= hash('clave-inexistente-para-igualar-tiempos');
  await verificarClave(await hashFalso, clave);
}
