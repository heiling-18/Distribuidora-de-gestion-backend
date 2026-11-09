import { AppError } from './AppError.js';

/** Mensajes para las restricciones únicas de la base. */
const MENSAJES_UNICOS: Record<string, string> = {
  usuarios_email_unico: 'Ya existe un usuario con ese correo',
  productos_codigo_unico: 'Ya existe un producto con ese código',
  clientes_documento_unico: 'Ya existe un cliente con ese documento',
  cajas_una_abierta: 'Ya hay una caja abierta',
  galpon_registros_un_dia: 'Ese galpón ya tiene registro para ese día',
};

interface ErrorPg {
  code: string;
  constraint?: string;
}

export function buscarErrorPg(err: unknown): ErrorPg | undefined {
  // Drizzle envuelve el error de pg en `cause`.
  for (let actual = err, i = 0; actual && i < 3; actual = (actual as { cause?: unknown }).cause, i++) {
    if (typeof actual === 'object' && typeof (actual as ErrorPg).code === 'string' && /^\d{2}[0-9A-Z]{3}$/.test((actual as ErrorPg).code)) {
      return actual as ErrorPg;
    }
  }
  return undefined;
}

/** Convierte errores conocidos de PostgreSQL en AppError. Devuelve undefined si no aplica. */
export function traducirErrorPg(err: unknown): AppError | undefined {
  const pg = buscarErrorPg(err);
  if (!pg) return undefined;

  switch (pg.code) {
    case '23505': // unique_violation
      return AppError.conflicto(MENSAJES_UNICOS[pg.constraint ?? ''] ?? 'Ya existe un registro con esos datos', {
        restriccion: pg.constraint,
      });
    case '23503': // foreign_key_violation
      return AppError.conflicto('El registro está relacionado con otros datos', { restriccion: pg.constraint });
    case '23514': // check_violation
      return AppError.solicitudInvalida('Los datos no cumplen las reglas del negocio', { restriccion: pg.constraint });
    default:
      return undefined;
  }
}
