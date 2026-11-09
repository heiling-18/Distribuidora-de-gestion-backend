import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { crearApp } from '../../src/app.js';
import { cerrarDb } from '../../src/database/client.js';
import { limpiarBase } from '../helpers/db.js';
import { sesionDe } from '../helpers/usuarios.js';

const app = crearApp();

beforeEach(limpiarBase);
afterAll(async () => {
  await limpiarBase();
  await cerrarDb();
});

describe('clientes', () => {
  it('el vendedor crea, busca y edita clientes', async () => {
    const { cookie } = await sesionDe(app, 'vendedor');
    const creado = await request(app)
      .post('/api/clientes')
      .set('Cookie', cookie)
      .send({ nombre: 'Granja La Esperanza', documento: '900123456', telefono: '3001234567', direccion: '' });

    expect(creado.status).toBe(201);
    expect(creado.body.cliente).toMatchObject({ nombre: 'Granja La Esperanza', direccion: null, activo: true });

    expect((await request(app).get('/api/clientes?q=esperanza').set('Cookie', cookie)).body.total).toBe(1);
    expect((await request(app).get('/api/clientes?q=900123').set('Cookie', cookie)).body.total).toBe(1);
    expect((await request(app).get('/api/clientes?q=300123').set('Cookie', cookie)).body.total).toBe(1);

    const editado = await request(app).patch(`/api/clientes/${creado.body.cliente.id}`).set('Cookie', cookie).send({ telefono: '3109999999' });
    expect(editado.body.cliente.telefono).toBe('3109999999');
  });

  it('documento repetido responde 409', async () => {
    const { cookie } = await sesionDe(app, 'vendedor');
    await request(app).post('/api/clientes').set('Cookie', cookie).send({ nombre: 'Ana', documento: '123' });
    const res = await request(app).post('/api/clientes').set('Cookie', cookie).send({ nombre: 'Otra', documento: '123' });
    expect(res.status).toBe(409);
    expect(res.body.error.mensaje).toBe('Ya existe un cliente con ese documento');
  });

  it('varios clientes sin documento sí se permiten', async () => {
    const { cookie } = await sesionDe(app, 'vendedor');
    expect((await request(app).post('/api/clientes').set('Cookie', cookie).send({ nombre: 'Sin doc 1' })).status).toBe(201);
    expect((await request(app).post('/api/clientes').set('Cookie', cookie).send({ nombre: 'Sin doc 2', documento: '' })).status).toBe(201);
  });

  it('solo el admin desactiva; el vendedor ya no lo ve', async () => {
    const admin = await sesionDe(app, 'admin');
    const vendedor = await sesionDe(app, 'vendedor');
    const { body } = await request(app).post('/api/clientes').set('Cookie', vendedor.cookie).send({ nombre: 'Pedro' });
    const id = body.cliente.id;

    expect((await request(app).delete(`/api/clientes/${id}`).set('Cookie', vendedor.cookie)).status).toBe(403);
    expect((await request(app).patch(`/api/clientes/${id}`).set('Cookie', vendedor.cookie).send({ activo: false })).status).toBe(403);
    expect((await request(app).delete(`/api/clientes/${id}`).set('Cookie', admin.cookie)).status).toBe(200);

    expect((await request(app).get('/api/clientes').set('Cookie', vendedor.cookie)).body.total).toBe(0);
    expect((await request(app).get(`/api/clientes/${id}`).set('Cookie', vendedor.cookie)).status).toBe(404);
    expect((await request(app).get('/api/clientes?activo=todos').set('Cookie', admin.cookie)).body.total).toBe(1);
  });

  it('el galponero no tiene acceso', async () => {
    const { cookie } = await sesionDe(app, 'galponero');
    expect((await request(app).get('/api/clientes').set('Cookie', cookie)).status).toBe(403);
  });
});
