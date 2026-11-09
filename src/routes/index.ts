import { Router } from 'express';
import { autenticar } from '../middlewares/auth/autenticar.js';
import { authRoutes } from './auth/auth.routes.js';
import { cajaRoutes } from './caja/caja.routes.js';
import { clientesRoutes } from './clientes/clientes.routes.js';
import { configuracionRoutes } from './configuracion/configuracion.routes.js';
import { galponesRoutes } from './galpones/galpones.routes.js';
import { gastosRoutes } from './gastos/gastos.routes.js';
import { productosRoutes } from './productos/productos.routes.js';
import { reportesRoutes } from './reportes/reportes.routes.js';
import { saludRoutes } from './salud/salud.routes.js';
import { usuariosRoutes } from './usuarios/usuarios.routes.js';
import { ventasRoutes } from './ventas/ventas.routes.js';

/** Todas las rutas de la API, montadas bajo /api. */
export const rutas = Router();

// ---- Públicas ----
rutas.use('/health', saludRoutes);
rutas.use('/auth', authRoutes);

// ---- Todo lo de aquí para abajo exige sesión (denegado por defecto) ----
rutas.use(autenticar);

rutas.use('/usuarios', usuariosRoutes);
rutas.use('/caja', cajaRoutes);
rutas.use('/ventas', ventasRoutes);
rutas.use('/productos', productosRoutes);
rutas.use('/clientes', clientesRoutes);
rutas.use('/gastos', gastosRoutes);
rutas.use('/reportes', reportesRoutes);
rutas.use('/galpones', galponesRoutes);
rutas.use('/configuracion', configuracionRoutes);
