

export interface Curso {
  id: number
  nombre: string
  descripcion: string
}

export interface Perfil {
  id: string
  rol: 'admin' | 'estudiante'
}

export interface Leccion {
  id: number
  curso_id: number
  titulo: string
  descripcion?: string | null
  video_url: string
  pdf_url: string
  orden?: number
  fecha_entrega?: string | null
  created_at?: string
  updated_at?: string
}

export type TipoContenido =
  | 'guia'
  | 'simulador'
  | 'prueba'
  | 'video'
  | 'enlace'

export interface ContenidoLeccion {
  id: number
  leccion_id: number
  titulo: string
  descripcion?: string | null
  tipo: TipoContenido
  contenido_url?: string | null
  orden: number
  acepta_entrega?: boolean
  created_at?: string
  updated_at?: string
}

export type EstadoEntrega =
  | 'pendiente'
  | 'entregado'
  | 'vencido'
  | 'calificado'

export interface EntregaActividad {
  id: number
  contenido_id: number
  estudiante_id: string
  archivo_url?: string | null
  comentario?: string | null
  nota?: number | null
  retroalimentacion?: string | null
  estado: EstadoEntrega
  entregado_en?: string | null
  calificado_en?: string | null
  created_at?: string
  updated_at?: string
}

export interface Simulador {
  id: number
  contenido_id: number
  titulo?: string | null
  instrucciones?: string | null
  duracion_minutos: number
  mostrar_resultado_inmediato: boolean
  mezclar_preguntas: boolean
  created_at?: string
  updated_at?: string
}

export interface SimuladorPregunta {
  id: number
  simulador_id: number
  enunciado: string
  opcion_a: string
  opcion_b: string
  opcion_c?: string | null
  opcion_d?: string | null
  respuesta_correcta: 'A' | 'B' | 'C' | 'D'
  explicacion?: string | null
  orden: number
  created_at?: string
  updated_at?: string
}

export interface SimuladorIntento {
  id: number
  simulador_id: number
  estudiante_id: string
  puntaje: number
  total_preguntas: number
  tiempo_segundos?: number | null
  completado_en?: string | null
  respuestas?: Record<string, string> | null
  created_at?: string
  updated_at?: string
}
