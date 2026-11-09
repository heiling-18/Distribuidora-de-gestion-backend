import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { crearApp } from '../../src/app.js';
import { cerrarDb, db } from '../../src/database/client.js';
import { cierresMensuales, clientes, inventarioMovimientos, productos, ventas } from '../../src/models/index.js';
import { fechaNegocio, mesNegocio } from '../../src/utils/fecha/fecha.js';
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

async function producto(datos: Partial<typeof productos.$inferInsert> = {}) {
  const [p] = await db
    .insert(productos)
    .values({ nombre: 'Purina Postura', precioCompra: 80000, precioVenta: 100000, precioMayorista: 95000, stock: 20, ...datos })
    .returning();
  return p!;
}

async function stockDe(id: number) {
  const [p] = await db.select({ stock: productos.stock }).from(productos).where(eq(productos.id, id));
  return p!.stock;
}

/** Vendedor con caja abierta, listo para vender. */
async function listoParaVender() {
  const s = await sesion('vendedor');
  await request(app).post('/api/caja/abrir').set('Cookie', s.cookie).send({ montoInicial: 50000 });
  return s;
}

function vender(cookie: string, items: { productoId: number; cantidad: number; tipoPrecio?: string }[], extra: object = {}) {
  return request(app)
    .post('/api/ventas')
    .set('Cookie', cookie)
    .send({ idempotencyKey: randomUUID(), metodoPago: 'efectivo', items, ...extra });
}

