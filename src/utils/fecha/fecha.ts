import { env } from '../../config/env.js';

// en-CA formatea como YYYY-MM-DD.
const formatoDia = new Intl.DateTimeFormat('en-CA', {
  timeZone: env.TZ_NEGOCIO,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Día calendario del negocio (America/Bogota), "YYYY-MM-DD". Nunca usar toISOString() para esto. */
export function fechaNegocio(instante: Date = new Date()): string {
  return formatoDia.format(instante);
}

/** Mes de un día del calendario: "2026-11-08" pasa a "2026-11-01". */
export function mesDeDia(dia: string): string {
  return `${dia.slice(0, 7)}-01`;
}

/** Primer día del mes siguiente: "2026-12-01" pasa a "2027-01-01". */
export function mesSiguiente(mes: string): string {
  const [a, m] = mes.split('-').map(Number) as [number, number];
  return m === 12 ? `${a + 1}-01-01` : `${a}-${String(m + 1).padStart(2, '0')}-01`;
}

/** Suma (o resta) días a una fecha "YYYY-MM-DD". */
export function sumarDias(dia: string, dias: number): string {
  return new Date(Date.parse(`${dia}T00:00:00Z`) + dias * 86_400_000).toISOString().slice(0, 10);
}

/** Días calendario entre dos fechas "YYYY-MM-DD" (hasta − desde). */
export function diasEntre(desde: string, hasta: string): number {
  return Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / 86_400_000);
}

/** Primer día del mes del negocio, "YYYY-MM-01". */
export function mesNegocio(instante: Date = new Date()): string {
  return `${fechaNegocio(instante).slice(0, 7)}-01`;
}
