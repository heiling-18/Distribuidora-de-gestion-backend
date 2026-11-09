import { Router } from 'express';
import * as auth from '../../controllers/auth/auth.controller.js';
import { autenticar } from '../../middlewares/auth/autenticar.js';
import { limiteLogin } from '../../middlewares/seguridad/seguridad.js';
import { validar } from '../../middlewares/validacion/validar.js';
import { cambiarClaveSchema, loginSchema } from '../../validators/auth/auth.validator.js';

export const authRoutes = Router();

// Públicas
authRoutes.post('/login', limiteLogin, validar({ body: loginSchema }), auth.login);
authRoutes.post('/logout', auth.logout);

// Con sesión
authRoutes.get('/me', autenticar, auth.yo);
authRoutes.post('/cambiar-clave', autenticar, validar({ body: cambiarClaveSchema }), auth.cambiarClave);
