import type { UsuarioSesion } from '../../interfaces/auth/auth.js';
import { registrarEvento } from '../../repositories/auditoria/auditoria.repository.js';
import * as usuariosRepo from '../../repositories/usuarios/usuarios.repository.js';
import { AppError } from '../../utils/errores/AppError.js';
import { firmarToken, verificarToken } from '../../utils/seguridad/jwt.js';
import { hashearClave, verificarClave, verificarClaveFalsa } from '../../utils/seguridad/password.js';

const CREDENCIALES_INVALIDAS = new AppError(401, 'CREDENCIALES_INVALIDAS', 'Correo o clave incorrectos');

function aSesion(u: usuariosRepo.FilaUsuario): UsuarioSesion {
  return { id: u.id, email: u.email, nombre: u.nombre, rol: u.rol };
}

function emitirToken(u: Pick<usuariosRepo.FilaUsuario, 'id' | 'rol' | 'versionSesion'>): string {
  return firmarToken({ sub: String(u.id), rol: u.rol, v: u.versionSesion });
}

export async function iniciarSesion(
  email: string,
  clave: string,
  ip: string | null,
): Promise<{ usuario: UsuarioSesion; token: string }> {
  const usuario = await usuariosRepo.buscarPorEmail(email);

  if (!usuario?.passwordHash) {
    await verificarClaveFalsa(clave);
    throw CREDENCIALES_INVALIDAS;
  }

  const { valida, requiereRehash } = await verificarClave(usuario.passwordHash, clave);
  if (!valida) {
    await registrarEvento({ usuarioId: usuario.id, accion: 'auth.login_fallido', entidad: 'usuario', entidadId: usuario.id, ip });
    throw CREDENCIALES_INVALIDAS;
  }
  // Solo se revela que la cuenta está desactivada a quien conoce la clave correcta.
  if (!usuario.activo) {
    throw new AppError(403, 'CUENTA_DESACTIVADA', 'Tu cuenta está desactivada. Contacta al administrador.');
  }

  await usuariosRepo.registrarLogin(usuario.id, requiereRehash ? await hashearClave(clave) : undefined);
  await registrarEvento({ usuarioId: usuario.id, accion: 'auth.login', entidad: 'usuario', entidadId: usuario.id, ip });

  return { usuario: aSesion(usuario), token: emitirToken(usuario) };
}

/**
 * Valida el token y confirma contra la base que el usuario sigue activo y que su sesión
 * no fue invalidada (cambio de clave, desactivación o cambio de rol).
 */
export async function sesionDesdeToken(token: string): Promise<UsuarioSesion | null> {
  const payload = verificarToken(token);
  if (!payload) return null;

  const id = Number(payload.sub);
  if (!Number.isSafeInteger(id)) return null;

  const usuario = await usuariosRepo.buscarPorId(id);
  if (!usuario || !usuario.activo || usuario.versionSesion !== payload.v) return null;

  return aSesion(usuario);
}

/** Cambia la clave del propio usuario. Cierra sus otras sesiones y devuelve un token nuevo para esta. */
export async function cambiarMiClave(
  usuarioId: number,
  claveActual: string,
  claveNueva: string,
  ip: string | null,
): Promise<string> {
  const usuario = await usuariosRepo.buscarPorId(usuarioId);
  if (!usuario?.passwordHash) throw AppError.noAutenticado();

  const { valida } = await verificarClave(usuario.passwordHash, claveActual);
  if (!valida) throw new AppError(400, 'CLAVE_ACTUAL_INCORRECTA', 'La clave actual no es correcta');
  if (claveActual === claveNueva) throw AppError.solicitudInvalida('La clave nueva debe ser distinta a la actual');

  const version = await usuariosRepo.cambiarClave(usuarioId, await hashearClave(claveNueva));
  await registrarEvento({ usuarioId, accion: 'auth.cambiar_clave', entidad: 'usuario', entidadId: usuarioId, ip });

  return emitirToken({ id: usuario.id, rol: usuario.rol, versionSesion: version! });
}