describe('registrar venta', () => {
  it('calcula precios y totales en el servidor, descuenta stock y la liga a la caja', async () => {
    const { cookie, usuario } = await listoParaVender();
    const purina = await producto();
    const bebedero = await producto({ nombre: 'Bebedero', precioCompra: 10000, precioVenta: 20000, precioMayorista: 18000, ivaPorcentaje: 19, unidadMedida: 'unidad' });

    const res = await vender(cookie, [
      { productoId: purina.id, cantidad: 2 },
      { productoId: bebedero.id, cantidad: 3, tipoPrecio: 'mayorista' },
    ]);

    expect(res.status).toBe(201);
    const v = res.body.venta;
    // 2 × 100.000 + 3 × 18.000 = 254.000 (precios con IVA incluido). IVA del bebedero: 54.000 − 54.000 / 1,19 = 8.621,85
    expect(v).toMatchObject({
      subtotal: 245378.15,
      ivaTotal: 8621.85,
      total: 254000,
      vendedorId: usuario.id,
      vendedorNombre: usuario.nombre,
      clienteNombre: 'Cliente General',
      estado: 'completada',
    });
    expect(v.cajaId).toBeGreaterThan(0);
    expect(v.items).toHaveLength(2);
    expect(v.items[1]).toMatchObject({ precioUnitario: 18000, subtotal: 45378.15, ivaMonto: 8621.85, total: 54000 });
    expect(v).not.toHaveProperty('idempotencyKey');

    // Costo y ganancia: solo los ve el administrador.
    const admin = await sesion('admin');
    const comoAdmin = await request(app).get(`/api/ventas/${v.id}`).set('Cookie', admin.cookie);
    expect(comoAdmin.body.venta).toMatchObject({
      costoTotal: 190000, // 2 × 80.000 + 3 × 10.000
      gananciaBruta: 55378.15, // subtotal sin IVA − costo (el IVA no es ganancia)
    });

    expect(await stockDe(purina.id)).toBe(18);
    expect(await stockDe(bebedero.id)).toBe(17);

    const movs = await db.select().from(inventarioMovimientos).where(eq(inventarioMovimientos.ventaId, v.id));
    expect(movs.map((m) => m.cantidad).sort((a, b) => a - b)).toEqual([-3, -2]);

    const resumen = await request(app).get('/api/caja/actual/resumen').set('Cookie', cookie);
    expect(resumen.body.resumen).toMatchObject({ ventasEfectivo: 254000, numVentas: 1, dineroEsperado: 304000 });
  });

  it('numera los tickets de forma consecutiva', async () => {
    const { cookie } = await listoParaVender();
    const p = await producto();
    const a = await vender(cookie, [{ productoId: p.id, cantidad: 1 }]);
    const b = await vender(cookie, [{ productoId: p.id, cantidad: 1 }]);
    expect(b.body.venta.numero).toBe(a.body.venta.numero + 1);
  });

  it('usa el detal con 5 % de descuento si el precio por mayor no está configurado', async () => {
    const { cookie } = await listoParaVender();
    const p = await producto({ precioMayorista: 0 });
    const res = await vender(cookie, [{ productoId: p.id, cantidad: 1, tipoPrecio: 'mayorista' }]);
    expect(res.body.venta.items[0].precioUnitario).toBe(95000);
  });

  it('guarda los datos del cliente registrado', async () => {
    const { cookie } = await listoParaVender();
    const p = await producto();
    const [c] = await db.insert(clientes).values({ nombre: 'Granja El Sol', documento: '900111222' }).returning();
    const res = await vender(cookie, [{ productoId: p.id, cantidad: 1 }], { clienteId: c!.id });
    expect(res.body.venta).toMatchObject({ clienteId: c!.id, clienteNombre: 'Granja El Sol', clienteDocumento: '900111222' });
  });

  it('rechaza precios o totales enviados por el cliente', async () => {
    const { cookie } = await listoParaVender();
    const p = await producto();
    const res = await vender(cookie, [{ productoId: p.id, cantidad: 1, precioUnitario: 1 } as never]);
    expect(res.status).toBe(400);
    const res2 = await vender(cookie, [{ productoId: p.id, cantidad: 1 }], { total: 1 });
    expect(res2.status).toBe(400);
  });

  it('exige caja abierta', async () => {
    const { cookie } = await sesion('vendedor');
    const p = await producto();
    const res = await vender(cookie, [{ productoId: p.id, cantidad: 1 }]);
    expect(res.status).toBe(409);
    expect(res.body.error.mensaje).toContain('No hay una caja abierta');
  });

  it('stock insuficiente: no registra nada', async () => {
    const { cookie } = await listoParaVender();
    const p = await producto({ stock: 3 });
    const res = await vender(cookie, [{ productoId: p.id, cantidad: 2 }, { productoId: p.id, cantidad: 2, tipoPrecio: 'mayorista' }]);

    expect(res.status).toBe(409);
    expect(res.body.error.detalles[0]).toMatchObject({ productoId: p.id, pedido: 4, disponible: 3 });
    expect(await stockDe(p.id)).toBe(3);
    expect(await db.$count(ventas)).toBe(0);
  });

  it('producto inactivo o inexistente responde 404', async () => {
    const { cookie } = await listoParaVender();
    const inactivo = await producto({ activo: false });
    expect((await vender(cookie, [{ productoId: inactivo.id, cantidad: 1 }])).status).toBe(404);
    expect((await vender(cookie, [{ productoId: 999999, cantidad: 1 }])).status).toBe(404);
  });

  it('bultos y unidades solo en cantidades enteras; kilos admiten decimales', async () => {
    const { cookie } = await listoParaVender();
    const bulto = await producto();
    const maiz = await producto({ nombre: 'Maíz', unidadMedida: 'kilo', precioVenta: 2000, precioMayorista: 1800, precioCompra: 1500, stock: 100 });

    expect((await vender(cookie, [{ productoId: bulto.id, cantidad: 1.5 }])).status).toBe(400);
    const res = await vender(cookie, [{ productoId: maiz.id, cantidad: 2.5 }]);
    expect(res.status).toBe(201);
    expect(res.body.venta.total).toBe(5000);
    expect(await stockDe(maiz.id)).toBe(97.5);
  });

  it('el galponero no puede vender', async () => {
    const { cookie } = await sesion('galponero');
    expect((await request(app).post('/api/ventas').set('Cookie', cookie).send({})).status).toBe(403);
  });
});

