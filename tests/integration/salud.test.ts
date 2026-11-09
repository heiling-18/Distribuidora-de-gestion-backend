import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { crearApp } from '../../src/app.js';
import { cerrarDb } from '../../src/database/client.js';

const app = crearApp();

afterAll(async () => {
  await cerrarDb();
});

describe('GET /api/health', () => {
  it('responde 200 con la base de datos conectada', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, baseDeDatos: 'ok' });
  });

  it('incluye cabeceras de seguridad y no expone Express', async () => {
    const res = await request(app).get('/api/health');
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
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
