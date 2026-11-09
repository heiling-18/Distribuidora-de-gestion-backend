import { db } from '../../database/client.js';
import type { UsuarioSesion } from '../../interfaces/auth/auth.js';
import { registrarEvento } from '../../repositories/auditoria/auditoria.repository.js';
import * as clientesRepo from '../../repositories/clientes/clientes.repository.js';
import { AppError } from '../../utils/errores/AppError.js';
import { armarPagina } from '../../utils/paginacion/paginacion.js';
import type { ActualizarClienteDto, CrearClienteDto, FiltroClientes } from '../../validators/clientes/clientes.validator.js';

export async function listarClientes(usuario: UsuarioSesion, filtro: FiltroClientes) {
  const efectivo = usuario.rol === 'admin' ? filtro : { ...filtro, activo: 'true' as const };
  const { datos, total } = await clientesRepo.listar(efectivo);
  return armarPagina(datos, total, filtro);
}

export async function obtenerCliente(usuario: UsuarioSesion, id: number) {
  const c = await clientesRepo.buscarPorId(id);
  if (!c || (!c.activo && usuario.rol !== 'admin')) throw AppError.noEncontrado('Cliente no encontrado');
  return c;
}

export async function crearCliente(usuario: UsuarioSesion, dto: CrearClienteDto, ip: string | null) {
  return db.transaction(async (tx) => {
    const c = await clientesRepo.crear(dto, tx);
    await registrarEvento({ usuarioId: usuario.id, accion: 'cliente.crear', entidad: 'cliente', entidadId: c.id, despues: c, ip }, tx);
    return c;
  });
}

export async function actualizarCliente(usuario: UsuarioSesion, id: number, cambios: ActualizarClienteDto, ip: string | null) {
  // Activar o desactivar clientes es cosa del admin.
  if (cambios.activo !== undefined && usuario.rol !== 'admin') throw AppError.prohibido('Solo el administrador puede activar o desactivar clientes');

  return db.transaction(async (tx) => {
    const antes = await clientesRepo.bloquearPorId(id, tx);
    if (!antes || (!antes.activo && usuario.rol !== 'admin')) throw AppError.noEncontrado('Cliente no encontrado');
    const despues = await clientesRepo.actualizar(id, cambios, tx);
    await registrarEvento(
      { usuarioId: usuario.id, accion: 'cliente.actualizar', entidad: 'cliente', entidadId: id, antes, despues, ip },
      tx,
    );
    return despues;
  });
}

/** Borrado lógico: sus ventas conservan el nombre y documento con que se hicieron. */
export function desactivarCliente(admin: UsuarioSesion, id: number, ip: string | null) {
  return actualizarCliente(admin, id, { activo: false }, ip);
}
