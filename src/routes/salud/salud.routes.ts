import { Router } from 'express';
import { verSalud } from '../../controllers/salud/salud.controller.js';

export const saludRoutes = Router();

saludRoutes.get('/', verSalud);
