import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { crearApp } from '../../src/app.js';
import { cerrarDb, db } from '../../src/database/client.js';
import { auditoria, inventarioMovimientos } from '../../src/models/index.js';
import { limpiarBase } from '../helpers/db.js';
import { sesionDe } from '../helpers/usuarios.js';

const app = crearApp();

beforeEach(limpiarBase);
afterAll(async () => {
  await limpiarBase();
  await cerrarDb();
});

const base = { nombre: 'Purina Postura x 40 kg', precioCompra: 98000, precioVenta: 115000, precioMayorista: 108000 };

async function crearProducto(cookie: string, extra: object = {}) {
  return request(app).post('/api/productos').set('Cookie', cookie).send({ ...base, ...extra });
}

describe('permisos', () => {
  it('el vendedor consulta pero no crea, edita ni ajusta stock', async () => {
    const admin = await sesionDe(app, 'admin');
    const vendedor = await sesionDe(app, 'vendedor');
    const { body } = await crearProducto(admin.cookie);
    const id = body.producto.id;

    expect((await request(app).get('/api/productos').set('Cookie', vendedor.cookie)).status).toBe(200);
    expect((await crearProducto(vendedor.cookie)).status).toBe(403);
    expect((await request(app).patch(`/api/productos/${id}`).set('Cookie', vendedor.cookie).send({ precioVenta: 1 })).status).toBe(403);
    expect((await request(app).post(`/api/productos/${id}/ajuste-stock`).set('Cookie', vendedor.cookie).send({ tipo: 'compra', cantidad: 1, motivo: 'x' })).status).toBe(403);
  });

  it('el vendedor no ve el precio de compra', async () => {
    const admin = await sesionDe(app, 'admin');
    const vendedor = await sesionDe(app, 'vendedor');
    const { body } = await crearProducto(admin.cookie);

    const comoVendedor = await request(app).get(`/api/productos/${body.producto.id}`).set('Cookie', vendedor.cookie);
    expect(comoVendedor.body.producto).not.toHaveProperty('precioCompra');
    const comoAdmin = await request(app).get(`/api/productos/${body.producto.id}`).set('Cookie', admin.cookie);
    expect(comoAdmin.body.producto.precioCompra).toBe(98000);
  });

  it('el galponero no tiene acceso', async () => {
    const galponero = await sesionDe(app, 'galponero');
    expect((await request(app).get('/api/productos').set('Cookie', galponero.cookie)).status).toBe(403);
  });
});

describe('crear y editar', () => {
  it('crea con stock inicial y lo deja en el historial', async () => {
    const { cookie } = await sesionDe(app, 'admin');
    const res = await crearProducto(cookie, { codigo: 'PUR-1', stockInicial: 40, stockMinimo: 5 });

    expect(res.status).toBe(201);
    expect(res.body.producto).toMatchObject({ codigo: 'PUR-1', stock: 40, stockMinimo: 5, unidadMedida: 'bulto', categoria: 'Purinas y Concentrados', activo: true });
    const movs = await db.select().from(inventarioMovimientos).where(eq(inventarioMovimientos.productoId, res.body.producto.id));
    expect(movs).toMatchObject([{ tipo: 'inicial', cantidad: 40, stockResultante: 40 }]);
  });

  it('código repetido responde 409 con mensaje claro', async () => {
    const { cookie } = await sesionDe(app, 'admin');
    await crearProducto(cookie, { codigo: 'PUR-1' });
    const res = await crearProducto(cookie, { codigo: 'PUR-1', nombre: 'Otro' });
    expect(res.status).toBe(409);
    expect(res.body.error.mensaje).toBe('Ya existe un producto con ese código');
  });

  it('no permite editar el stock directamente', async () => {
    const { cookie } = await sesionDe(app, 'admin');
    const { body } = await crearProducto(cookie);
    const res = await request(app).patch(`/api/productos/${body.producto.id}`).set('Cookie', cookie).send({ stock: 999 });
    expect(res.status).toBe(400);
  });

  it('un cambio de precio queda en auditoría con el antes y el después', async () => {
    const { cookie } = await sesionDe(app, 'admin');
    const { body } = await crearProducto(cookie);
    const res = await request(app).patch(`/api/productos/${body.producto.id}`).set('Cookie', cookie).send({ precioVenta: 120000 });

    expect(res.body.producto.precioVenta).toBe(120000);
    const [evento] = await db.select().from(auditoria).where(eq(auditoria.accion, 'producto.cambiar_precio'));
    expect(evento).toMatchObject({ antes: { precioVenta: 115000 }, despues: { precioVenta: 120000 } });
  });

  it('borrar es lógico: desaparece para el vendedor, el admin lo puede ver y reactivar', async () => {
    const admin = await sesionDe(app, 'admin');
    const vendedor = await sesionDe(app, 'vendedor');
    const { body } = await crearProducto(admin.cookie);
    const id = body.producto.id;

    expect((await request(app).delete(`/api/productos/${id}`).set('Cookie', admin.cookie)).body.producto.activo).toBe(false);
    expect((await request(app).get('/api/productos').set('Cookie', vendedor.cookie)).body.total).toBe(0);
    expect((await request(app).get('/api/productos?activo=todos').set('Cookie', vendedor.cookie)).body.total).toBe(0);
    expect((await request(app).get(`/api/productos/${id}`).set('Cookie', vendedor.cookie)).status).toBe(404);
    expect((await request(app).get('/api/productos?activo=false').set('Cookie', admin.cookie)).body.total).toBe(1);

    await request(app).patch(`/api/productos/${id}`).set('Cookie', admin.cookie).send({ activo: true });
    expect((await request(app).get('/api/productos').set('Cookie', vendedor.cookie)).body.total).toBe(1);
  });
});

