import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { crearApp } from '../../src/app.js';
import { cerrarDb, db } from '../../src/database/client.js';
import { gastos, productos, ventaItems, ventas } from '../../src/models/index.js';
import { mesNegocio } from '../../src/utils/fecha/fecha.js';
import { limpiarBase } from '../helpers/db.js';
import { sesionDe } from '../helpers/usuarios.js';

const app = crearApp();

beforeEach(limpiarBase);
afterAll(async () => {
  await limpiarBase();
  await cerrarDb();
});

/** Mes calendario anterior al actual ("YYYY-MM-01"). */
function mesAnterior(): string {
  const [a, m] = mesNegocio().split('-').map(Number) as [number, number];
  return m === 1 ? `${a - 1}-12-01` : `${a}-${String(m - 1).padStart(2, '0')}-01`;
}

/** Inserta una venta con fecha arbitraria (las del API siempre son "ahora"). */
async function ventaEn(fechaIso: string, total: number, ganancia: number, cantidad: number, anulada = false) {
  const [v] = await db
    .insert(ventas)
    .values({
      fecha: new Date(fechaIso),
      vendedorNombre: 'Test', metodoPago: 'efectivo', subtotal: total, total, costoTotal: total - ganancia, gananciaBruta: ganancia,
      ...(anulada ? { estado: 'anulada' as const, motivoAnulacion: 'x', anuladaEn: new Date() } : {}),
    })
    .returning();
  await db.insert(ventaItems).values({
    ventaId: v!.id, productoNombre: 'P', cantidad, precioUnitario: total / cantidad, costoUnitario: 0, subtotal: total, total,
  });
}

/** Admin con caja abierta y dos productos, que hace ventas reales por la API. */
async function escenarioMesActual() {
  const admin = await sesionDe(app, 'admin');
  await request(app).post('/api/caja/abrir').set('Cookie', admin.cookie).send({ montoInicial: 0 });
  const [a, b] = await db
    .insert(productos)
    .values([
      { nombre: 'Postura', precioCompra: 80000, precioVenta: 100000, precioMayorista: 95000, stock: 100 },
      { nombre: 'Levante', precioCompra: 70000, precioVenta: 90000, precioMayorista: 85000, stock: 100 },
    ])
    .returning();
  const vender = (items: object[], metodoPago = 'efectivo') =>
    request(app).post('/api/ventas').set('Cookie', admin.cookie).send({ idempotencyKey: randomUUID(), metodoPago, items });

  await vender([{ productoId: a!.id, cantidad: 3 }]); // 300.000 / ganancia 60.000
  await vender([{ productoId: b!.id, cantidad: 1 }], 'transferencia'); // 90.000 / 20.000
  const anulada = await vender([{ productoId: b!.id, cantidad: 5 }]);
  await request(app).post(`/api/ventas/${anulada.body.venta.id}/anular`).set('Cookie', admin.cookie).send({ motivo: 'error' });
  await request(app).post('/api/gastos').set('Cookie', admin.cookie).send({ categoria: 'servicios', descripcion: 'Luz', monto: 50000 });
  return admin;
}

describe('dashboard', () => {
  it('muestra las ventas de hoy; la ganancia solo al administrador', async () => {
    const admin = await escenarioMesActual();
    const vendedor = await sesionDe(app, 'vendedor');

    const comoAdmin = await request(app).get('/api/reportes/dashboard').set('Cookie', admin.cookie);
    expect(comoAdmin.body.hoy).toMatchObject({ totalVentas: 390000, numVentas: 2, numAnuladas: 1, gananciaBruta: 80000 });
    expect(comoAdmin.body.caja.estado).toBe('abierta');
    expect(comoAdmin.body.ultimasVentas).toHaveLength(3);

    const comoVendedor = await request(app).get('/api/reportes/dashboard').set('Cookie', vendedor.cookie);
    expect(comoVendedor.body.hoy.totalVentas).toBe(390000);
    expect(comoVendedor.body.hoy).not.toHaveProperty('gananciaBruta');
    expect(comoVendedor.body.hoy).not.toHaveProperty('utilidadNeta');

    // Semana de 7 días (hoy al final) e inventario; la inversión solo para el admin.
    expect(comoAdmin.body.semana).toHaveLength(7);
    expect(comoAdmin.body.semana[6].total).toBe(390000);
    expect(comoAdmin.body.inventario).toMatchObject({ referencias: 2, unidades: 196, inversion: 97 * 80000 + 99 * 70000 });
    expect(comoVendedor.body.inventario).not.toHaveProperty('inversion');
  });

  it('trae el dinero acumulado de todos los meses, también para el vendedor', async () => {
    await escenarioMesActual();
    await ventaEn(`${mesAnterior().slice(0, 8)}05T12:00:00-05:00`, 10000, 2000, 1);
    await ventaEn(`${mesAnterior().slice(0, 8)}06T12:00:00-05:00`, 77777, 1, 1, true);
    const vendedor = await sesionDe(app, 'vendedor');

    const res = await request(app).get('/api/reportes/dashboard').set('Cookie', vendedor.cookie);
    expect(res.body.acumulado).toEqual({ efectivo: 310000, transferencia: 90000, gastos: 50000, total: 350000 });
    // Gastos del día también para el vendedor.
    expect(res.body.hoy.totalGastos).toBe(50000);
  });

  it('el galponero no ve el dashboard de la distribuidora', async () => {
    const { cookie } = await sesionDe(app, 'galponero');
    expect((await request(app).get('/api/reportes/dashboard').set('Cookie', cookie)).status).toBe(403);
  });
});

