import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { crearApp } from '../../src/app.js';
import { cerrarDb, db } from '../../src/database/client.js';
import { auditoria, cajas, gastos, ventas } from '../../src/models/index.js';
import { fechaNegocio } from '../../src/utils/fecha/fecha.js';
import { limpiarBase } from '../helpers/db.js';
import { crearUsuario, iniciarSesion } from '../helpers/usuarios.js';

const app = crearApp();

beforeEach(limpiarBase);
afterAll(async () => {
  await limpiarBase();
  await cerrarDb();
});

async function sesion(rol: 'admin' | 'vendedor' | 'galponero' = 'vendedor') {
  const usuario = await crearUsuario(rol);
  return { usuario, cookie: await iniciarSesion(app, usuario.email) };
}

/** Inserta una venta directamente (el módulo de ventas llega en la Fase 5). */
async function venta(cajaId: number | null, total: number, metodoPago: 'efectivo' | 'transferencia', anulada = false) {
  await db.insert(ventas).values({
    cajaId,
    vendedorNombre: 'Test',
    metodoPago,
    subtotal: total,
    total,
    costoTotal: total * 0.8,
    gananciaBruta: total * 0.2,
    ...(anulada ? { estado: 'anulada' as const, motivoAnulacion: 'prueba', anuladaEn: new Date() } : {}),
  });
}

async function gasto(cajaId: number | null, monto: number, metodoPago: 'efectivo' | 'transferencia' = 'efectivo') {
  await db.insert(gastos).values({ cajaId, fecha: fechaNegocio(), categoria: 'otros', descripcion: 'x', monto, metodoPago });
}

describe('permisos', () => {
  it('el galponero no tiene acceso a la caja', async () => {
    const { cookie } = await sesion('galponero');
    expect((await request(app).get('/api/caja/actual').set('Cookie', cookie)).status).toBe(403);
  });
});

describe('abrir caja', () => {
  it('abre con la fecha de Colombia y la deja como caja actual', async () => {
    const { cookie, usuario } = await sesion();
    const res = await request(app).post('/api/caja/abrir').set('Cookie', cookie).send({ montoInicial: 150000 });

    expect(res.status).toBe(201);
    expect(res.body.caja).toMatchObject({ estado: 'abierta', montoInicial: 150000, fecha: fechaNegocio() });

    const actual = await request(app).get('/api/caja/actual').set('Cookie', cookie);
    expect(actual.body.caja).toMatchObject({ id: res.body.caja.id, abiertaPor: usuario.nombre, esDeOtroDia: false });
  });

  it('no permite abrir una segunda caja', async () => {
    const { cookie } = await sesion();
    await request(app).post('/api/caja/abrir').set('Cookie', cookie).send({ montoInicial: 100 });
    const res = await request(app).post('/api/caja/abrir').set('Cookie', cookie).send({ montoInicial: 100 });
    expect(res.status).toBe(409);
    expect(res.body.error.mensaje).toBe('Ya hay una caja abierta');
  });

  it('dos aperturas al mismo tiempo: solo una gana', async () => {
    const { cookie } = await sesion();
    const respuestas = await Promise.all(
      [1, 2, 3].map(() => request(app).post('/api/caja/abrir').set('Cookie', cookie).send({ montoInicial: 100 })),
    );
    expect(respuestas.map((r) => r.status).sort()).toEqual([201, 409, 409]);
    expect(await db.$count(cajas)).toBe(1);
  });

  it('rechaza montos negativos o con más de 2 decimales', async () => {
    const { cookie } = await sesion();
    expect((await request(app).post('/api/caja/abrir').set('Cookie', cookie).send({ montoInicial: -1 })).status).toBe(400);
    expect((await request(app).post('/api/caja/abrir').set('Cookie', cookie).send({ montoInicial: 10.555 })).status).toBe(400);
    expect((await request(app).post('/api/caja/abrir').set('Cookie', cookie).send({ montoInicial: '100' })).status).toBe(400);
  });

  it('sin caja abierta, la caja actual es null y el resumen responde 409', async () => {
    const { cookie } = await sesion();
    expect((await request(app).get('/api/caja/actual').set('Cookie', cookie)).body.caja).toBeNull();
    expect((await request(app).get('/api/caja/actual/resumen').set('Cookie', cookie)).status).toBe(409);
  });
});