describe('ajuste de stock', () => {
  it('compras suman, ajustes restan, todo queda en el historial', async () => {
    const { cookie } = await sesionDe(app, 'admin');
    const { body } = await crearProducto(cookie, { stockInicial: 10 });
    const id = body.producto.id;

    const compra = await request(app).post(`/api/productos/${id}/ajuste-stock`).set('Cookie', cookie).send({ tipo: 'compra', cantidad: 20, motivo: 'Factura 123' });
    expect(compra.body.producto.stock).toBe(30);
    const ajuste = await request(app).post(`/api/productos/${id}/ajuste-stock`).set('Cookie', cookie).send({ tipo: 'ajuste', cantidad: -2, motivo: 'Bultos rotos' });
    expect(ajuste.body.producto.stock).toBe(28);

    const historial = await request(app).get(`/api/productos/${id}/movimientos`).set('Cookie', cookie);
    expect(historial.body.total).toBe(3);
    expect(historial.body.datos[0]).toMatchObject({ tipo: 'ajuste', cantidad: -2, stockResultante: 28, motivo: 'Bultos rotos' });
  });

  it('no deja el stock en negativo', async () => {
    const { cookie } = await sesionDe(app, 'admin');
    const { body } = await crearProducto(cookie, { stockInicial: 3 });
    const res = await request(app).post(`/api/productos/${body.producto.id}/ajuste-stock`).set('Cookie', cookie).send({ tipo: 'ajuste', cantidad: -5, motivo: 'Conteo' });
    expect(res.status).toBe(409);
  });

  it('una compra no puede restar, y los bultos no admiten decimales', async () => {
    const { cookie } = await sesionDe(app, 'admin');
    const { body } = await crearProducto(cookie, { stockInicial: 3 });
    const id = body.producto.id;
    expect((await request(app).post(`/api/productos/${id}/ajuste-stock`).set('Cookie', cookie).send({ tipo: 'compra', cantidad: -1, motivo: 'x x' })).status).toBe(400);
    expect((await request(app).post(`/api/productos/${id}/ajuste-stock`).set('Cookie', cookie).send({ tipo: 'compra', cantidad: 1.5, motivo: 'x x' })).status).toBe(400);
  });
});

describe('listado', () => {
  it('busca por nombre o código, filtra stock bajo y pagina', async () => {
    const { cookie } = await sesionDe(app, 'admin');
    await crearProducto(cookie, { nombre: 'Purina Levante', codigo: 'LEV-1', stockInicial: 2, stockMinimo: 5 });
    await crearProducto(cookie, { nombre: 'Purina Postura', codigo: 'POS-1', stockInicial: 50, stockMinimo: 5 });
    await crearProducto(cookie, { nombre: 'Maíz 100%', codigo: 'MAI-1', unidadMedida: 'kilo' });

    expect((await request(app).get('/api/productos?q=levante').set('Cookie', cookie)).body.total).toBe(1);
    expect((await request(app).get('/api/productos?q=pos-1').set('Cookie', cookie)).body.total).toBe(1);
    expect((await request(app).get('/api/productos?q=%25').set('Cookie', cookie)).body.total).toBe(1); // "%" literal
    // Levante (2 de mínimo 5) y Maíz (agotado: 0) están en o por debajo del mínimo; Postura no.
    const bajos = await request(app).get('/api/productos?stockBajo=true').set('Cookie', cookie);
    expect(bajos.body.datos.map((p: { nombre: string }) => p.nombre)).toEqual(['Maíz 100%', 'Purina Levante']);

    const pagina = await request(app).get('/api/productos?limite=2').set('Cookie', cookie);
    expect(pagina.body).toMatchObject({ total: 3, totalPaginas: 2 });
    expect(pagina.body.datos.map((p: { nombre: string }) => p.nombre)).toEqual(['Maíz 100%', 'Purina Levante']);
  });
});

describe('revisión: datos y stock en la misma transacción', () => {
  it('PATCH con ajuste de stock guarda ambos y deja el movimiento', async () => {
    const { cookie } = await sesionDe(app, 'admin');
    const { body } = await crearProducto(cookie, { stockInicial: 10 });
    const res = await request(app)
      .patch(`/api/productos/${body.producto.id}`)
      .set('Cookie', cookie)
      .send({ precioVenta: 120000, ajusteStock: { tipo: 'ajuste', cantidad: 5, motivo: 'Conteo físico' } });
    expect(res.status).toBe(200);
    expect(res.body.producto).toMatchObject({ precioVenta: 120000, stock: 15 });
  });

  it('si el ajuste falla no se guarda ningún cambio', async () => {
    const { cookie } = await sesionDe(app, 'admin');
    const { body } = await crearProducto(cookie, { stockInicial: 2 });
    const res = await request(app)
      .patch(`/api/productos/${body.producto.id}`)
      .set('Cookie', cookie)
      .send({ precioVenta: 999999, ajusteStock: { tipo: 'ajuste', cantidad: -5, motivo: 'Conteo físico' } });
    expect(res.status).toBe(409);
    const actual = await request(app).get(`/api/productos/${body.producto.id}`).set('Cookie', cookie);
    expect(actual.body.producto).toMatchObject({ precioVenta: 115000, stock: 2 });
  });
});
