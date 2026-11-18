import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { crearApp } from '../../src/app.js';
import { cerrarDb, db } from '../../src/database/client.js';
import { auditoria, huevoTipos } from '../../src/models/index.js';
import { fechaNegocio, mesNegocio, sumarDias } from '../../src/utils/fecha/fecha.js';
import { limpiarBase } from '../helpers/db.js';
import { sesionDe } from '../helpers/usuarios.js';

const app = crearApp();

beforeEach(limpiarBase);
afterAll(async () => {
  await limpiarBase();
  await cerrarDb();
});

const hoy = () => fechaNegocio();

/** Tamaño AA a $18.000 el cartón. */
async function tipo(nombre = 'AA', precioVenta = 18000) {
  const [t] = await db.insert(huevoTipos).values({ nombre, precioVenta, orden: 1 }).returning();
  return t!;
}

async function ingresar(cookie: string, items: object[], extra: object = {}) {
  return request(app).post('/api/huevos/ingresos').set('Cookie', cookie).send({ items, ...extra });
}

function vender(cookie: string, items: object[], extra: object = {}) {
  return request(app).post('/api/huevos/ventas').set('Cookie', cookie).send({ idempotencyKey: randomUUID(), items, metodoPago: 'efectivo', ...extra });
}

describe('permisos', () => {
  it('admin y vendedor entran; el galponero no', async () => {
    const vendedor = await sesionDe(app, 'vendedor');
    const galponero = await sesionDe(app, 'galponero');
    expect((await request(app).get('/api/huevos/resumen').set('Cookie', vendedor.cookie)).status).toBe(200);
    expect((await request(app).get('/api/huevos/resumen').set('Cookie', galponero.cookie)).status).toBe(403);
  });
});

describe('tamaños', () => {
  it('el admin crea, renombra y borra; el nombre no se repite', async () => {
    const admin = await sesionDe(app, 'admin');
    const creado = await request(app).post('/api/huevos/tipos').set('Cookie', admin.cookie).send({ nombre: 'Jumbo', precioVenta: 22000 });
    expect(creado.status).toBe(201);
    await request(app).post('/api/huevos/tipos').set('Cookie', admin.cookie).send({ nombre: 'AA' });

    const repetido = await request(app).patch(`/api/huevos/tipos/${creado.body.tipo.id}`).set('Cookie', admin.cookie).send({ nombre: 'AA' });
    expect(repetido.status).toBe(409);

    expect((await request(app).delete(`/api/huevos/tipos/${creado.body.tipo.id}`).set('Cookie', admin.cookie)).status).toBe(204);
  });

  it('el vendedor solo cambia el precio', async () => {
    const t = await tipo();
    const vendedor = await sesionDe(app, 'vendedor');
    expect((await request(app).post('/api/huevos/tipos').set('Cookie', vendedor.cookie).send({ nombre: 'X' })).status).toBe(403);
    expect((await request(app).patch(`/api/huevos/tipos/${t.id}`).set('Cookie', vendedor.cookie).send({ nombre: 'X' })).status).toBe(403);
    const precio = await request(app).patch(`/api/huevos/tipos/${t.id}`).set('Cookie', vendedor.cookie).send({ precioVenta: 19500 });
    expect(precio.body.tipo.precioVenta).toBe(19500);
  });

  it('un tamaño con movimientos no se borra', async () => {
    const t = await tipo();
    const admin = await sesionDe(app, 'admin');
    await ingresar(admin.cookie, [{ tipoId: t.id, cartones: 1, precioVenta: 18000 }]);
    expect((await request(app).delete(`/api/huevos/tipos/${t.id}`).set('Cookie', admin.cookie)).status).toBe(409);
  });
});