describe('resumen y cierre', () => {
  async function cajaConMovimientos() {
    const s = await sesion();
    const abierta = await request(app).post('/api/caja/abrir').set('Cookie', s.cookie).send({ montoInicial: 100000 });
    const cajaId = abierta.body.caja.id as number;

    await venta(cajaId, 50000, 'efectivo');
    await venta(cajaId, 20000.5, 'efectivo');
    await venta(cajaId, 30000, 'transferencia');
    await venta(cajaId, 99999, 'efectivo', true); // anulada: no cuenta
    await venta(null, 77777, 'efectivo'); // de otra caja: no cuenta
    await gasto(cajaId, 15000);
    await gasto(cajaId, 5000, 'transferencia'); // no sale del cajón
    await gasto(null, 8888); // de otra caja: no cuenta

    return { ...s, cajaId };
  }

  it('el resumen suma solo lo de esta caja', async () => {
    const { cookie, cajaId } = await cajaConMovimientos();
    const res = await request(app).get('/api/caja/actual/resumen').set('Cookie', cookie);

    expect(res.status).toBe(200);
    expect(res.body.resumen).toEqual({
      cajaId,
      fecha: fechaNegocio(),
      montoInicial: 100000,
      ventasEfectivo: 70000.5,
      ventasTransferencia: 30000,
      numVentas: 3,
      numAnuladas: 1,
      gastosEfectivo: 15000,
      totalVentas: 100000.5,
      dineroEsperado: 155000.5, // 100000 + 70000.5 − 15000
    });
  });

  it('el cierre calcula lo esperado y la diferencia en el servidor', async () => {
    const { cookie, cajaId, usuario } = await cajaConMovimientos();
    const res = await request(app)
      .post('/api/caja/cerrar')
      .set('Cookie', cookie)
      .send({ dineroReal: 155000, observaciones: 'Faltaron 50 centavos' });

    expect(res.status).toBe(200);
    expect(res.body.cierre).toMatchObject({
      cajaId,
      dineroEsperado: 155000.5,
      dineroReal: 155000,
      diferencia: -0.5,
      responsable: usuario.nombre,
      numVentas: 3,
    });

    const [caja] = await db.select().from(cajas).where(eq(cajas.id, cajaId));
    expect(caja!.estado).toBe('cerrada');
    expect(caja!.cerradaPor).toBe(usuario.id);
  });

  it('no acepta que el cliente mande lo esperado o la diferencia', async () => {
    const { cookie } = await cajaConMovimientos();
    const res = await request(app)
      .post('/api/caja/cerrar')
      .set('Cookie', cookie)
      .send({ dineroReal: 1, dineroEsperado: 1, diferencia: 0 });
    expect(res.status).toBe(400);
  });

  it('cerrar sin caja abierta responde 409', async () => {
    const { cookie } = await sesion();
    const res = await request(app).post('/api/caja/cerrar').set('Cookie', cookie).send({ dineroReal: 0 });
    expect(res.status).toBe(409);
  });

  it('dos cierres al mismo tiempo: solo uno se registra', async () => {
    const { cookie } = await cajaConMovimientos();
    const respuestas = await Promise.all(
      [1, 2, 3].map(() => request(app).post('/api/caja/cerrar').set('Cookie', cookie).send({ dineroReal: 155000.5 })),
    );
    expect(respuestas.map((r) => r.status).sort()).toEqual([200, 409, 409]);
    expect(await db.$count(auditoria, eq(auditoria.accion, 'caja.cerrar'))).toBe(1);
  });

  it('después de cerrar se puede abrir una caja nueva', async () => {
    const { cookie } = await cajaConMovimientos();
    await request(app).post('/api/caja/cerrar').set('Cookie', cookie).send({ dineroReal: 155000.5 });
    const res = await request(app).post('/api/caja/abrir').set('Cookie', cookie).send({ montoInicial: 80000 });
    expect(res.status).toBe(201);
  });
});

describe('historial de cierres', () => {
  it('lista paginada, la más reciente primero, y detalle por id', async () => {
    const { cookie } = await sesion('admin');
    for (const monto of [1000, 2000, 3000]) {
      await request(app).post('/api/caja/abrir').set('Cookie', cookie).send({ montoInicial: monto });
      await request(app).post('/api/caja/cerrar').set('Cookie', cookie).send({ dineroReal: monto });
    }

    const pagina1 = await request(app).get('/api/caja/cierres?limite=2').set('Cookie', cookie);
    expect(pagina1.status).toBe(200);
    expect(pagina1.body).toMatchObject({ pagina: 1, limite: 2, total: 3, totalPaginas: 2 });
    expect(pagina1.body.datos.map((c: { montoInicial: number }) => c.montoInicial)).toEqual([3000, 2000]);

    const pagina2 = await request(app).get('/api/caja/cierres?limite=2&pagina=2').set('Cookie', cookie);
    expect(pagina2.body.datos).toHaveLength(1);

    const id = pagina1.body.datos[0].id;
    const detalle = await request(app).get(`/api/caja/cierres/${id}`).set('Cookie', cookie);
    expect(detalle.body.cierre).toMatchObject({ id, diferencia: 0 });
  });

  it('filtra por fecha y valida los parámetros', async () => {
    const { cookie } = await sesion('admin');
    await request(app).post('/api/caja/abrir').set('Cookie', cookie).send({ montoInicial: 1 });
    await request(app).post('/api/caja/cerrar').set('Cookie', cookie).send({ dineroReal: 1 });

    const hoy = fechaNegocio();
    expect((await request(app).get(`/api/caja/cierres?desde=${hoy}`).set('Cookie', cookie)).body.total).toBe(1);
    expect((await request(app).get('/api/caja/cierres?hasta=2000-01-01').set('Cookie', cookie)).body.total).toBe(0);
    expect((await request(app).get('/api/caja/cierres?limite=500').set('Cookie', cookie)).status).toBe(400);
    expect((await request(app).get('/api/caja/cierres?desde=ayer').set('Cookie', cookie)).status).toBe(400);
  });
});