describe('reporte del mes', () => {
  it('suma ventas completadas, gastos, top de productos y ventas por día', async () => {
    const admin = await escenarioMesActual();
    const res = await request(app).get('/api/reportes/mes').set('Cookie', admin.cookie);

    expect(res.status).toBe(200);
    expect(res.body.reporte).toMatchObject({
      mes: mesNegocio(),
      totalVentas: 390000,
      ventasEfectivo: 300000,
      ventasTransferencia: 90000,
      gananciaBruta: 80000,
      totalGastos: 50000,
      utilidadNeta: 30000,
      numVentas: 2,
      numAnuladas: 1,
      unidadesVendidas: 4,
      margen: 20.51,
      cierre: null,
    });
    expect(res.body.reporte.topProductos[0]).toMatchObject({ producto: 'Postura', cantidad: 3, total: 300000 });
    expect(res.body.reporte.ventasPorDia).toHaveLength(1);
    expect(res.body.reporte.gastosPorCategoria).toEqual([{ categoria: 'servicios', total: 50000, cantidad: 1 }]);
  });

  it('solo el administrador ve reportes', async () => {
    const { cookie } = await sesionDe(app, 'vendedor');
    expect((await request(app).get('/api/reportes/mes').set('Cookie', cookie)).status).toBe(403);
    expect((await request(app).get('/api/reportes/historico').set('Cookie', cookie)).status).toBe(403);
  });

  it('valida el formato del mes', async () => {
    const { cookie } = await sesionDe(app, 'admin');
    expect((await request(app).get('/api/reportes/mes?mes=2026-13').set('Cookie', cookie)).status).toBe(400);
    expect((await request(app).get('/api/reportes/mes?mes=2026-02').set('Cookie', cookie)).body.reporte.mes).toBe('2026-02-01');
  });
});

describe('cierre de mes', () => {
  it('cierra un mes pasado con sus cifras y no deja cerrarlo dos veces', async () => {
    const { cookie } = await sesionDe(app, 'admin');
    const mes = mesAnterior();
    // 23:30 del último día del mes anterior en Colombia ya es el día 1 en UTC: debe contar en el mes anterior.
    const [a, m] = mes.split('-').map(Number) as [number, number];
    const ultimoDia = new Date(Date.UTC(a, m, 0)).getUTCDate();
    await ventaEn(`${mes.slice(0, 8)}${String(ultimoDia).padStart(2, '0')}T23:30:00-05:00`, 100000, 25000, 2);
    await ventaEn(`${mes.slice(0, 8)}10T10:00:00-05:00`, 50000, 10000, 1);
    await ventaEn(`${mes.slice(0, 8)}11T10:00:00-05:00`, 999999, 1, 9, true);
    await db.insert(gastos).values({ fecha: `${mes.slice(0, 8)}15`, categoria: 'arriendo', descripcion: 'Arriendo', monto: 20000 });

    const res = await request(app).post('/api/reportes/cierres-mes').set('Cookie', cookie).send({ mes: mes.slice(0, 7) });
    expect(res.status).toBe(201);
    expect(res.body.cierre).toMatchObject({
      mes, totalVentas: 150000, gananciaBruta: 35000, totalGastos: 20000, utilidadNeta: 15000, numVentas: 2, numAnuladas: 1, unidadesVendidas: 3,
    });

    expect((await request(app).post('/api/reportes/cierres-mes').set('Cookie', cookie).send({ mes })).status).toBe(409);
    expect((await request(app).get(`/api/reportes/mes?mes=${mes}`).set('Cookie', cookie)).body.reporte.cierre.id).toBe(res.body.cierre.id);
    expect((await request(app).get('/api/reportes/cierres-mes').set('Cookie', cookie)).body.cierres).toHaveLength(1);

    // Ya no se pueden registrar gastos en ese mes.
    const gasto = await request(app).post('/api/gastos').set('Cookie', cookie).send({ fecha: `${mes.slice(0, 8)}20`, categoria: 'otros', descripcion: 'tarde', monto: 1 });
    expect(gasto.status).toBe(409);
  });

  it('dos cierres del mismo mes a la vez: solo uno se guarda', async () => {
    const { cookie } = await sesionDe(app, 'admin');
    const respuestas = await Promise.all(
      [1, 2, 3].map(() => request(app).post('/api/reportes/cierres-mes').set('Cookie', cookie).send({ mes: mesAnterior() })),
    );
    expect(respuestas.map((r) => r.status).sort()).toEqual([201, 409, 409]);
  });

  it('no se puede cerrar el mes en curso ni uno futuro', async () => {
    const { cookie } = await sesionDe(app, 'admin');
    expect((await request(app).post('/api/reportes/cierres-mes').set('Cookie', cookie).send({ mes: mesNegocio() })).status).toBe(409);
    expect((await request(app).post('/api/reportes/cierres-mes').set('Cookie', cookie).send({ mes: '2999-01' })).status).toBe(409);
  });
});

