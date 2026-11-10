# DYM'S · API

API de la distribuidora DYM'S: punto de venta, caja, inventario, clientes, gastos, reportes y galpones.
La usa el frontend [Distribuidora-de-gestion](https://github.com/heiling-18/Distribuidora-de-gestion) y reemplaza a Supabase.

**Stack:** Node.js 22+ · Express 5 · TypeScript · PostgreSQL 17 · Drizzle ORM · Zod · Vitest

---

## Puesta en marcha (desarrollo)

**Requisitos:** Node.js 22 o superior y PostgreSQL 17 corriendo en `localhost:5432`.

```bash
npm install
cp .env.example .env          # y completa los valores (ver abajo)
```

Crea el usuario `dyms` y las bases `dyms_dev` y `dyms_test` (una sola vez por máquina; pide la clave del usuario `postgres`):

```bash
powershell -ExecutionPolicy Bypass -File scripts/crear-bd-local.ps1
```

Crea las tablas, los usuarios de prueba y arranca (la base queda sin productos, clientes ni galpones):

```bash
npm run db:migrate
npm run db:seed
npm run dev                   # http://localhost:4000/api/health
```

### Usuarios de prueba (solo desarrollo)

`npm run db:seed` crea `admin@dyms.local`, `vendedor@dyms.local` y `galponero@dyms.local`, todos con la clave de `SEED_PASSWORD` del `.env`.
El seed se niega a correr en producción.

---

## Variables de entorno

| Variable | Para qué |
|---|---|
| `NODE_ENV` | `development`, `test` o `production` |
| `PORT` | Puerto de la API (4000) |
| `DATABASE_URL` | Base de desarrollo o producción |
| `DATABASE_URL_TEST` | Base de los tests. **Debe terminar en `_test`**: los tests la vacían |
| `CORS_ORIGIN` | Origen del frontend (separados por coma) |
| `JWT_SECRET` | Firma de las sesiones, mínimo 32 caracteres |
| `SESION_HORAS` | Duración de la sesión (12) |
| `COOKIE_SAMESITE` | `lax` si frontend y API comparten dominio; `none` si no (exige HTTPS) |
| `TZ_NEGOCIO` | Zona horaria del negocio (`America/Bogota`) |
| `LOG_LEVEL` | Nivel de logs (`info`) |
| `SEED_PASSWORD` | Clave de los usuarios de prueba |

Si falta o está mal una variable, la API no arranca y dice cuál.

---

## Scripts

| Comando | Qué hace |
|---|---|
| `npm run dev` | API con recarga automática |
| `npm run build` / `npm start` | Compila a `dist/` (incluye las migraciones) y arranca la versión compilada |
| `npm test` | Tests de integración contra `dyms_test` (se migra sola antes) |
| `npm run typecheck` | Revisión de tipos |
| `npm run db:generate` | Crea una migración nueva a partir de los cambios en `src/models` |
| `npm run db:migrate` | Aplica las migraciones pendientes (desarrollo) |
| `npm run db:migrate:prod` | Igual, pero sobre el build: para el servidor de producción |
| `npm run db:seed` | Usuarios de prueba y configuración base (solo desarrollo) |

**Reglas de migraciones:** siempre `db:generate` + revisar el SQL generado + `db:migrate`. Nunca `drizzle-kit push` contra producción, y ninguna migración con `DROP`, `TRUNCATE` o `DELETE` sin revisión.

---

## Estructura

Capas, y dentro de cada una una carpeta por módulo:

```
src/
  config/        variables de entorno validadas, opciones de la cookie de sesión
  routes/        URL → middlewares → controlador     (index.ts monta todo bajo /api)
  controllers/   lee la petición y responde
  services/      reglas de negocio y transacciones
  repositories/  consultas a la base (Drizzle)
  models/        esquema de las tablas (Drizzle)
  validators/    esquemas Zod de entrada
  middlewares/   autenticación y roles, errores, seguridad, validación
  utils/         errores, fechas (hora de Colombia), contraseñas, JWT, paginación, logger
  interfaces/    tipos compartidos
  database/      conexión, migraciones y scripts (migrar, seed)
tests/
  unit/  integration/  database/  helpers/  setup/
```

Un módulo nuevo lleva su carpeta en `routes`, `controllers`, `services`, `repositories` y `validators`.

---

## Endpoints

Todo vive bajo `/api`. Salvo `/health` y `/auth/login|logout`, **todo exige sesión** (denegado por defecto).

| Módulo | Rutas | Roles |
|---|---|---|
| Salud | `GET /health` (estado de la base y de las migraciones: `ultima`, `pendientes`) | público |
| Auth | `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`, `POST /auth/cambiar-clave` | público / con sesión |
| Usuarios | `GET,POST /usuarios`, `GET,PATCH /usuarios/:id`, `POST /usuarios/:id/restablecer-clave` | admin |
| Caja | `GET /caja/actual`, `GET /caja/actual/resumen`, `POST /caja/abrir`, `POST /caja/cerrar`, `GET /caja/cierres[/:id]` | admin, vendedor |
| Ventas | `POST /ventas`, `GET /ventas[/:id]`, `POST /ventas/:id/anular` | admin, vendedor |
| Productos | `GET /productos[/:id]`; `POST`, `PATCH`, `DELETE`, `POST /:id/ajuste-stock`, `GET /:id/movimientos` (admin) | admin, vendedor |
| Clientes | `GET,POST /clientes`, `GET,PATCH /clientes/:id`; `DELETE` (admin) | admin, vendedor |
| Gastos | `GET,POST /gastos`, `GET,PATCH,DELETE /gastos/:id` | admin |
| Reportes | `GET /reportes/dashboard` (admin, vendedor; incluye `acumulado` de todos los meses); `GET /reportes/mes`, `GET /reportes/historico` (con `primerMes` y `ultimos12Meses`), `GET,POST /reportes/cierres-mes` (actas y meses `porCerrar`) (admin) | |
| Galpones | `GET /galpones`, `GET /galpones/registros`, `PUT /galpones/:id/registros/:fecha`; crear, editar y borrar (admin) | admin, galponero |
| Configuración | `GET /configuracion`; `PATCH` (admin) | con sesión |

Los errores siempre llegan como `{ "error": { "codigo", "mensaje", "detalles" } }`.

---

## Reglas de negocio importantes

- **Sesión:** JWT en cookie `httpOnly`. Cambiar la clave, el rol o desactivar a un usuario cierra sus sesiones al instante. Las claves bcrypt importadas de Supabase sirven y se pasan a argon2 en el primer login.
- **Caja:** solo una abierta a la vez. El efectivo esperado y la diferencia los calcula el servidor; el cierre es atómico.
- **Ventas:** el precio y los totales salen de la base (el cliente solo manda producto, cantidad y tipo de precio). **Los precios incluyen IVA**: el IVA se separa del total, no se suma. Exige caja abierta, bloquea el stock por fila y usa una clave de idempotencia para no duplicar ventas.
- **Anulación:** admin o vendedor, con motivo obligatorio y registro en la auditoría; devuelve el stock por producto. Se puede anular aunque la caja de la venta ya se cerró (el acta de ese cierre no cambia). Solo se bloquea si **el mes ya se cerró**.
- **Gastos:** un gasto en efectivo de hoy se liga a la caja abierta y se descuenta del arqueo. Si no hay caja abierta se guarda igual y la respuesta trae un `aviso`.
- **Costos:** el precio de compra, el costo y la ganancia solo los ve el administrador.
- **Inventario:** el stock nunca se escribe directo; todo cambio queda en `inventario_movimientos` (venta, anulación, compra, ajuste).
- **Fechas:** "hoy" y "mes" siempre en hora de Colombia, nunca UTC.
- **Auditoría:** logins, anulaciones, cambios de precio y stock, cierres, usuarios y configuración quedan en la tabla `auditoria`.

---

## Producción

1. PostgreSQL administrado con **backups automáticos diarios**, y una restauración probada antes del corte.
2. Variables de entorno con `NODE_ENV=production`, un `JWT_SECRET` nuevo de 64 caracteres o más y `TZ_NEGOCIO=America/Bogota`.
3. `npm ci && npm run build && npm run db:migrate:prod && npm start`. Después, `GET /api/health` debe decir `pendientes: 0`.
4. Servir detrás de HTTPS.

### Conectar la página (Vercel)

La sesión viaja en una cookie, así que el dominio decide la configuración.

- **Recomendado: mismo dominio.** La página reenvía `/api/*` a esta API con `rewrites()` en `next.config.ts`. La cookie queda en el dominio de la página y basta `COOKIE_SAMESITE=lax`. El límite de peticiones cuenta por sesión, no por IP, justamente por este reenvío.
- **Dominios distintos:** `COOKIE_SAMESITE=none` (exige HTTPS).

En los dos casos, `CORS_ORIGIN` debe tener el dominio exacto de la página (y el de vista previa si se usa): la API rechaza con 403 cualquier `POST`, `PATCH`, `PUT` o `DELETE` cuyo `Origin` no esté en esa lista (protección CSRF). El reenvío de Next conserva el `Origin` del navegador.

**Corte:** congelar ventas en Supabase, importar, conciliar, apuntar la página a la API y dejar Supabase en solo lectura una semana por si hay que volver.

### Pendiente antes de reemplazar Supabase

- Importar los datos de Supabase (backup `pg_dump`, script de importación y conciliación de conteos y totales).
- Probar en un entorno de staging con los usuarios reales.
