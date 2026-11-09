import { z } from 'zod';

export const LIMITE_MAXIMO = 100;

export const paginacionSchema = z.object({
  pagina: z.coerce.number().int().min(1).default(1),
  limite: z.coerce.number().int().min(1).max(LIMITE_MAXIMO).default(20),
});

export type Paginacion = z.infer<typeof paginacionSchema>;

export interface Pagina<T> {
  datos: T[];
  pagina: number;
  limite: number;
  total: number;
  totalPaginas: number;
}

export function offsetDe({ pagina, limite }: Paginacion): number {
  return (pagina - 1) * limite;
}

export function armarPagina<T>(datos: T[], total: number, { pagina, limite }: Paginacion): Pagina<T> {
  return { datos, pagina, limite, total, totalPaginas: Math.ceil(total / limite) };
}
