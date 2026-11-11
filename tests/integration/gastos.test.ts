import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { crearApp } from '../../src/app.js';
import { cerrarDb, db } from '../../src/database/client.js';
import { cierresMensuales } from '../../src/models/index.js';
import { fechaNegocio, mesNegocio } from '../../src/utils/fecha/fecha.js';
import { limpiarBase } from '../helpers/db.js';
import { sesionDe } from '../helpers/usuarios.js';

const app = crearApp();

beforeEach(limpiarBase);
afterAll(async () => {
  await limpiarBase();
  await cerrarDb();
});

const gasto = { categoria: 'servicios', descripcion: 'Recibo de luz', monto: 85000 };

async function cerrarMesActual() {
  await db.insert(cierresMensuales).values({
    mes: mesNegocio(),
    totalVentas: 0, ventasEfectivo: 0, ventasTransferencia: 0, gananciaBruta: 0, totalGastos: 0, utilidadNeta: 0,
    numVentas: 0, numAnuladas: 0, unidadesVendidas: 0, cerradoPorNombre: 'Test',
  });
}

describe('permisos', () => {
  it('solo el admin gestiona gastos', async () => {
    const vendedor = await sesionDe(app, 'vendedor');
    expect((await request(app).get('/api/gastos').set('Cookie', vendedor.cookie)).status).toBe(403);
    expect((await request(app).post('/api/gastos').set('Cookie', vendedor.cookie).send(gasto)).status).toBe(403);
  });
});

describe('gastos y caja', () => {
  it('un gasto en efectivo de hoy se descuenta de la caja abierta', async () => {
    const admin = await sesionDe(app, 'admin');
    await request(app).post('/api/caja/abrir').set('Cookie', admin.cookie).send({ montoInicial: 200000 });

    const res = await request(app).post('/api/gastos').set('Cookie', admin.cookie).send(gasto);
    expect(res.status).toBe(201);
    expect(res.body.gasto).toMatchObject({ fecha: fechaNegocio(), metodoPago: 'efectivo', registradoPor: admin.usuario.nombre });
    expect(res.body.gasto.cajaId).toBeGreaterThan(0);

    const resumen = await request(app).get('/api/caja/actual/resumen').set('Cookie', admin.cookie);
    expect(resumen.body.resumen).toMatchObject({ gastosEfectivo: 85000, dineroEsperado: 115000 });
  });

  it('por transferencia, de otro día o sin caja abierta no toca la caja', async () => {
    const admin = await sesionDe(app, 'admin');
    const sinCaja = await request(app).post('/api/gastos').set('Cookie', admin.cookie).send(gasto);
    expect(sinCaja.body.gasto.cajaId).toBeNull();
    // Efectivo de hoy sin caja abierta: se guarda, pero avisa que no entra en ningún arqueo.
    expect(sinCaja.body.aviso).toContain('caja abierta');

    await request(app).post('/api/caja/abrir').set('Cookie', admin.cookie).send({ montoInicial: 0 });
    const transf = await request(app).post('/api/gastos').set('Cookie', admin.cookie).send({ ...gasto, metodoPago: 'transferencia' });
    expect(transf.body.gasto.cajaId).toBeNull();
    expect(transf.body.aviso).toBeNull();
    const ayer = await request(app).post('/api/gastos').set('Cookie', admin.cookie).send({ ...gasto, fecha: '2026-01-02' });
    expect(ayer.body.gasto.cajaId).toBeNull();
    expect(ayer.body.aviso).toBeNull();
  });

  it('un gasto de una caja ya cerrada se puede editar y borrar; el acta no cambia', async () => {
    const admin = await sesionDe(app, 'admin');
    await request(app).post('/api/caja/abrir').set('Cookie', admin.cookie).send({ montoInicial: 100000 });
    const { body } = await request(app).post('/api/gastos').set('Cookie', admin.cookie).send(gasto);
    const cierre = await request(app).post('/api/caja/cerrar').set('Cookie', admin.cookie).send({ dineroReal: 15000 });
    // Una caja nueva abierta hoy: el gasto editado no debe pasar a su arqueo.
    await request(app).post('/api/caja/abrir').set('Cookie', admin.cookie).send({ montoInicial: 0 });

    const editar = await request(app).patch(`/api/gastos/${body.gasto.id}`).set('Cookie', admin.cookie).send({ monto: 1 });
    expect(editar.status).toBe(200);
    expect(editar.body.gasto).toMatchObject({ monto: 1, cajaId: body.gasto.cajaId });
    const resumen = await request(app).get('/api/caja/actual/resumen').set('Cookie', admin.cookie);
    expect(resumen.body.resumen.gastosEfectivo).toBe(0);

    const borrar = await request(app).delete(`/api/gastos/${body.gasto.id}`).set('Cookie', admin.cookie);
    expect(borrar.status).toBe(204);
    const acta = await request(app).get(`/api/caja/cierres/${cierre.body.cierre.id}`).set('Cookie', admin.cookie);
    expect(acta.body.cierre.gastosEfectivo).toBe(85000);
  });
});

