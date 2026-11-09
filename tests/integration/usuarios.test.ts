import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { crearApp } from '../../src/app.js';
import { cerrarDb } from '../../src/database/client.js';
import { limpiarBase } from '../helpers/db.js';
import { and, eq } from 'drizzle-orm';
import { db } from '../../src/database/client.js';
import { usuarios } from '../../src/models/index.js';
import { CLAVE, crearUsuario, iniciarSesion, sesionDe } from '../helpers/usuarios.js';

const app = crearApp();

beforeEach(limpiarBase);
afterAll(async () => {
  await limpiarBase();
  await cerrarDb();
});

async function sesionAdmin() {
  const admin = await crearUsuario('admin');
  return { admin, cookie: await iniciarSesion(app, admin.email) };
}

describe('permisos de /api/usuarios', () => {
  it('sin sesión responde 401', async () => {
    expect((await request(app).get('/api/usuarios')).status).toBe(401);
  });

  it.each(['vendedor', 'galponero'] as const)('%s recibe 403', async (rol) => {
    const u = await crearUsuario(rol);
    const cookie = await iniciarSesion(app, u.email);
    const res = await request(app).get('/api/usuarios').set('Cookie', cookie);
    expect(res.status).toBe(403);
    expect(res.body.error.codigo).toBe('PROHIBIDO');
  });

  it('admin puede listar, y la lista no expone claves', async () => {
    const { cookie } = await sesionAdmin();
    await crearUsuario('vendedor');
    const res = await request(app).get('/api/usuarios').set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.usuarios).toHaveLength(2);
    expect(JSON.stringify(res.body)).not.toMatch(/password|argon2|versionSesion/i);
  });
});

describe('gestión de usuarios (admin)', () => {
  it('crea un usuario que luego puede iniciar sesión', async () => {
    const { cookie } = await sesionAdmin();
    const res = await request(app)
      .post('/api/usuarios')
      .set('Cookie', cookie)
      .send({ email: 'Nuevo@Test.Local', nombre: 'Nuevo', rol: 'vendedor', clave: 'clave-segura-1' });

    expect(res.status).toBe(201);
    expect(res.body.usuario.email).toBe('nuevo@test.local');
    expect((await request(app).post('/api/auth/login').send({ email: 'nuevo@test.local', clave: 'clave-segura-1' })).status).toBe(200);
  });

  it('no permite correos repetidos', async () => {
    const { cookie } = await sesionAdmin();
    const otro = await crearUsuario('vendedor');
    const res = await request(app)
      .post('/api/usuarios')
      .set('Cookie', cookie)
      .send({ email: otro.email, nombre: 'Copia', rol: 'vendedor', clave: 'clave-segura-1' });
    expect(res.status).toBe(409);
    expect(res.body.error.mensaje).toBe('Ya existe un usuario con ese correo');
  });

  it('rechaza claves cortas', async () => {
    const { cookie } = await sesionAdmin();
    const res = await request(app)
      .post('/api/usuarios')
      .set('Cookie', cookie)
      .send({ email: 'a@test.local', nombre: 'Ana', rol: 'vendedor', clave: '123' });
    expect(res.status).toBe(400);
  });

  it('desactivar a un usuario cierra su sesión al instante', async () => {
    const { cookie } = await sesionAdmin();
    const vendedor = await crearUsuario('vendedor');
    const cookieVendedor = await iniciarSesion(app, vendedor.email);

    const res = await request(app).patch(`/api/usuarios/${vendedor.id}`).set('Cookie', cookie).send({ activo: false });
    expect(res.status).toBe(200);
    expect(res.body.usuario.activo).toBe(false);
    expect((await request(app).get('/api/auth/me').set('Cookie', cookieVendedor)).status).toBe(401);
  });

  it('cambiar el rol cierra la sesión (el permiso viejo no sigue vivo en el token)', async () => {
    const { cookie } = await sesionAdmin();
    const vendedor = await crearUsuario('vendedor');
    const cookieVendedor = await iniciarSesion(app, vendedor.email);

    await request(app).patch(`/api/usuarios/${vendedor.id}`).set('Cookie', cookie).send({ rol: 'galponero' });
    expect((await request(app).get('/api/auth/me').set('Cookie', cookieVendedor)).status).toBe(401);
  });

  it('el admin no puede desactivarse ni quitarse el rol a sí mismo', async () => {
    const { admin, cookie } = await sesionAdmin();
    const desactivar = await request(app).patch(`/api/usuarios/${admin.id}`).set('Cookie', cookie).send({ activo: false });
    const quitarRol = await request(app).patch(`/api/usuarios/${admin.id}`).set('Cookie', cookie).send({ rol: 'vendedor' });
    expect(desactivar.status).toBe(409);
    expect(quitarRol.status).toBe(409);
  });

  it('restablecer la clave de otro usuario cierra sus sesiones', async () => {
    const { cookie } = await sesionAdmin();
    const vendedor = await crearUsuario('vendedor');
    const cookieVendedor = await iniciarSesion(app, vendedor.email);

    const res = await request(app)
      .post(`/api/usuarios/${vendedor.id}/restablecer-clave`)
      .set('Cookie', cookie)
      .send({ clave: 'clave-temporal-9' });
    expect(res.status).toBe(204);
    expect((await request(app).get('/api/auth/me').set('Cookie', cookieVendedor)).status).toBe(401);
    expect((await request(app).post('/api/auth/login').send({ email: vendedor.email, clave: CLAVE })).status).toBe(401);
    expect((await request(app).post('/api/auth/login').send({ email: vendedor.email, clave: 'clave-temporal-9' })).status).toBe(200);
  });

  it('usuario inexistente responde 404', async () => {
    const { cookie } = await sesionAdmin();
    expect((await request(app).get('/api/usuarios/99999').set('Cookie', cookie)).status).toBe(404);
  });
});

describe('revisión: siempre queda un administrador', () => {
  it('dos admins que se desactivan mutuamente a la vez: uno queda activo', async () => {
    const a = await sesionDe(app, 'admin');
    const b = await sesionDe(app, 'admin');
    const respuestas = await Promise.all([
      request(app).patch(`/api/usuarios/${b.usuario.id}`).set('Cookie', a.cookie).send({ activo: false }),
      request(app).patch(`/api/usuarios/${a.usuario.id}`).set('Cookie', b.cookie).send({ activo: false }),
    ]);
    // Uno de los dos cambios se rechaza (409, o 401 si su sesión ya quedó cerrada por el otro).
    expect(respuestas.filter((r) => r.status === 200)).toHaveLength(1);
    expect(await db.$count(usuarios, and(eq(usuarios.rol, 'admin'), eq(usuarios.activo, true)))).toBe(1);
  });
});
