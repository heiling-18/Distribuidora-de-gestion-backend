import { sql } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { cerrarDb, db } from '../../src/database/client.js';
import { cajas, galponRegistros, galpones, productos, usuarios, ventas } from '../../src/models/index.js';
import { enTransaccionRevertida, errorDe } from '../helpers/db.js';

afterAll(async () => {
  await cerrarDb();
});

describe('esquema de la base de datos', () => {
  it('tiene todas las tablas', async () => {
    const filas = await db.execute<{ tabla: string }>(
      sql`select table_name as tabla from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE'`,
    );
    const tablas = filas.rows.map((f) => f.tabla);
    expect(tablas).toEqual(
      expect.arrayContaining([
        'usuarios', 'productos', 'clientes', 'cajas', 'cierres_caja', 'ventas', 'venta_items', 'gastos',
        'cierres_mensuales', 'inventario_movimientos', 'auditoria', 'configuracion', 'galpones', 'galpon_registros',
      ]),
    );
  });

  it('no permite dos usuarios con el mismo email (sin importar mayúsculas)', async () => {
    await enTransaccionRevertida(async (tx) => {
      await tx.insert(usuarios).values({ email: 'ana@dyms.local', nombre: 'Ana', rol: 'vendedor' });
      const error = await errorDe(tx, (sp) =>
        sp.insert(usuarios).values({ email: 'ANA@dyms.local', nombre: 'Ana 2', rol: 'vendedor' }),
      );
      expect(error).toBe('usuarios_email_unico');
    });
  });

  it('solo permite una caja abierta a la vez', async () => {
    await enTransaccionRevertida(async (tx) => {
      await tx.insert(cajas).values({ fecha: '2026-11-08', montoInicial: 100000 });
      const error = await errorDe(tx, (sp) => sp.insert(cajas).values({ fecha: '2026-11-08', montoInicial: 50000 }));
      expect(error).toBe('cajas_una_abierta');
    });
  });

  it('no permite stock negativo', async () => {
    await enTransaccionRevertida(async (tx) => {
      const error = await errorDe(tx, (sp) =>
        sp.insert(productos).values({ nombre: 'X', precioVenta: 1, precioMayorista: 1, stock: -1 }),
      );
      expect(error).toBe('productos_stock_no_negativo');
    });
  });

  it('una venta anulada exige motivo y fecha de anulación', async () => {
    await enTransaccionRevertida(async (tx) => {
      const error = await errorDe(tx, (sp) =>
        sp.insert(ventas).values({
          vendedorNombre: 'Test', metodoPago: 'efectivo', subtotal: 100, total: 100, costoTotal: 80,
          gananciaBruta: 20, estado: 'anulada',
        }),
      );
      expect(error).toBe('ventas_anulacion_consistente');
    });
  });

  it('asigna números de ticket consecutivos', async () => {
    await enTransaccionRevertida(async (tx) => {
      const base = { vendedorNombre: 'Test', metodoPago: 'efectivo' as const, subtotal: 100, total: 100, costoTotal: 80, gananciaBruta: 20 };
      const [a] = await tx.insert(ventas).values(base).returning({ numero: ventas.numero });
      const [b] = await tx.insert(ventas).values(base).returning({ numero: ventas.numero });
      expect(b!.numero).toBe(a!.numero + 1);
    });
  });

  it('solo un registro por galpón y día', async () => {
    await enTransaccionRevertida(async (tx) => {
      const [g] = await tx.insert(galpones).values({ nombre: 'G', avesIniciales: 10, fechaLlegada: '2026-11-01' }).returning();
      await tx.insert(galponRegistros).values({ galponId: g!.id, fecha: '2026-11-08', huevos: 5 });
      const error = await errorDe(tx, (sp) => sp.insert(galponRegistros).values({ galponId: g!.id, fecha: '2026-11-08' }));
      expect(error).toBe('galpon_registros_un_dia');
    });
  });
});
