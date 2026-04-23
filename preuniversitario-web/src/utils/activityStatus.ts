import type { ContenidoLeccion, EntregaActividad, EstadoEntrega, Leccion } from '../types'

export function getEntregaStatus(
  leccion: Leccion,
  contenido: ContenidoLeccion,
  entrega?: EntregaActividad | null,
): EstadoEntrega {
  if (!contenido.acepta_entrega) {
    return entrega?.estado || 'pendiente'
  }

  if (entrega?.nota !== null && entrega?.nota !== undefined) {
    return 'calificado'
  }

  if (entrega?.entregado_en) {
    return 'entregado'
  }

  if (leccion.fecha_entrega) {
    const dueDate = new Date(leccion.fecha_entrega)
    if (!Number.isNaN(dueDate.getTime()) && dueDate.getTime() < Date.now()) {
      return 'vencido'
    }
  }

  return 'pendiente'
}

export function getStatusLabel(status: EstadoEntrega) {
  switch (status) {
    case 'calificado':
      return 'Calificado'
    case 'entregado':
      return 'Entregado'
    case 'vencido':
      return 'Vencido'
    case 'pendiente':
    default:
      return 'Pendiente'
  }
}
