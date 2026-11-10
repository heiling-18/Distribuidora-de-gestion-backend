import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { crearApp } from '../../src/app.js';
import { env } from '../../src/config/env.js';
import { cerrarDb } from '../../src/database/client.js';

const app = crearApp();

afterAll(async () => {
  await cerrarDb();
});

describe('GET /api/health', () => {
  it('responde 200 con la base de datos conectada', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    // La base de pruebas se migra antes de los tests: ninguna pendiente.
    expect(res.body).toEqual({ ok: true, baseDeDatos: 'ok', migraciones: { ultima: '0000_esquema_inicial', pendientes: 0 } });
  });

  it('incluye cabeceras de seguridad y no expone Express', async () => {
    const res = await request(app).get('/api/health');
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });
});

describe('protección CSRF por Origin', () => {
  it('rechaza un POST desde un origen que no está en CORS_ORIGIN', async () => {
    const res = await request(app).post('/api/auth/login').set('Origin', 'https://sitio-malo.com').send({ email: 'a@b.co', clave: 'x' });
    expect(res.status).toBe(403);
  });

  it('rechaza un POST sin Origin si el navegador dice que viene de otro sitio', async () => {
    const res = await request(app).post('/api/auth/login').set('Sec-Fetch-Site', 'cross-site').send({ email: 'a@b.co', clave: 'x' });
    expect(res.status).toBe(403);
  });

  it('deja pasar el origen permitido y las lecturas de cualquier origen', async () => {
    const permitido = env.corsOrigins[0]!;
    const login = await request(app).post('/api/auth/login').set('Origin', permitido).send({ email: 'nadie@b.co', clave: 'x' });
    expect(login.status).not.toBe(403);
    expect((await request(app).get('/api/health').set('Origin', 'https://sitio-malo.com')).status).toBe(200);
  });
});

describe('errores', () => {
  it('ruta inexistente responde 404 con el formato estándar', async () => {
    const res = await request(app).get('/no-existe');
    expect(res.status).toBe(404);
    expect(res.body.error.codigo).toBe('NO_ENCONTRADO');
  });

  it('cualquier ruta de /api sin sesión responde 401 (denegado por defecto)', async () => {
    const res = await request(app).get('/api/no-existe');
    expect(res.status).toBe(401);
    expect(res.body.error.codigo).toBe('NO_AUTENTICADO');
  });

  it('JSON mal formado responde 400 sin tumbar el servidor', async () => {
    const res = await request(app)
      .post('/api/health')
      .set('Content-Type', 'application/json')
      .send('{"roto":');
    expect(res.status).toBe(400);
    expect(res.body.error.codigo).toBe('SOLICITUD_INVALIDA');
  });
});