describe('idempotencia y concurrencia', () => {
  it('reintentar con la misma idempotencyKey no duplica la venta', async () => {
    const { cookie } = await listoParaVender();
    const p = await producto();
    const cuerpo = { idempotencyKey: randomUUID(), metodoPago: 'efectivo', items: [{ productoId: p.id, cantidad: 1 }] };

    const a = await request(app).post('/api/ventas').set('Cookie', cookie).send(cuerpo);
    const b = await request(app).post('/api/ventas').set('Cookie', cookie).send(cuerpo);

    expect(a.status).toBe(201);
    expect(b.status).toBe(200);
    expect(b.body).toMatchObject({ repetida: true, venta: { id: a.body.venta.id } });
    expect(await stockDe(p.id)).toBe(19);
  });

  it('la misma idempotencyKey enviada varias veces a la vez registra una sola venta', async () => {
    const { cookie } = await listoParaVender();
    const p = await producto();
    const cuerpo = { idempotencyKey: randomUUID(), metodoPago: 'efectivo', items: [{ productoId: p.id, cantidad: 1 }] };

    const respuestas = await Promise.all([1, 2, 3, 4].map(() => request(app).post('/api/ventas').set('Cookie', cookie).send(cuerpo)));
    expect(respuestas.filter((r) => r.status === 201)).toHaveLength(1);
    expect(new Set(respuestas.map((r) => r.body.venta.id)).size).toBe(1);
    expect(await db.$count(ventas)).toBe(1);
    expect(await stockDe(p.id)).toBe(19);
  });

  it('10 ventas simultáneas con stock para 5: se venden exactamente 5 y el stock nunca queda negativo', async () => {
    const { cookie } = await listoParaVender();
    const p = await producto({ stock: 5 });

    const respuestas = await Promise.all(Array.from({ length: 10 }, () => vender(cookie, [{ productoId: p.id, cantidad: 1 }])));
    const estados = respuestas.map((r) => r.status);

    expect(estados.filter((s) => s === 201)).toHaveLength(5);
    expect(estados.filter((s) => s === 409)).toHaveLength(5);
    expect(await stockDe(p.id)).toBe(0);
    expect(await db.$count(ventas)).toBe(5);
  });
});

describe('consultar ventas', () => {
  it('lista paginada con filtros y detalle con items', async () => {
    const { cookie } = await listoParaVender();
    const p = await producto();
    await vender(cookie, [{ productoId: p.id, cantidad: 1 }]);
    await vender(cookie, [{ productoId: p.id, cantidad: 1 }], { metodoPago: 'transferencia', clienteNombre: 'Doña Rosa' });
    await vender(cookie, [{ productoId: p.id, cantidad: 1 }]);

    const todas = await request(app).get('/api/ventas?limite=2').set('Cookie', cookie);
    expect(todas.body).toMatchObject({ total: 3, totalPaginas: 2 });
    expect(todas.body.datos[0].numero).toBeGreaterThan(todas.body.datos[1].numero);

    const transf = await request(app).get('/api/ventas?metodoPago=transferencia').set('Cookie', cookie);
    expect(transf.body.total).toBe(1);
    expect((await request(app).get('/api/ventas?q=rosa').set('Cookie', cookie)).body.total).toBe(1);

    const hoy = fechaNegocio();
    expect((await request(app).get(`/api/ventas?desde=${hoy}&hasta=${hoy}`).set('Cookie', cookie)).body.total).toBe(3);
    expect((await request(app).get('/api/ventas?hasta=2000-01-01').set('Cookie', cookie)).body.total).toBe(0);

    const detalle = await request(app).get(`/api/ventas/${transf.body.datos[0].id}`).set('Cookie', cookie);
    expect(detalle.body.venta.items).toHaveLength(1);

    const conItems = await request(app).get('/api/ventas?conItems=true').set('Cookie', cookie);
    expect(conItems.body.datos.every((v: { items: unknown[] }) => v.items.length === 1)).toBe(true);
    expect(todas.body.datos[0]).not.toHaveProperty('items');
    expect((await request(app).get('/api/ventas/999999').set('Cookie', cookie)).status).toBe(404);
  });
});

