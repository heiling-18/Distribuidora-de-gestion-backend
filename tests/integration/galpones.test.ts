import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { crearApp } from '../../src/app.js';
import { cerrarDb } from '../../src/database/client.js';
import { fechaNegocio, sumarDias } from '../../src/utils/fecha/fecha.js';
import { limpiarBase } from '../helpers/db.js';
import { sesionDe } from '../helpers/usuarios.js';

const app = crearApp();

beforeEach(limpiarBase);
afterAll(async () => {
  await limpiarBase();
  await cerrarDb();
});

const hoy = () => fechaNegocio();

async function galponCreado(cookieAdmin: string, extra: object = {}) {
  const res = await request(app)
    .post('/api/galpones')
    .set('Cookie', cookieAdmin)
    .send({ nombre: 'Galpón 1', avesIniciales: 1000, fechaLlegada: sumarDias(hoy(), -21), edadSemanasLlegada: 16, ...extra });
  return res.body.galpon as { id: number };
}

describe('permisos', () => {
  it('el vendedor no entra; el galponero consulta y registra pero no crea galpones', async () => {
    const admin = await sesionDe(app, 'admin');
    const vendedor = await sesionDe(app, 'vendedor');
    const galponero = await sesionDe(app, 'galponero');
    await galponCreado(admin.cookie);

    expect((await request(app).get('/api/galpones').set('Cookie', vendedor.cookie)).status).toBe(403);
    expect((await request(app).get('/api/galpones').set('Cookie', galponero.cookie)).status).toBe(200);
    expect((await request(app).post('/api/galpones').set('Cookie', galponero.cookie).send({ nombre: 'X', avesIniciales: 1, fechaLlegada: hoy() })).status).toBe(403);
  });
});

describe('galpones', () => {
  it('calcula aves vivas, edad y alimento sugerido', async () => {
    const admin = await sesionDe(app, 'admin');
    const galponero = await sesionDe(app, 'galponero');
    const g = await galponCreado(admin.cookie);
    await request(app).put(`/api/galpones/${g.id}/registros/${hoy()}`).set('Cookie', galponero.cookie).send({ huevos: 850, muertas: 10, alimentoKg: 114 });

    const res = await request(app).get('/api/galpones').set('Cookie', galponero.cookie);
    expect(res.body.galpones[0]).toMatchObject({
      avesVivas: 990,
      muertasTotales: 10,
      edadSemanas: 19, // 16 al llegar + 3 semanas
      alimentoSugeridoKg: 113.9, // 990 aves × 115 g
      alimentoSugeridoBultos: 2.85,
      registradoHoy: true,
    });
  });

  it('un galpón con registros no se borra (se desactiva); uno sin registros sí', async () => {
    const admin = await sesionDe(app, 'admin');
    const conRegistros = await galponCreado(admin.cookie);
    const vacio = await galponCreado(admin.cookie, { nombre: 'Galpón 2' });
    await request(app).put(`/api/galpones/${conRegistros.id}/registros/${hoy()}`).set('Cookie', admin.cookie).send({ huevos: 1 });

    expect((await request(app).delete(`/api/galpones/${conRegistros.id}`).set('Cookie', admin.cookie)).status).toBe(409);
    expect((await request(app).delete(`/api/galpones/${vacio.id}`).set('Cookie', admin.cookie)).status).toBe(204);

    await request(app).patch(`/api/galpones/${conRegistros.id}`).set('Cookie', admin.cookie).send({ activo: false });
    const galponero = await sesionDe(app, 'galponero');
    expect((await request(app).get('/api/galpones').set('Cookie', galponero.cookie)).body.galpones).toHaveLength(0);
  });
});

describe('registro diario', () => {
  it('uno por día: registrar de nuevo corrige el del día', async () => {
    const admin = await sesionDe(app, 'admin');
    const galponero = await sesionDe(app, 'galponero');
    const g = await galponCreado(admin.cookie);

    const a = await request(app).put(`/api/galpones/${g.id}/registros/${hoy()}`).set('Cookie', galponero.cookie).send({ huevos: 800 });
    const b = await request(app).put(`/api/galpones/${g.id}/registros/${hoy()}`).set('Cookie', galponero.cookie).send({ huevos: 820, notas: 'corrección' });
    expect(b.body.registro).toMatchObject({ id: a.body.registro.id, huevos: 820, notas: 'corrección', registradoPorNombre: galponero.usuario.nombre });

    const lista = await request(app).get(`/api/galpones/registros?galponId=${g.id}`).set('Cookie', galponero.cookie);
    expect(lista.body.total).toBe(1);
  });

  it('el galponero solo registra hoy; el admin puede corregir días pasados; nadie días futuros', async () => {
    const admin = await sesionDe(app, 'admin');
    const galponero = await sesionDe(app, 'galponero');
    const g = await galponCreado(admin.cookie);
    const ayer = sumarDias(hoy(), -1);

    expect((await request(app).put(`/api/galpones/${g.id}/registros/${ayer}`).set('Cookie', galponero.cookie).send({ huevos: 1 })).status).toBe(403);
    expect((await request(app).put(`/api/galpones/${g.id}/registros/${ayer}`).set('Cookie', admin.cookie).send({ huevos: 1 })).status).toBe(200);
    expect((await request(app).put(`/api/galpones/${g.id}/registros/${sumarDias(hoy(), 1)}`).set('Cookie', admin.cookie).send({ huevos: 1 })).status).toBe(400);
    expect((await request(app).put(`/api/galpones/${g.id}/registros/${sumarDias(hoy(), -60)}`).set('Cookie', admin.cookie).send({ huevos: 1 })).status).toBe(400);
  });

  it('no se pueden registrar más muertas que aves vivas', async () => {
    const admin = await sesionDe(app, 'admin');
    const g = await galponCreado(admin.cookie, { avesIniciales: 10 });
    await request(app).put(`/api/galpones/${g.id}/registros/${sumarDias(hoy(), -1)}`).set('Cookie', admin.cookie).send({ muertas: 8 });

    const res = await request(app).put(`/api/galpones/${g.id}/registros/${hoy()}`).set('Cookie', admin.cookie).send({ muertas: 3 });
    expect(res.status).toBe(409);
    expect(res.body.error.mensaje).toContain('2 aves vivas');
  });

  it('lista con totales y cartones; el admin borra registros', async () => {
    const admin = await sesionDe(app, 'admin');
    const g = await galponCreado(admin.cookie);
    await request(app).put(`/api/galpones/${g.id}/registros/${sumarDias(hoy(), -1)}`).set('Cookie', admin.cookie).send({ huevos: 400, alimentoKg: 100 });
    const r = await request(app).put(`/api/galpones/${g.id}/registros/${hoy()}`).set('Cookie', admin.cookie).send({ huevos: 395, alimentoKg: 101.5 });

    const lista = await request(app).get('/api/galpones/registros').set('Cookie', admin.cookie);
    expect(lista.body.totales).toEqual({ huevos: 795, muertas: 0, alimentoKg: 201.5, cartones: 26 });
    expect(lista.body.datos[0]).toMatchObject({ fecha: hoy(), galpon: 'Galpón 1' });

    expect((await request(app).delete(`/api/galpones/registros/${r.body.registro.id}`).set('Cookie', admin.cookie)).status).toBe(204);
    expect((await request(app).get('/api/galpones/registros').set('Cookie', admin.cookie)).body.total).toBe(1);
  });
});
