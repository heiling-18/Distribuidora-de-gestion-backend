import { db } from '../../database/client.js';
import type { UsuarioSesion } from '../../interfaces/auth/auth.js';
import { registrarEvento } from '../../repositories/auditoria/auditoria.repository.js';
import * as configRepo from '../../repositories/configuracion/configuracion.repository.js';
import type { ActualizarConfiguracionDto } from '../../validators/configuracion/configuracion.validator.js';

/** Nombre del campo en la API y su clave en la tabla configuracion. */
const CLAVES = { nombreNegocio: 'nombre_negocio', nit: 'nit', telefonoWhatsapp: 'telefono_whatsapp' } as const;

export interface Configuracion {
  nombreNegocio: string;
  nit: string;
  telefonoWhatsapp: string;
}

export async function obtener(): Promise<Configuracion> {
  const c = await configRepo.todas();
  return {
    nombreNegocio: String(c[CLAVES.nombreNegocio] ?? "DYM'S"),
    // El NIT que antes estaba escrito en el ticket, mientras no se configure otro.
    nit: String(c[CLAVES.nit] ?? '901.458.712-4'),
    telefonoWhatsapp: String(c[CLAVES.telefonoWhatsapp] ?? ''),
  };
}

export async function actualizar(admin: UsuarioSesion, cambios: ActualizarConfiguracionDto, ip: string | null): Promise<Configuracion> {
  const antes = await obtener();
  await db.transaction(async (tx) => {
    for (const [campo, valor] of Object.entries(cambios)) {
      await configRepo.guardar(CLAVES[campo as keyof typeof CLAVES], valor, admin.id, tx);
    }
    await registrarEvento({ usuarioId: admin.id, accion: 'configuracion.actualizar', entidad: 'configuracion', antes, despues: cambios, ip }, tx);
  });
  return obtener();
}