describe('histórico', () => {
  it('totaliza todo y desglosa por mes', async () => {
    const admin = await escenarioMesActual();
    const mes = mesAnterior();
    await ventaEn(`${mes.slice(0, 8)}05T12:00:00-05:00`, 10000, 2000, 1);

    const res = await request(app).get('/api/reportes/historico').set('Cookie', admin.cookie);
    expect(res.body.historico).toMatchObject({ totalVentas: 400000, gananciaBruta: 82000, totalGastos: 50000 });
    expect(res.body.historico.porMes.map((m: { mes: string }) => m.mes)).toEqual([mesNegocio(), mes]);
    expect(res.body.historico.porMes[0]).toMatchObject({ totalVentas: 390000, totalGastos: 50000, utilidadNeta: 30000 });

    // Primer mes con movimiento y los 12 meses de la gráfica, con ceros donde no hubo ventas.
    expect(res.body.historico.primerMes).toBe(mes);
    const meses = res.body.historico.ultimos12Meses as { mes: string; totalVentas: number }[];
    expect(meses).toHaveLength(12);
    expect(meses[11]).toMatchObject({ mes: mesNegocio(), totalVentas: 390000 });
    expect(meses[10]).toMatchObject({ mes, totalVentas: 10000 });
    expect(meses[0]!.totalVentas).toBe(0);
    expect(meses.map((m) => m.mes)).toEqual([...meses.map((m) => m.mes)].sort());
  });

  it('sin movimiento: primerMes null y 12 meses en cero', async () => {
    const { cookie } = await sesionDe(app, 'admin');
    const { historico } = (await request(app).get('/api/reportes/historico').set('Cookie', cookie)).body;
    expect(historico.primerMes).toBeNull();
    expect(historico.ultimos12Meses.every((m: { totalVentas: number }) => m.totalVentas === 0)).toBe(true);
  });
});

describe('meses por cerrar', () => {
  it('lista los meses terminados con movimiento que aún no se cierran, con sus cifras', async () => {
    const admin = await escenarioMesActual();
    const mes = mesAnterior();
    await ventaEn(`${mes.slice(0, 8)}05T12:00:00-05:00`, 10000, 2000, 1);

    const antes = (await request(app).get('/api/reportes/cierres-mes').set('Cookie', admin.cookie)).body;
    expect(antes.cierres).toEqual([]);
    // El mes en curso no aparece: aún no termina.
    expect(antes.porCerrar).toEqual([expect.objectContaining({ mes, totalVentas: 10000, gananciaBruta: 2000, utilidadNeta: 2000, margen: 20 })]);

    await request(app).post('/api/reportes/cierres-mes').set('Cookie', admin.cookie).send({ mes });
    const despues = (await request(app).get('/api/reportes/cierres-mes').set('Cookie', admin.cookie)).body;
    expect(despues.cierres).toHaveLength(1);
    expect(despues.porCerrar).toEqual([]);
  });
});
