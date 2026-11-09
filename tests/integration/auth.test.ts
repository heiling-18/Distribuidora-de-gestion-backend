import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { crearApp } from '../../src/app.js';
import { cerrarDb, db } from '../../src/database/client.js';
import { auditoria, usuarios } from '../../src/models/index.js';
import { limpiarBase } from '../helpers/db.js';
import { CLAVE, crearUsuario, iniciarSesion } from '../helpers/usuarios.js';

const app = crearApp();

beforeEach(limpiarBase);
afterAll(async () => {
  await limpiarBase();
  await cerrarDb();
});

describe('POST /api/auth/login', () => {
  it('con clave correcta devuelve el usuario y una cookie httpOnly', async () => {
    const u = await crearUsuario('vendedor');
    const res = await request(app).post('/api/auth/login').send({ email: u.email.toUpperCase(), clave: CLAVE });

    expect(res.status).toBe(200);
    expect(res.body.usuario).toEqual({ id: u.id, email: u.email, nombre: u.nombre, rol: 'vendedor' });
    expect(JSON.stringify(res.body)).not.toContain('passwordHash');
    const cookie = String(res.headers['set-cookie']);
    expect(cookie).toContain('dyms_sesion=');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
  });

  it('clave incorrecta y correo inexistente dan el mismo error', async () => {
    const u = await crearUsuario('vendedor');
    const malaClave = await request(app).post('/api/auth/login').send({ email: u.email, clave: 'otra-clave' });
    const noExiste = await request(app).post('/api/auth/login').send({ email: 'nadie@test.local', clave: 'otra-clave' });

    expect(malaClave.status).toBe(401);
    expect(noExiste.status).toBe(401);
    expect(malaClave.body).toEqual(noExiste.body);
  });

  it('registra el intento fallido en auditoría', async () => {
    const u = await crearUsuario('vendedor');
    await request(app).post('/api/auth/login').send({ email: u.email, clave: 'otra-clave' });
    const eventos = await db.select().from(auditoria).where(eq(auditoria.accion, 'auth.login_fallido'));
    expect(eventos).toHaveLength(1);
  });

  it('una cuenta desactivada no puede entrar', async () => {
    const u = await crearUsuario('vendedor', { activo: false });
    const res = await request(app).post('/api/auth/login').send({ email: u.email, clave: CLAVE });
    expect(res.status).toBe(403);
    expect(res.body.error.codigo).toBe('CUENTA_DESACTIVADA');
  });

  it('acepta claves bcrypt importadas de Supabase y las pasa a argon2', async () => {
    const u = await crearUsuario('vendedor', { bcrypt: true });
    expect(u.passwordHash!.startsWith('$2')).toBe(true);

    const res = await request(app).post('/api/auth/login').send({ email: u.email, clave: CLAVE });
    expect(res.status).toBe(200);

    const [despues] = await db.select().from(usuarios).where(eq(usuarios.id, u.id));
    expect(despues!.passwordHash!.startsWith('$argon2')).toBe(true);
    expect(despues!.ultimoLogin).not.toBeNull();
  });

  it('valida el cuerpo de la petición', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'no-es-correo' });
    expect(res.status).toBe(400);
    expect(res.body.error.codigo).toBe('VALIDACION');
  });
});

describe('sesión', () => {
  it('GET /api/auth/me sin sesión responde 401 y con sesión devuelve el usuario', async () => {
    const u = await crearUsuario('galponero');
    expect((await request(app).get('/api/auth/me')).status).toBe(401);

    const cookie = await iniciarSesion(app, u.email);
    const res = await request(app).get('/api/auth/me').set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.usuario.rol).toBe('galponero');
  });

  it('también acepta el token como Authorization: Bearer', async () => {
    const u = await crearUsuario('vendedor');
    const token = (await iniciarSesion(app, u.email)).split('=')[1];
    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  it('rechaza un token alterado', async () => {
    const u = await crearUsuario('vendedor');
    const cookie = await iniciarSesion(app, u.email);
    const res = await request(app).get('/api/auth/me').set('Cookie', `${cookie}x`);
    expect(res.status).toBe(401);
  });

  it('logout borra la cookie', async () => {
    const res = await request(app).post('/api/auth/logout');
    expect(res.status).toBe(204);
    expect(String(res.headers['set-cookie'])).toMatch(/dyms_sesion=;.*Expires=Thu, 01 Jan 1970/);
  });

  it('cambiar la clave cierra las otras sesiones y mantiene la actual', async () => {
    const u = await crearUsuario('vendedor');
    const otraSesion = await iniciarSesion(app, u.email);
    const estaSesion = await iniciarSesion(app, u.email);

    const res = await request(app)
      .post('/api/auth/cambiar-clave')
      .set('Cookie', estaSesion)
      .send({ claveActual: CLAVE, claveNueva: 'una-clave-nueva-456' });
    expect(res.status).toBe(204);
    const nuevaCookie = String(res.headers['set-cookie']).split(';')[0]!;

    expect((await request(app).get('/api/auth/me').set('Cookie', otraSesion)).status).toBe(401);
    expect((await request(app).get('/api/auth/me').set('Cookie', nuevaCookie)).status).toBe(200);
    expect((await request(app).post('/api/auth/login').send({ email: u.email, clave: 'una-clave-nueva-456' })).status).toBe(200);
  });

  it('cambiar la clave exige la clave actual correcta', async () => {
    const u = await crearUsuario('vendedor');
    const cookie = await iniciarSesion(app, u.email);
    const res = await request(app)
      .post('/api/auth/cambiar-clave')
      .set('Cookie', cookie)
      .send({ claveActual: 'equivocada', claveNueva: 'una-clave-nueva-456' });
    expect(res.status).toBe(400);
    expect(res.body.error.codigo).toBe('CLAVE_ACTUAL_INCORRECTA');
  });
});
