/** Forma de todas las respuestas de error de la API. */
export interface RespuestaError {
  error: {
    codigo: string;
    mensaje: string;
    detalles?: unknown;
  };
}