describe('ingresos y ventas', () => {
  it('ingresa cartones y sueltos y actualiza el precio si cambió', async () => {
    const t = await tipo();
    const vendedor = await sesionDe(app, 'vendedor');
    const res = await ingresar(vendedor.cookie, [{ tipoId: t.id, cartones: 10, sueltos: 5, precioVenta: 20000 }], { origen: 'Galpón 1' });
    expect(res.status).toBe(201);
    expect(res.body.huevos).toBe(305);
    expect(res.body.movimientos[0]).toMatchObject({ clase: 'entrada', huevos: 305, tercero: 'Galpón 1', precioCarton: 0 });

    const resumen = (await request(app).get('/api/huevos/resumen').set('Cookie', vendedor.cookie)).body;
    expect(resumen.porTamano[0]).toMatchObject({ nombre: 'AA', precioVenta: 20000, enBodega: 305, valorBodega: Math.round((305 / 30) * 20000) });
    expect(resumen.hoy).toMatchObject({ huevosIngresados: 305 });
  });

  it('vende un carrito por cartón y por unidad con el precio del servidor, todo o nada', async () => {
    const aa = await tipo('AA', 18000);
    const aaa = await tipo('AAA', 21000);
    const vendedor = await sesionDe(app, 'vendedor');
    await ingresar(vendedor.cookie, [
      { tipoId: aa.id, cartones: 5, precioVenta: 18000 },
      { tipoId: aaa.id, cartones: 1, precioVenta: 21000 },
    ]);

    const res = await vender(vendedor.cookie, [
      { tipoId: aa.id, forma: 'carton', cantidad: 2 },
      { tipoId: aa.id, forma: 'unidad', cantidad: 7 },
      { tipoId: aaa.id, forma: 'carton', cantidad: 1 },
    ], { cliente: 'Doña Rosa' });
    expect(res.status).toBe(201);
    // 2 cartones × 18.000 + 7 huevos × round(18.000 / 30) = 600 + 1 cartón × 21.000
    expect(res.body.total).toBe(36000 + 7 * 600 + 21000);
    expect(res.body.movimientos[1]).toMatchObject({ huevos: 7, precioCarton: 18000, tercero: 'Doña Rosa', metodoPago: 'efectivo' });

    // Sin huevos suficientes de AAA: no se guarda ninguna línea.
    const falla = await vender(vendedor.cookie, [
      { tipoId: aa.id, forma: 'carton', cantidad: 1 },
      { tipoId: aaa.id, forma: 'unidad', cantidad: 1 },
    ]);
    expect(falla.status).toBe(409);
    expect(falla.body.error.mensaje).toContain('AAA');
    const resumen = (await request(app).get('/api/huevos/resumen').set('Cookie', vendedor.cookie)).body;
    expect(resumen.porTamano.find((t: { nombre: string }) => t.nombre === 'AA').enBodega).toBe(150 - 67);
    expect(resumen.hoy).toMatchObject({ huevosVendidos: 97, vendido: 61200 });
  });

  it('reintentar con la misma clave no cobra dos veces; con otro carrito responde 409', async () => {
    const t = await tipo();
    const vendedor = await sesionDe(app, 'vendedor');
    await ingresar(vendedor.cookie, [{ tipoId: t.id, cartones: 3, precioVenta: 18000 }]);
    const clave = randomUUID();
    const items = [{ tipoId: t.id, forma: 'carton', cantidad: 1 }];

    const respuestas = await Promise.all([1, 2, 3].map(() => vender(vendedor.cookie, items, { idempotencyKey: clave })));
    expect(respuestas.map((r) => r.status).sort()).toEqual([200, 200, 201]);
    const otro = await vender(vendedor.cookie, [{ tipoId: t.id, forma: 'carton', cantidad: 2 }], { idempotencyKey: clave });
    expect(otro.status).toBe(409);
    expect((await request(app).get('/api/huevos/resumen').set('Cookie', vendedor.cookie)).body.porTamano[0].enBodega).toBe(60);
  });

  it('ventas simultáneas nunca dejan el inventario en negativo', async () => {
    const t = await tipo();
    const vendedor = await sesionDe(app, 'vendedor');
    await ingresar(vendedor.cookie, [{ tipoId: t.id, cartones: 3, precioVenta: 18000 }]);
    const respuestas = await Promise.all(
      Array.from({ length: 6 }, () => vender(vendedor.cookie, [{ tipoId: t.id, forma: 'carton', cantidad: 1 }])),
    );
    expect(respuestas.filter((r) => r.status === 201)).toHaveLength(3);
    expect((await request(app).get('/api/huevos/resumen').set('Cookie', vendedor.cookie)).body.porTamano[0].enBodega).toBe(0);
  });

  it('rotos descuentan del inventario y no pueden ser más de los que hay', async () => {
    const t = await tipo();
    const vendedor = await sesionDe(app, 'vendedor');
    await ingresar(vendedor.cookie, [{ tipoId: t.id, cartones: 1, precioVenta: 18000 }]);
    const rotos = await request(app).post('/api/huevos/rotos').set('Cookie', vendedor.cookie).send({ tipoId: t.id, forma: 'unidad', cantidad: 4, notas: 'Se cayó la canasta' });
    expect(rotos.status).toBe(201);
    expect(rotos.body.movimiento).toMatchObject({ clase: 'perdida', huevos: 4, precioCarton: 0, metodoPago: null });
    expect((await request(app).post('/api/huevos/rotos').set('Cookie', vendedor.cookie).send({ tipoId: t.id, forma: 'carton', cantidad: 1 })).status).toBe(409);
  });

  it('el vendedor solo anota hoy; el admin otros días; nadie días futuros', async () => {
    const t = await tipo();
    const vendedor = await sesionDe(app, 'vendedor');
    const admin = await sesionDe(app, 'admin');
    const item = [{ tipoId: t.id, cartones: 1, precioVenta: 18000 }];
    expect((await ingresar(vendedor.cookie, item, { fecha: sumarDias(hoy(), -1) })).status).toBe(403);
    expect((await ingresar(admin.cookie, item, { fecha: sumarDias(hoy(), -1) })).status).toBe(201);
    expect((await ingresar(admin.cookie, item, { fecha: sumarDias(hoy(), 1) })).status).toBe(400);
  });

  it('un tamaño desactivado no se vende ni se ingresa', async () => {
    const [t] = await db.insert(huevoTipos).values({ nombre: 'B', precioVenta: 15000, activo: false }).returning();
    const admin = await sesionDe(app, 'admin');
    expect((await ingresar(admin.cookie, [{ tipoId: t!.id, cartones: 1, precioVenta: 15000 }])).status).toBe(404);
  });
});

