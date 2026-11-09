import { db } from '../../database/client.js';
import type { UsuarioSesion } from '../../interfaces/auth/auth.js';
import { registrarEvento } from '../../repositories/auditoria/auditoria.repository.js';
import * as galponesRepo from '../../repositories/galpones/galpones.repository.js';
import { AppError } from '../../utils/errores/AppError.js';
import { diasEntre, fechaNegocio } from '../../utils/fecha/fecha.js';
import { armarPagina } from '../../utils/paginacion/paginacion.js';
import type {
  ActualizarGalponDto,
  CrearGalponDto,
  FiltroRegistros,
  GuardarRegistroDto,
} from '../../validators/galpones/galpones.validator.js';

export const HUEVOS_POR_CARTON = 30;
export const KG_POR_BULTO = 40;

/** Datos calculados que la interfaz necesita: aves vivas, edad y alimento sugerido para hoy. */
function conCalculos(g: galponesRepo.FilaGalpon, muertasTotales: number, registradoHoy: boolean, hoy: string) {
  const avesVivas = Math.max(0, g.avesIniciales - muertasTotales);
  const alimentoSugeridoKg = Math.round(((avesVivas * g.gramosAveDia) / 1000) * 10) / 10;
  return {
    ...g,
    avesVivas,
    muertasTotales,
    edadSemanas: g.edadSemanasLlegada + Math.floor(Math.max(0, diasEntre(g.fechaLlegada, hoy)) / 7),
    alimentoSugeridoKg,
    alimentoSugeridoBultos: Math.round((alimentoSugeridoKg / KG_POR_BULTO) * 100) / 100,
    registradoHoy,
  };
}

export async function listarGalpones(usuario: UsuarioSesion, activo: 'true' | 'false' | 'todos') {
  const hoy = fechaNegocio();
  const filas = await galponesRepo.listarConTotales(usuario.rol === 'admin' ? activo : 'true', hoy);
  return filas.map((f) => conCalculos(f.galpon, f.muertasTotales, f.registradoHoy > 0, hoy));
}

export async function crearGalpon(admin: UsuarioSesion, dto: CrearGalponDto, ip: string | null) {
  if (dto.fechaLlegada > fechaNegocio()) throw AppError.solicitudInvalida('La fecha de llegada no puede ser futura');
  return db.transaction(async (tx) => {
    const g = await galponesRepo.crear(dto, tx);
    await registrarEvento({ usuarioId: admin.id, accion: 'galpon.crear', entidad: 'galpon', entidadId: g.id, despues: g, ip }, tx);
    return g;
  });
}

export async function actualizarGalpon(admin: UsuarioSesion, id: number, cambios: ActualizarGalponDto, ip: string | null) {
  if (cambios.fechaLlegada && cambios.fechaLlegada > fechaNegocio()) throw AppError.solicitudInvalida('La fecha de llegada no puede ser futura');
  return db.transaction(async (tx) => {
    const antes = await galponesRepo.bloquearPorId(id, tx);
    if (!antes) throw AppError.noEncontrado('Galpón no encontrado');
    if (cambios.avesIniciales !== undefined) {
      const muertas = await galponesRepo.muertasAcumuladas(id, {}, tx);
      if (cambios.avesIniciales < muertas) throw AppError.conflicto(`Ya hay ${muertas} aves muertas registradas; las aves iniciales no pueden ser menos`);
    }
    const despues = await galponesRepo.actualizar(id, cambios, tx);
    await registrarEvento({ usuarioId: admin.id, accion: 'galpon.actualizar', entidad: 'galpon', entidadId: id, antes, despues, ip }, tx);
    return despues;
  });
}

/** Solo se borran galpones sin registros (creados por error). Los demás se desactivan. */
export async function eliminarGalpon(admin: UsuarioSesion, id: number, ip: string | null) {
  await db.transaction(async (tx) => {
    const g = await galponesRepo.bloquearPorId(id, tx);
    if (!g) throw AppError.noEncontrado('Galpón no encontrado');
    if ((await galponesRepo.contarRegistros(id, tx)) > 0) {
      throw AppError.conflicto('Este galpón tiene registros diarios: desactívalo en lugar de borrarlo');
    }
    await galponesRepo.eliminar(id, tx);
    await registrarEvento({ usuarioId: admin.id, accion: 'galpon.eliminar', entidad: 'galpon', entidadId: id, antes: g, ip }, tx);
  });
}

/**
 * Registra (o corrige) el día de un galpón. El galponero solo puede anotar el día de hoy;
 * el administrador puede corregir cualquier día pasado.
 */
export async function guardarRegistro(usuario: UsuarioSesion, galponId: number, fecha: string, dto: GuardarRegistroDto) {
  const hoy = fechaNegocio();
  if (fecha > hoy) throw AppError.solicitudInvalida('No se pueden registrar días futuros');
  if (usuario.rol !== 'admin' && fecha !== hoy) throw AppError.prohibido('Solo puedes registrar el día de hoy');

  return db.transaction(async (tx) => {
    const g = await galponesRepo.bloquearPorId(galponId, tx);
    if (!g || (!g.activo && usuario.rol !== 'admin')) throw AppError.noEncontrado('Galpón no encontrado');
    if (fecha < g.fechaLlegada) throw AppError.solicitudInvalida('La fecha es anterior a la llegada de las aves');

    const muertasPrevias = await galponesRepo.muertasAcumuladas(galponId, { sinElDia: fecha }, tx);
    if (muertasPrevias + dto.muertas > g.avesIniciales) {
      throw AppError.conflicto(`Solo quedan ${g.avesIniciales - muertasPrevias} aves vivas en este galpón`);
    }

    return galponesRepo.guardarRegistro(
      { galponId, fecha, ...dto, registradoPor: usuario.id, registradoPorNombre: usuario.nombre },
      tx,
    );
  });
}

export async function eliminarRegistro(admin: UsuarioSesion, id: number, ip: string | null) {
  await db.transaction(async (tx) => {
    const r = await galponesRepo.buscarRegistro(id, tx);
    if (!r) throw AppError.noEncontrado('Registro no encontrado');
    await galponesRepo.eliminarRegistro(id, tx);
    await registrarEvento({ usuarioId: admin.id, accion: 'galpon.eliminar_registro', entidad: 'galpon_registro', entidadId: id, antes: r, ip }, tx);
  });
}

export async function listarRegistros(filtro: FiltroRegistros) {
  const { datos, total, totales } = await galponesRepo.listarRegistros(filtro);
  return {
    ...armarPagina(datos, total, filtro),
    totales: { ...totales, cartones: Math.floor(totales.huevos / HUEVOS_POR_CARTON) },
  };
}
