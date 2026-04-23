import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useParams } from 'react-router-dom'
import { supabase } from '../services/supabaseClient'
import { formatDateTime } from '../utils/dates'
import { getEntregaStatus, getStatusLabel } from '../utils/activityStatus'
import { isSafeHttpUrl, MAX_PDF_SIZE_BYTES, sanitizeFileName } from '../utils/security'
import type {
  ContenidoLeccion,
  EntregaActividad,
  Leccion,
  TipoContenido,
} from '../types'

interface LeccionExtendida extends Leccion {
  contenidos: ContenidoLeccion[]
}

interface EntregaFormState {
  comentario: string
  file: File | null
}

const TYPE_LABELS: Record<TipoContenido, string> = {
  guia: 'Guia de estudio',
  simulador: 'Simulador',
  prueba: 'Prueba',
  video: 'Video',
  enlace: 'Enlace',
}

export default function Curso() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [lecciones, setLecciones] = useState<LeccionExtendida[]>([])
  const [entregas, setEntregas] = useState<EntregaActividad[]>([])
  const [mensaje, setMensaje] = useState('')
  const [openingKey, setOpeningKey] = useState<string | null>(null)
  const [submittingId, setSubmittingId] = useState<number | null>(null)
  const [forms, setForms] = useState<Record<number, EntregaFormState>>({})

  useEffect(() => {
    void getLecciones()
  }, [id])

  const totalPendientes = useMemo(() => {
    return lecciones.flatMap((leccion) =>
      leccion.contenidos.filter((contenido) => {
        const entrega = entregas.find((item) => item.contenido_id === contenido.id)
        return contenido.acepta_entrega && getEntregaStatus(leccion, contenido, entrega) === 'pendiente'
      }),
    ).length
  }, [lecciones, entregas])

  const getLecciones = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser()

    const requests = [
      supabase
        .from('lecciones')
        .select('*')
        .eq('curso_id', id)
        .order('orden', { ascending: true })
        .order('id', { ascending: true }),
      supabase
        .from('leccion_contenidos')
        .select('*')
        .order('orden', { ascending: true })
        .order('id', { ascending: true }),
    ]

    if (user) {
      requests.push(
        supabase
          .from('entregas_actividades')
          .select('*')
          .eq('estudiante_id', user.id)
          .order('created_at', { ascending: false }),
      )
    }

    const results = await Promise.all(requests)
    const lessonResult = results[0]
    const contentResult = results[1]
    const entregaResult = results[2]

    if (lessonResult.error || contentResult.error || entregaResult?.error) {
      console.log(lessonResult.error || contentResult.error || entregaResult?.error)
      setMensaje('No se pudo cargar el contenido del curso.')
      return
    }

    const contentByLesson = new Map<number, ContenidoLeccion[]>()

    ;(contentResult.data || []).forEach((contenido: ContenidoLeccion) => {
      const current = contentByLesson.get(contenido.leccion_id) || []
      current.push(contenido)
      contentByLesson.set(contenido.leccion_id, current)
    })

    const leccionesConContenido = (lessonResult.data || []).map((leccion: Leccion) => ({
      ...leccion,
      contenidos: contentByLesson.get(leccion.id) || [],
    }))

    setLecciones(leccionesConContenido)
    setEntregas((entregaResult?.data as EntregaActividad[]) || [])
  }

  const openStorageFile = async (path: string, openingId: string) => {
    setOpeningKey(openingId)

    const { data, error } = await supabase.storage.from('archivos').download(path)

    if (error || !data) {
      console.log(error)
      setMensaje(
        'No se pudo abrir el archivo. Revisa si existe en Storage y si la policy permite leerlo.',
      )
      setOpeningKey(null)
      return
    }

    const blobUrl = URL.createObjectURL(data)
    window.open(blobUrl, '_blank', 'noopener,noreferrer')
    setOpeningKey(null)

    window.setTimeout(() => {
      URL.revokeObjectURL(blobUrl)
    }, 60000)
  }

  const abrirRecurso = async (
    url: string | null | undefined,
    openingId: string,
  ) => {
    if (!url) {
      setMensaje('Este recurso no tiene archivo o enlace disponible.')
      return
    }

    setMensaje('')

    if (isSafeHttpUrl(url)) {
      window.open(url, '_blank', 'noopener,noreferrer')
      return
    }

    await openStorageFile(url, openingId)
  }

  const setEntregaForm = (contenidoId: number, patch: Partial<EntregaFormState>) => {
    setForms((current) => ({
      ...current,
      [contenidoId]: {
        comentario: current[contenidoId]?.comentario || '',
        file: current[contenidoId]?.file || null,
        ...patch,
      },
    }))
  }

  const subirEntrega = async (leccion: Leccion, contenido: ContenidoLeccion) => {
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      setMensaje('Debes iniciar sesion para entregar actividades.')
      return
    }

    const form = forms[contenido.id] || { comentario: '', file: null }
    if (!form.file && !form.comentario.trim()) {
      setMensaje('Adjunta un archivo o escribe un comentario para tu entrega.')
      return
    }

    if (form.file && form.file.size > MAX_PDF_SIZE_BYTES) {
      setMensaje('El archivo de entrega no puede superar los 10 MB.')
      return
    }

    setSubmittingId(contenido.id)
    let archivoUrl = entregas.find((item) => item.contenido_id === contenido.id)?.archivo_url || null

    if (form.file) {
      const fileName = sanitizeFileName(`${Date.now()}_${form.file.name}`)
      const filePath = `${user.id}/entregas/${contenido.id}/${fileName}`
      const { error } = await supabase.storage
        .from('archivos')
        .upload(filePath, form.file, {
          cacheControl: '3600',
          contentType: form.file.type || 'application/octet-stream',
          upsert: false,
        })

      if (error) {
        console.log(error)
        setMensaje('No se pudo subir el archivo de entrega.')
        setSubmittingId(null)
        return
      }

      archivoUrl = filePath
    }

    const status = getEntregaStatus(leccion, contenido, null)
    const payload = {
      contenido_id: contenido.id,
      estudiante_id: user.id,
      archivo_url: archivoUrl,
      comentario: form.comentario.trim(),
      estado: status === 'vencido' ? 'vencido' : 'entregado',
      entregado_en: new Date().toISOString(),
    }

    const { error } = await supabase
      .from('entregas_actividades')
      .upsert(payload, { onConflict: 'contenido_id,estudiante_id' })

    if (error) {
      console.log(error)
      setMensaje('No se pudo registrar la entrega.')
      setSubmittingId(null)
      return
    }

    setForms((current) => ({
      ...current,
      [contenido.id]: { comentario: '', file: null },
    }))
    setSubmittingId(null)
    setMensaje('Entrega registrada con exito.')
    await getLecciones()
  }

  const getActionLabel = (tipo: TipoContenido) => {
    switch (tipo) {
      case 'guia':
        return 'Abrir guia'
      case 'simulador':
        return 'Abrir simulador'
      case 'prueba':
        return 'Abrir prueba'
      case 'video':
        return 'Abrir video'
      case 'enlace':
        return 'Abrir enlace'
      default:
        return 'Abrir recurso'
    }
  }

  return (
    <div className="container course-view-shell">
      <section className="course-page-hero">
        <div>
          <p className="dashboard-eyebrow">Ruta del estudiante</p>
          <h2>Contenido del curso</h2>
          <p className="dashboard-copy">
            Explora cada clase como un modulo con recursos, actividades y materiales de apoyo.
          </p>
        </div>
        <div className="course-page-highlight">
          <span>Entregas pendientes</span>
          <strong>{totalPendientes}</strong>
        </div>
      </section>

      {mensaje && (
        <p className={`feedback-banner ${mensaje.includes('exito') ? 'success' : 'error'}`}>
          {mensaje}
        </p>
      )}

      <div className="module-grid">
        {lecciones.map((leccion) => (
          <section key={leccion.id} className="curso-card module-card">
            <div className="module-header">
              <div>
                <p className="module-badge">Clase</p>
                <h3>{leccion.titulo}</h3>
              </div>
              <p className="module-deadline">
                Entrega maxima: {formatDateTime(leccion.fecha_entrega)}
              </p>
            </div>

            <p className="module-description">
              {leccion.descripcion || 'Sin descripcion para esta clase.'}
            </p>

            <div className="resource-list">
              {leccion.video_url && (
                <button
                  className="resource-button"
                  onClick={() => void abrirRecurso(leccion.video_url, `video-${leccion.id}`)}
                >
                  Abrir video principal
                </button>
              )}

              {leccion.pdf_url && (
                <button
                  className="resource-button"
                  onClick={() => void abrirRecurso(leccion.pdf_url, `pdf-${leccion.id}`)}
                >
                  {openingKey === `pdf-${leccion.id}` ? 'Abriendo...' : 'Abrir material base'}
                </button>
              )}

              {leccion.contenidos.length === 0 && (
                <p className="empty-state">Esta clase aun no tiene contenidos adicionales.</p>
              )}

              {leccion.contenidos.map((contenido) => {
                const actionKey = `contenido-${contenido.id}`
                const entrega = entregas.find((item) => item.contenido_id === contenido.id)
                const status = getEntregaStatus(leccion, contenido, entrega)
                const form = forms[contenido.id] || { comentario: '', file: null }

                return (
                  <article key={contenido.id} className="resource-card stacked">
                    <div className="resource-main">
                      <div className="resource-heading">
                        <p className="resource-type">{TYPE_LABELS[contenido.tipo]}</p>
                        <span className={`status-pill ${status}`}>
                          {getStatusLabel(status)}
                        </span>
                      </div>
                      <h4>{contenido.orden}. {contenido.titulo}</h4>
                      <p>{contenido.descripcion || 'Sin descripcion.'}</p>
                      {entrega?.nota !== null && entrega?.nota !== undefined && (
                        <p><strong>Nota:</strong> {entrega.nota}</p>
                      )}
                      {entrega?.retroalimentacion && (
                        <p><strong>Retroalimentacion:</strong> {entrega.retroalimentacion}</p>
                      )}
                    </div>

                    <div className="resource-actions-column">
                      <button
                        className="resource-button module-action-button"
                        onClick={() =>
                          contenido.tipo === 'simulador'
                            ? navigate(`/simulador/${contenido.id}`)
                            : void abrirRecurso(contenido.contenido_url, actionKey)
                        }
                      >
                        {openingKey === actionKey
                          ? 'Abriendo...'
                          : getActionLabel(contenido.tipo)}
                      </button>

                      {contenido.acepta_entrega && (
                        <div className="submission-form">
                          <textarea
                            rows={3}
                            placeholder="Comentario de la entrega"
                            value={form.comentario}
                            onChange={(event) =>
                              setEntregaForm(contenido.id, { comentario: event.target.value })
                            }
                          />
                          <input
                            type="file"
                            onChange={(event) =>
                              setEntregaForm(contenido.id, {
                                file: event.target.files?.[0] || null,
                              })
                            }
                          />
                          <button
                            className="resource-button secondary"
                            onClick={() => void subirEntrega(leccion, contenido)}
                            disabled={submittingId === contenido.id}
                          >
                            {submittingId === contenido.id ? 'Enviando...' : 'Entregar actividad'}
                          </button>
                        </div>
                      )}
                    </div>
                  </article>
                )
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
