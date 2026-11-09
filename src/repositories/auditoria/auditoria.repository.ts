import { db, type Db, type Tx } from '../../database/client.js';
import { auditoria } from '../../models/index.js';

export interface EventoAuditoria {
  usuarioId: number | null;
  accion: string;
  entidad: string;
  entidadId?: string | number | null;
  antes?: unknown;
  despues?: unknown;
  ip?: string | null;
}

export async function registrarEvento(evento: EventoAuditoria, ej: Db | Tx = db): Promise<void> {
  await ej.insert(auditoria).values({
    usuarioId: evento.usuarioId,
    accion: evento.accion,
    entidad: evento.entidad,
    entidadId: evento.entidadId == null ? null : String(evento.entidadId),
    antes: evento.antes ?? null,
    despues: evento.despues ?? null,
    ip: evento.ip ?? null,
  });
}
