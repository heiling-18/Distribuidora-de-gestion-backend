import { Router } from 'express';
import * as usuarios from '../../controllers/usuarios/usuarios.controller.js';
import { requerirRol } from '../../middlewares/auth/autenticar.js';
import { validar } from '../../middlewares/validacion/validar.js';
import { paramId } from '../../validators/comunes/comunes.validator.js';
import { actualizarUsuarioSchema, crearUsuarioSchema, restablecerClaveSchema } from '../../validators/usuarios/usuarios.validator.js';

/** Gestión de usuarios: solo administrador. */
export const usuariosRoutes = Router();

usuariosRoutes.use(requerirRol('admin'));

usuariosRoutes.get('/', usuarios.listar);
usuariosRoutes.post('/', validar({ body: crearUsuarioSchema }), usuarios.crear);
usuariosRoutes.get('/:id', validar({ params: paramId }), usuarios.obtener);
usuariosRoutes.patch('/:id', validar({ params: paramId, body: actualizarUsuarioSchema }), usuarios.actualizar);
usuariosRoutes.post(
  '/:id/restablecer-clave',
  validar({ params: paramId, body: restablecerClaveSchema }),
  usuarios.restablecerClave,
);
