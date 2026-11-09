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

describe('configuración del negocio', () => {
  it('todos la leen; solo el admin la cambia', async () => {
    const admin = await sesionDe(app, 'admin');
    const vendedor = await sesionDe(app, 'vendedor');

    expect((await request(app).get('/api/configuracion').set('Cookie', vendedor.cookie)).body.configuracion).toEqual({
      nombreNegocio: "DYM'S",
      nit: '901.458.712-4',
      telefonoWhatsapp: '',
    });
    expect((await request(app).patch('/api/configuracion').set('Cookie', vendedor.cookie).send({ telefonoWhatsapp: '3001112233' })).status).toBe(403);

    const res = await request(app).patch('/api/configuracion').set('Cookie', admin.cookie).send({ telefonoWhatsapp: '3001112233' });
    expect(res.body.configuracion.telefonoWhatsapp).toBe('3001112233');
    expect((await request(app).get('/api/configuracion').set('Cookie', vendedor.cookie)).body.configuracion.telefonoWhatsapp).toBe('3001112233');
  });

  it('el teléfono solo admite números', async () => {
    const { cookie } = await sesionDe(app, 'admin');
    expect((await request(app).patch('/api/configuracion').set('Cookie', cookie).send({ telefonoWhatsapp: '+57 300' })).status).toBe(400);
  });
});
