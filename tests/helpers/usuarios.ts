import bcrypt from 'bcryptjs';
import type { Express } from 'express';
import request from 'supertest';
import { db } from '../../src/database/client.js';
import type { Rol } from '../../src/interfaces/auth/auth.js';
import { usuarios } from '../../src/models/index.js';
import { hashearClave } from '../../src/utils/seguridad/password.js';

export const CLAVE = 'clave-de-prueba-123';

export async function crearUsuario(
  rol: Rol,
  opciones: { email?: string; activo?: boolean; bcrypt?: boolean } = {},
) {
  const passwordHash = opciones.bcrypt ? await bcrypt.hash(CLAVE, 10) : await hashearClave(CLAVE);
  const [u] = await db
    .insert(usuarios)
    .values({
      email: opciones.email ?? `${rol}-${Math.random().toString(36).slice(2, 8)}@test.local`,
      nombre: `Usuario ${rol}`,
      rol,
      passwordHash,
      activo: opciones.activo ?? true,
    })
    .returning();
  return u!;
}

/** Inicia sesión y devuelve la cookie para usarla en las siguientes peticiones. */
export async function iniciarSesion(app: Express, email: string, clave = CLAVE): Promise<string> {
  const res = await request(app).post('/api/auth/login').send({ email, clave });
  if (res.status !== 200) throw new Error(`Login falló (${res.status}): ${JSON.stringify(res.body)}`);
  const cookie = ([] as string[]).concat(res.headers['set-cookie'] ?? [])[0];
  return cookie!.split(';')[0]!;
}

/** Crea un usuario del rol indicado y devuelve el usuario y su cookie de sesión. */
export async function sesionDe(app: Express, rol: Rol) {
  const usuario = await crearUsuario(rol);
  return { usuario, cookie: await iniciarSesion(app, usuario.email) };
}