describe('historial y correcciones', () => {
  it('lista el mes con totales y filtra por clase', async () => {
    const t = await tipo();
    const vendedor = await sesionDe(app, 'vendedor');
    await ingresar(vendedor.cookie, [{ tipoId: t.id, cartones: 2, precioVenta: 18000 }]);
    await vender(vendedor.cookie, [{ tipoId: t.id, forma: 'carton', cantidad: 1 }]);

    const res = await request(app).get(`/api/huevos/movimientos?mes=${mesNegocio().slice(0, 7)}`).set('Cookie', vendedor.cookie);
    expect(res.body.mes).toBe(mesNegocio());
    expect(res.body.movimientos).toHaveLength(2);
    expect(res.body.movimientos[0]).toMatchObject({ clase: 'venta', tipo: 'AA', valor: 18000 });
    expect(res.body.totales).toEqual({ vendido: 18000, huevosVendidos: 30, huevosIngresados: 60, huevosRotos: 0 });

    const soloVentas = await request(app).get('/api/huevos/movimientos?clase=venta').set('Cookie', vendedor.cookie);
    expect(soloVentas.body.movimientos).toHaveLength(1);
  });

  it('el admin corrige y borra; nunca deja el inventario en negativo', async () => {
    const t = await tipo();
    const admin = await sesionDe(app, 'admin');
    const vendedor = await sesionDe(app, 'vendedor');
    const ingreso = await ingresar(admin.cookie, [{ tipoId: t.id, cartones: 2, precioVenta: 18000 }]);
    const entradaId = ingreso.body.movimientos[0].id;
    const venta = await vender(admin.cookie, [{ tipoId: t.id, forma: 'carton', cantidad: 1 }]);
    const ventaId = venta.body.movimientos[0].id;

    expect((await request(app).patch(`/api/huevos/movimientos/${ventaId}`).set('Cookie', vendedor.cookie).send({ huevos: 1 })).status).toBe(403);

    // Bajar el ingreso por debajo de lo vendido, o borrarlo, dejaría el inventario en negativo.
    expect((await request(app).patch(`/api/huevos/movimientos/${entradaId}`).set('Cookie', admin.cookie).send({ huevos: 20 })).status).toBe(409);
    expect((await request(app).delete(`/api/huevos/movimientos/${entradaId}`).set('Cookie', admin.cookie)).status).toBe(409);

    const corregida = await request(app).patch(`/api/huevos/movimientos/${ventaId}`).set('Cookie', admin.cookie).send({ huevos: 45, precioCarton: 20000 });
    expect(corregida.body.movimiento).toMatchObject({ huevos: 45, valor: 30000 });
    expect((await request(app).patch(`/api/huevos/movimientos/${entradaId}`).set('Cookie', admin.cookie).send({ precioCarton: 1 })).status).toBe(400);

    expect((await request(app).delete(`/api/huevos/movimientos/${ventaId}`).set('Cookie', admin.cookie)).status).toBe(204);
    expect((await request(app).delete(`/api/huevos/movimientos/${entradaId}`).set('Cookie', admin.cookie)).status).toBe(204);
    expect(await db.$count(auditoria, eq(auditoria.accion, 'huevo_movimiento.eliminar'))).toBe(2);
  });
});
