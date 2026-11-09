import { sql, type SQL } from 'drizzle-orm';
import { env } from '../../config/env.js';

/**
 * Zona horaria como literal SQL (no como parámetro): así PostgreSQL reconoce que la expresión
 * del SELECT y la del GROUP BY son la misma. Viene de la configuración, no del usuario.
 */
const zona = sql.raw(`'${env.TZ_NEGOCIO.replace(/'/g, "''")}'`);

/**
 * Medianoche de un día del negocio (America/Bogota) como instante.
 * Comparar `fecha >= inicioDelDia(...)` usa el índice de la columna, a diferencia de convertir cada fila.
 */
export function inicioDelDia(dia: string): SQL {
  return sql`(${dia}::date)::timestamp at time zone ${zona}`;
}

/** Día del negocio de una columna timestamptz, como date. */
export function diaNegocio(columna: SQL | unknown): SQL {
  return sql`(${columna} at time zone ${zona})::date`;
}
