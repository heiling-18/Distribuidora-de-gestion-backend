/** Error de negocio con código HTTP. El manejador central lo convierte en respuesta JSON. */
export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly codigo: string,
    mensaje: string,
    public readonly detalles?: unknown,
  ) {
    super(mensaje);
    this.name = 'AppError';
  }

  static solicitudInvalida(mensaje: string, detalles?: unknown) {
    return new AppError(400, 'SOLICITUD_INVALIDA', mensaje, detalles);
  }
  static noAutenticado(mensaje = 'Debes iniciar sesión') {
    return new AppError(401, 'NO_AUTENTICADO', mensaje);
  }
  static prohibido(mensaje = 'No tienes permiso para esta acción') {
    return new AppError(403, 'PROHIBIDO', mensaje);
  }
  static noEncontrado(mensaje = 'Recurso no encontrado') {
    return new AppError(404, 'NO_ENCONTRADO', mensaje);
  }
  static conflicto(mensaje: string, detalles?: unknown) {
    return new AppError(409, 'CONFLICTO', mensaje, detalles);
  }
}