describe('reglas de fecha', () => {
  it('rechaza fechas futuras', async () => {
    const { cookie } = await sesionDe(app, 'admin');
    const res = await request(app).post('/api/gastos').set('Cookie', cookie).send({ ...gasto, fecha: '2999-01-01' });
    expect(res.status).toBe(400);
  });

  it('no se registran ni cambian gastos de un mes cerrado', async () => {
    const { cookie } = await sesionDe(app, 'admin');
    const { body } = await request(app).post('/api/gastos').set('Cookie', cookie).send(gasto);
    await cerrarMesActual();

    expect((await request(app).post('/api/gastos').set('Cookie', cookie).send(gasto)).status).toBe(409);
    expect((await request(app).patch(`/api/gastos/${body.gasto.id}`).set('Cookie', cookie).send({ monto: 1 })).status).toBe(409);
    expect((await request(app).delete(`/api/gastos/${body.gasto.id}`).set('Cookie', cookie)).status).toBe(409);
  });

  it('mover un gasto de un mes abierto a uno cerrado tampoco se permite', async () => {
    const { cookie } = await sesionDe(app, 'admin');
    await db.insert(cierresMensuales).values({
      mes: '2026-01-01',
      totalVentas: 0, ventasEfectivo: 0, ventasTransferencia: 0, gananciaBruta: 0, totalGastos: 0, utilidadNeta: 0,
      numVentas: 0, numAnuladas: 0, unidadesVendidas: 0, cerradoPorNombre: 'Test',
    });
    const { body } = await request(app).post('/api/gastos').set('Cookie', cookie).send(gasto);
    const res = await request(app).patch(`/api/gastos/${body.gasto.id}`).set('Cookie', cookie).send({ fecha: '2026-01-15' });
    expect(res.status).toBe(409);
  });
});

describe('editar, borrar y listar', () => {
  it('edita, borra y lista con total del periodo', async () => {
    const { cookie } = await sesionDe(app, 'admin');
    const a = await request(app).post('/api/gastos').set('Cookie', cookie).send(gasto);
    await request(app).post('/api/gastos').set('Cookie', cookie).send({ ...gasto, categoria: 'arriendo', monto: 900000 });
    await request(app).post('/api/gastos').set('Cookie', cookie).send({ ...gasto, monto: 15000, fecha: '2026-02-10' });

    const editado = await request(app).patch(`/api/gastos/${a.body.gasto.id}`).set('Cookie', cookie).send({ monto: 90000 });
    expect(editado.body.gasto.monto).toBe(90000);

    const hoy = fechaNegocio();
    const lista = await request(app).get(`/api/gastos?desde=${hoy}&hasta=${hoy}`).set('Cookie', cookie);
    expect(lista.body).toMatchObject({ total: 2, montoTotal: 990000 });
    expect((await request(app).get('/api/gastos?categoria=arriendo').set('Cookie', cookie)).body.total).toBe(1);

    expect((await request(app).delete(`/api/gastos/${a.body.gasto.id}`).set('Cookie', cookie)).status).toBe(204);
    expect((await request(app).get(`/api/gastos/${a.body.gasto.id}`).set('Cookie', cookie)).status).toBe(404);
  });

  it('valida monto y categoría', async () => {
    const { cookie } = await sesionDe(app, 'admin');
    expect((await request(app).post('/api/gastos').set('Cookie', cookie).send({ ...gasto, monto: 0 })).status).toBe(400);
    expect((await request(app).post('/api/gastos').set('Cookie', cookie).send({ ...gasto, categoria: 'fiesta' })).status).toBe(400);
  });
});
