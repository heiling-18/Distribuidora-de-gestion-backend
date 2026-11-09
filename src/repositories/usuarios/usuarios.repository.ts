import { asc, eq, sql } from 'drizzle-orm';
import { db, type Db, type Tx } from '../../database/client.js';
import type { UsuarioPublico } from '../../interfaces/auth/auth.js';
import { usuarios } from '../../models/index.js';

type Ejecutor = Db | Tx;
export type FilaUsuario = typeof usuarios.$inferSelect;

/** Columnas que se pueden devolver al cliente (sin password_hash ni version_sesion). */
const columnasPublicas = {
  id: usuarios.id,
  email: usuarios.email,
  nombre: usuarios.nombre,
  rol: usuarios.rol,
  activo: usuarios.activo,
  ultimoLogin: usuarios.ultimoLogin,
  creadoEn: usuarios.creadoEn,
};

export async function buscarPorEmail(email: string, ej: Ejecutor = db): Promise<FilaUsuario | undefined> {
  const [fila] = await ej
    .select()
    .from(usuarios)
    .where(sql`lower(${usuarios.email}) = lower(${email})`)
    .limit(1);
  return fila;
}

export async function buscarPorId(id: number, ej: Ejecutor = db): Promise<FilaUsuario | undefined> {
  const [fila] = await ej.select().from(usuarios).where(eq(usuarios.id, id)).limit(1);
  return fila;
}

export async function buscarPublicoPorId(id: number, ej: Ejecutor = db): Promise<UsuarioPublico | undefined> {
  const [fila] = await ej.select(columnasPublicas).from(usuarios).where(eq(usuarios.id, id)).limit(1);
  return fila;
}

export function listar(ej: Ejecutor = db): Promise<UsuarioPublico[]> {
  return ej.select(columnasPublicas).from(usuarios).orderBy(asc(usuarios.nombre));
}

export async function crear(
  datos: { email: string; nombre: string; rol: FilaUsuario['rol']; passwordHash: string },
  ej: Ejecutor = db,
): Promise<UsuarioPublico> {
  const [fila] = await ej.insert(usuarios).values(datos).returning(columnasPublicas);
  return fila!;
}

export async function actualizar(
  id: number,
  cambios: Partial<Pick<FilaUsuario, 'nombre' | 'rol' | 'activo'>>,
  opciones: { invalidarSesiones: boolean },
  ej: Ejecutor = db,
): Promise<UsuarioPublico | undefined> {
  const [fila] = await ej
    .update(usuarios)
    .set({
      ...cambios,
      ...(opciones.invalidarSesiones ? { versionSesion: sql`${usuarios.versionSesion} + 1` } : {}),
    })
    .where(eq(usuarios.id, id))
    .returning(columnasPublicas);
  return fila;
}

/** Cambia la clave e invalida todas las sesiones abiertas del usuario. Devuelve la nueva versión de sesión. */
export async function cambiarClave(id: number, passwordHash: string, ej: Ejecutor = db): Promise<number | undefined> {
  const [fila] = await ej
    .update(usuarios)
    .set({ passwordHash, versionSesion: sql`${usuarios.versionSesion} + 1` })
    .where(eq(usuarios.id, id))
    .returning({ versionSesion: usuarios.versionSesion });
  return fila?.versionSesion;
}

export async function registrarLogin(id: number, nuevoHash?: string, ej: Ejecutor = db): Promise<void> {
  await ej
    .update(usuarios)
    .set({ ultimoLogin: new Date(), ...(nuevoHash ? { passwordHash: nuevoHash } : {}) })
    .where(eq(usuarios.id, id));
}

/**
 * Cuenta los administradores activos bloqueando sus filas: si dos admins se quitan el rol al mismo
 * tiempo, el segundo espera al primero y ve el conteo ya actualizado.
 */
export async function contarAdminsActivosBloqueando(tx: Tx): Promise<number> {
  const filas = await tx
    .select({ id: usuarios.id })
    .from(usuarios)
    .where(sql`${usuarios.rol} = 'admin' and ${usuarios.activo}`)
    .for('update');
  return filas.length;
}
