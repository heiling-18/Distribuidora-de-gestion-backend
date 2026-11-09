/** Patrón para ILIKE que trata %, _ y \ escritos por el usuario como texto literal. */
export function patronContiene(texto: string): string {
  return `%${texto.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}
