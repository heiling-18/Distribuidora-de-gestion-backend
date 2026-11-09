import { db } from '../../database/client.js';
import type { Rol, UsuarioPublico, UsuarioSesion } from '../../interfaces/auth/auth.js';
import { registrarEvento } from '../../repositories/auditoria/auditoria.repository.js';
import * as usuariosRepo from '../../repositories/usuarios/usuarios.repository.js';
import { AppError } from '../../utils/errores/AppError.js';
import { hashearClave } from '../../utils/seguridad/password.js';

export function listarUsuarios(): Promise<UsuarioPublico[]> {
  return usuariosRepo.listar();
}

export async function obtenerUsuario(id: number): Promise<UsuarioPublico> {
  const usuario = await usuariosRepo.buscarPublicoPorId(id);
  if (!usuario) throw AppError.noEncontrado('Usuario no encontrado');
  return usuario;
}

export async function crearUsuario(
  admin: UsuarioSesion,
  datos: { email: string; nombre: string; rol: Rol; clave: string },
  ip: string | null,
): Promise<UsuarioPublico> {
  const passwordHash = await hashearClave(datos.clave);
  return db.transaction(async (tx) => {
    const creado = await usuariosRepo.crear(
      { email: datos.email.trim().toLowerCase(), nombre: datos.nombre.trim(), rol: datos.rol, passwordHash },
      tx,
    );
    await registrarEvento(
      { usuarioId: admin.id, accion: 'usuario.crear', entidad: 'usuario', entidadId: creado.id, despues: creado, ip },
      tx,
    );
    return creado;
  });
}

export async function actualizarUsuario(
  admin: UsuarioSesion,
  id: number,
  cambios: { nombre?: string; rol?: Rol; activo?: boolean },
  ip: string | null,
): Promise<UsuarioPublico> {
  if (id === admin.id && (cambios.activo === false || (cambios.rol && cambios.rol !== 'admin'))) {
    throw AppError.conflicto('No puedes desactivarte ni quitarte el rol de administrador a ti mismo');
  }

  return db.transaction(async (tx) => {
    const antes = await usuariosRepo.buscarPublicoPorId(id, tx);
    if (!antes) throw AppError.noEncontrado('Usuario no encontrado');

    const pierdeAdmin = antes.rol === 'admin' && antes.activo && (cambios.activo === false || (cambios.rol && cambios.rol !== 'admin'));
    if (pierdeAdmin && (await usuariosRepo.contarAdminsActivosBloqueando(tx)) <= 1) {
      throw AppError.conflicto('Debe quedar al menos un administrador activo');
    }

    // Un cambio de rol o de estado cierra las sesiones abiertas del usuario.
    const invalidarSesiones =
      (cambios.rol !== undefined && cambios.rol !== antes.rol) ||
      (cambios.activo !== undefined && cambios.activo !== antes.activo);

    const despues = await usuariosRepo.actualizar(
      id,
      { ...cambios, ...(cambios.nombre ? { nombre: cambios.nombre.trim() } : {}) },
      { invalidarSesiones },
      tx,
    );
    await registrarEvento(
      { usuarioId: admin.id, accion: 'usuario.actualizar', entidad: 'usuario', entidadId: id, antes, despues, ip },
      tx,
    );
    return despues!;
  });
}

/** El admin asigna una clave nueva a otro usuario (por ejemplo, si la olvidó). Cierra sus sesiones. */
export async function restablecerClave(admin: UsuarioSesion, id: number, clave: string, ip: string | null): Promise<void> {
  const passwordHash = await hashearClave(clave);
  await db.transaction(async (tx) => {
    const version = await usuariosRepo.cambiarClave(id, passwordHash, tx);
    if (version === undefined) throw AppError.noEncontrado('Usuario no encontrado');
    await registrarEvento(
      { usuarioId: admin.id, accion: 'usuario.restablecer_clave', entidad: 'usuario', entidadId: id, ip },
      tx,
    );
  });
}