describe('anular venta', () => {
  async function ventaHecha() {
    const vendedor = await listoParaVender();
    const p = await producto();
    const res = await vender(vendedor.cookie, [{ productoId: p.id, cantidad: 4 }]);
    const admin = await sesion('admin');
    return { vendedor, admin, p, venta: res.body.venta };
  }

  it('solo el administrador puede anular', async () => {
    const { vendedor, venta } = await ventaHecha();
    const res = await request(app).post(`/api/ventas/${venta.id}/anular`).set('Cookie', vendedor.cookie).send({ motivo: 'error' });
    expect(res.status).toBe(403);
  });

  it('devuelve el stock, marca la venta y la saca del resumen de caja', async () => {
    const { vendedor, admin, p, venta } = await ventaHecha();
    expect(await stockDe(p.id)).toBe(16);

    const res = await request(app)
      .post(`/api/ventas/${venta.id}/anular`)
      .set('Cookie', admin.cookie)
      .send({ motivo: 'Cliente devolvió los bultos' });

    expect(res.status).toBe(200);
    expect(res.body.venta).toMatchObject({ estado: 'anulada', motivoAnulacion: 'Cliente devolvió los bultos', anuladaPor: admin.usuario.id });
    expect(await stockDe(p.id)).toBe(20);

    const resumen = await request(app).get('/api/caja/actual/resumen').set('Cookie', vendedor.cookie);
    expect(resumen.body.resumen).toMatchObject({ ventasEfectivo: 0, numVentas: 0, numAnuladas: 1 });
  });

  it('no se puede anular dos veces (ni a la vez)', async () => {
    const { admin, p, venta } = await ventaHecha();
    const respuestas = await Promise.all(
      [1, 2, 3].map(() => request(app).post(`/api/ventas/${venta.id}/anular`).set('Cookie', admin.cookie).send({ motivo: 'duplicada' })),
    );
    expect(respuestas.map((r) => r.status).sort()).toEqual([200, 409, 409]);
    expect(await stockDe(p.id)).toBe(20);
  });

  it('exige motivo', async () => {
    const { admin, venta } = await ventaHecha();
    expect((await request(app).post(`/api/ventas/${venta.id}/anular`).set('Cookie', admin.cookie).send({})).status).toBe(400);
  });

  it('no se puede anular una venta de un mes cerrado', async () => {
    const { admin, venta } = await ventaHecha();
    await db.insert(cierresMensuales).values({
      mes: mesNegocio(),
      totalVentas: 0, ventasEfectivo: 0, ventasTransferencia: 0, gananciaBruta: 0, totalGastos: 0, utilidadNeta: 0,
      numVentas: 0, numAnuladas: 0, unidadesVendidas: 0, cerradoPorNombre: 'Test',
    });
    const res = await request(app).post(`/api/ventas/${venta.id}/anular`).set('Cookie', admin.cookie).send({ motivo: 'tarde' });
    expect(res.status).toBe(409);
    expect(res.body.error.mensaje).toContain('mes');
  });
});

describe('revisión: costos e idempotencia', () => {
  it('el vendedor no recibe costos ni ganancia; el admin sí', async () => {
    const { cookie } = await listoParaVender();
    const p = await producto();
    const res = await vender(cookie, [{ productoId: p.id, cantidad: 1 }]);
    expect(res.body.venta).not.toHaveProperty('costoTotal');
    expect(res.body.venta).not.toHaveProperty('gananciaBruta');
    expect(res.body.venta.items[0]).not.toHaveProperty('costoUnitario');

    const lista = await request(app).get('/api/ventas?conItems=true').set('Cookie', cookie);
    expect(lista.body.datos[0]).not.toHaveProperty('gananciaBruta');
    expect(lista.body.datos[0].items[0]).not.toHaveProperty('costoUnitario');

    const admin = await sesion('admin');
    const detalle = await request(app).get(`/api/ventas/${res.body.venta.id}`).set('Cookie', admin.cookie);
    expect(detalle.body.venta.gananciaBruta).toBe(20000);
    expect(detalle.body.venta.items[0].costoUnitario).toBe(80000);
  });

  it('la misma clave con otro carrito responde 409 y no devuelve la venta vieja', async () => {
    const { cookie } = await listoParaVender();
    const p = await producto();
    const clave = randomUUID();
    await request(app).post('/api/ventas').set('Cookie', cookie).send({ idempotencyKey: clave, metodoPago: 'efectivo', items: [{ productoId: p.id, cantidad: 1 }] });
    const res = await request(app).post('/api/ventas').set('Cookie', cookie).send({ idempotencyKey: clave, metodoPago: 'efectivo', items: [{ productoId: p.id, cantidad: 3 }] });
    expect(res.status).toBe(409);
    expect(await stockDe(p.id)).toBe(19);
  });
});

describe('revisión: anular con la caja cerrada', () => {
  it('no se puede anular una venta cuya caja ya se cerró', async () => {
    const vendedor = await listoParaVender();
    const p = await producto();
    const { body } = await vender(vendedor.cookie, [{ productoId: p.id, cantidad: 2 }]);
    await request(app).post('/api/caja/cerrar').set('Cookie', vendedor.cookie).send({ dineroReal: 250000 });

    const admin = await sesion('admin');
    const res = await request(app).post(`/api/ventas/${body.venta.id}/anular`).set('Cookie', admin.cookie).send({ motivo: 'tarde' });
    expect(res.status).toBe(409);
    expect(res.body.error.mensaje).toContain('caja');
    expect(await stockDe(p.id)).toBe(18);
  });
});
