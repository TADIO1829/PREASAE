import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import MathContent from '../components/MathContent'
import ResourceImage from '../components/ResourceImage'
import { supabase } from '../services/supabaseClient'
import {
  isImageFile,
  isImageResource,
  isPdfOrImageFile,
  isSafeHttpUrl,
  MAX_UPLOAD_SIZE_BYTES,
  normalizeText,
  sanitizeFileName,
} from '../utils/security'
import { fromDateTimeLocalValue, toDateTimeLocalValue } from '../utils/dates'
import { getEntregaStatus, getStatusLabel } from '../utils/activityStatus'
import type {
  ContenidoLeccion,
  Curso,
  EntregaActividad,
  Leccion,
  Simulador,
  SimuladorIntento,
  SimuladorPregunta,
  TipoContenido,
} from '../types'

interface LeccionFormState {
  titulo: string
  descripcion: string
  videoUrl: string
  fechaEntrega: string
}

interface ContenidoFormState {
  titulo: string
  descripcion: string
  tipo: TipoContenido
  contenidoUrl: string
  orden: string
  aceptaEntrega: boolean
  simuladorBaseId: string
}

interface RevisionFormState {
  nota: string
  retroalimentacion: string
}

const INITIAL_LECCION_FORM: LeccionFormState = {
  titulo: '',
  descripcion: '',
  videoUrl: '',
  fechaEntrega: '',
}

const INITIAL_CONTENIDO_FORM: ContenidoFormState = {
  titulo: '',
  descripcion: '',
  tipo: 'guia',
  contenidoUrl: '',
  orden: '1',
  aceptaEntrega: false,
  simuladorBaseId: '',
}

const CONTENT_TYPES: Array<{ value: TipoContenido; label: string }> = [
  { value: 'guia', label: 'Guia de estudio' },
  { value: 'simulador', label: 'Simulador' },
  { value: 'prueba', label: 'Prueba' },
  { value: 'video', label: 'Video' },
  { value: 'enlace', label: 'Enlace externo' },
]

export default function AdminCurso() {
  const { id } = useParams()
  const navigate = useNavigate()
  const cursoId = Number(id)

  const [curso, setCurso] = useState<Curso | null>(null)
  const [lecciones, setLecciones] = useState<Leccion[]>([])
  const [contenidos, setContenidos] = useState<ContenidoLeccion[]>([])
  const [entregas, setEntregas] = useState<EntregaActividad[]>([])
  const [simuladores, setSimuladores] = useState<Simulador[]>([])
  const [simuladorIntentos, setSimuladorIntentos] = useState<SimuladorIntento[]>([])
  const [simuladorPreguntas, setSimuladorPreguntas] = useState<SimuladorPregunta[]>([])
  const [lessonForm, setLessonForm] = useState<LeccionFormState>(INITIAL_LECCION_FORM)
  const [contentForm, setContentForm] = useState<ContenidoFormState>(INITIAL_CONTENIDO_FORM)
  const [selectedLeccionId, setSelectedLeccionId] = useState<number | null>(null)
  const [editingLeccionId, setEditingLeccionId] = useState<number | null>(null)
  const [editingContenidoId, setEditingContenidoId] = useState<number | null>(null)
  const [lessonFile, setLessonFile] = useState<File | null>(null)
  const [resourceFile, setResourceFile] = useState<File | null>(null)
  const [mensaje, setMensaje] = useState('')
  const [isSubmittingLesson, setIsSubmittingLesson] = useState(false)
  const [isSubmittingContent, setIsSubmittingContent] = useState(false)
  const [isSavingRevision, setIsSavingRevision] = useState<number | null>(null)
  const [showLessonForm, setShowLessonForm] = useState(false)
  const [showContentForm, setShowContentForm] = useState(false)
  const [revisionForms, setRevisionForms] = useState<Record<number, RevisionFormState>>({})
  const [lessonPreviewUrl, setLessonPreviewUrl] = useState<string | null>(null)
  const [resourcePreviewUrl, setResourcePreviewUrl] = useState<string | null>(null)

  useEffect(() => {
    void cargarCurso()
  }, [id])

  useEffect(() => {
    if (!lessonFile || !isImageFile(lessonFile)) {
      setLessonPreviewUrl(null)
      return
    }

    const objectUrl = URL.createObjectURL(lessonFile)
    setLessonPreviewUrl(objectUrl)

    return () => URL.revokeObjectURL(objectUrl)
  }, [lessonFile])

  useEffect(() => {
    if (!resourceFile || !isImageFile(resourceFile)) {
      setResourcePreviewUrl(null)
      return
    }

    const objectUrl = URL.createObjectURL(resourceFile)
    setResourcePreviewUrl(objectUrl)

    return () => URL.revokeObjectURL(objectUrl)
  }, [resourceFile])

  const contenidosDeLeccion = useMemo(
    () =>
      contenidos
        .filter((item) => item.leccion_id === selectedLeccionId)
        .sort((a, b) => a.orden - b.orden || a.id - b.id),
    [contenidos, selectedLeccionId],
  )

  const entregasDeLeccion = useMemo(() => {
    const contenidoIds = new Set(contenidosDeLeccion.map((item) => item.id))
    return entregas.filter((item) => contenidoIds.has(item.contenido_id))
  }, [contenidosDeLeccion, entregas])

  const leccionSeleccionada =
    lecciones.find((item) => item.id === selectedLeccionId) || null

  const simuladoresDisponibles = useMemo(
    () =>
      simuladores
        .filter((simulador) => simulador.contenido_id !== editingContenidoId)
        .map((simulador) => {
          const contenidoSimulador = contenidos.find(
            (contenido) => contenido.id === simulador.contenido_id,
          )
          return {
            ...simulador,
            label: contenidoSimulador?.titulo || simulador.titulo || `Simulador ${simulador.id}`,
          }
        }),
    [simuladores, contenidos, editingContenidoId],
  )

  const gradebookRows = useMemo(() => {
    const evaluables = contenidos.filter((contenido) => contenido.acepta_entrega)
    const evaluableIds = new Set(evaluables.map((contenido) => contenido.id))
    const courseEntregas = entregas.filter((entrega) => evaluableIds.has(entrega.contenido_id))
    const byStudent = new Map<string, EntregaActividad[]>()

    courseEntregas.forEach((entrega) => {
      const current = byStudent.get(entrega.estudiante_id) || []
      current.push(entrega)
      byStudent.set(entrega.estudiante_id, current)
    })

    return [...byStudent.entries()]
      .map(([studentId, studentEntregas]) => {
        const graded = studentEntregas.filter(
          (entrega) => entrega.nota !== null && entrega.nota !== undefined,
        )
        const promedio =
          graded.length > 0
            ? graded.reduce((total, entrega) => total + (entrega.nota || 0), 0) / graded.length
            : null

        return {
          studentId,
          totalActividades: evaluables.length,
          entregadas: studentEntregas.length,
          calificadas: graded.length,
          pendientes: Math.max(evaluables.length - studentEntregas.length, 0),
          promedio,
        }
      })
      .sort((a, b) => (b.promedio ?? -1) - (a.promedio ?? -1) || a.studentId.localeCompare(b.studentId))
  }, [contenidos, entregas])

  const shortStudentId = (value: string) => `${value.slice(0, 8)}...`

  const cargarCurso = async () => {
    if (!Number.isInteger(cursoId) || cursoId <= 0) {
      setMensaje('Curso invalido.')
      return
    }

    const [
      { data: cursoData, error: cursoError },
      { data: leccionesData, error: leccionesError },
      { data: contenidosData, error: contenidosError },
      { data: entregasData, error: entregasError },
      { data: simuladoresData, error: simuladoresError },
      { data: simuladorIntentosData, error: simuladorIntentosError },
      { data: simuladorPreguntasData, error: simuladorPreguntasError },
    ] = await Promise.all([
      supabase.from('cursos').select('*').eq('id', cursoId).maybeSingle(),
      supabase
        .from('lecciones')
        .select('*')
        .eq('curso_id', cursoId)
        .order('orden', { ascending: true })
        .order('id', { ascending: true }),
      supabase
        .from('leccion_contenidos')
        .select('*')
        .order('orden', { ascending: true })
        .order('id', { ascending: true }),
      supabase
        .from('entregas_actividades')
        .select('*')
        .order('created_at', { ascending: false }),
      supabase.from('simuladores').select('*').order('created_at', { ascending: false }),
      supabase
        .from('simulador_intentos')
        .select('*')
        .order('created_at', { ascending: false }),
      supabase
        .from('simulador_preguntas')
        .select('*')
        .order('orden', { ascending: true })
        .order('id', { ascending: true }),
    ])

    if (
      cursoError ||
      leccionesError ||
      contenidosError ||
      entregasError ||
      simuladoresError ||
      simuladorIntentosError ||
      simuladorPreguntasError
    ) {
      console.log(
        cursoError ||
        leccionesError ||
        contenidosError ||
        entregasError ||
        simuladoresError ||
        simuladorIntentosError ||
        simuladorPreguntasError,
      )
      setMensaje('No se pudo cargar el panel del curso.')
      return
    }

    setCurso(cursoData || null)
    setLecciones(leccionesData || [])
    setContenidos(contenidosData || [])
    setEntregas(entregasData || [])
    setSimuladores(simuladoresData || [])
    setSimuladorIntentos(simuladorIntentosData || [])
    setSimuladorPreguntas(simuladorPreguntasData || [])
    setSelectedLeccionId((current) => current ?? leccionesData?.[0]?.id ?? null)
  }

  const limpiarMensaje = () => {
    window.setTimeout(() => setMensaje(''), 3500)
  }

  const setRevisionForm = (entregaId: number, patch: Partial<RevisionFormState>) => {
    setRevisionForms((current) => ({
      ...current,
      [entregaId]: {
        nota: current[entregaId]?.nota || '',
        retroalimentacion: current[entregaId]?.retroalimentacion || '',
        ...patch,
      },
    }))
  }

  const getAdminUser = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      setMensaje('Tu sesion expiro. Inicia sesion de nuevo.')
      limpiarMensaje()
      return null
    }

    const { data: profile } = await supabase
      .from('perfiles')
      .select('rol')
      .eq('id', user.id)
      .maybeSingle()

    if (profile?.rol !== 'admin') {
      setMensaje('No tienes permisos para administrar este curso.')
      limpiarMensaje()
      return null
    }

    return user
  }

  const subirArchivo = async (
    userId: string,
    scope: 'lecciones' | 'contenidos' | 'entregas',
    scopeId: number,
    file: File,
  ) => {
    const fileName = sanitizeFileName(`${Date.now()}_${file.name}`)
    const filePath = `${userId}/${scope}/${scopeId}/${fileName}`

    const { error } = await supabase.storage
      .from('archivos')
      .upload(filePath, file, {
        cacheControl: '3600',
        contentType: file.type || 'application/octet-stream',
        upsert: false,
      })

    if (error) {
      console.log(error)
      return null
    }

    return filePath
  }

  const borrarArchivoStorage = async (path?: string | null) => {
    if (!path || isSafeHttpUrl(path)) return
    const { error } = await supabase.storage.from('archivos').remove([path])
    if (error) {
      console.log(error)
    }
  }

  const limpiarFormularioLeccion = () => {
    setLessonForm(INITIAL_LECCION_FORM)
    setLessonFile(null)
    setEditingLeccionId(null)
    setShowLessonForm(false)
  }

  const limpiarFormularioContenido = () => {
    setContentForm(INITIAL_CONTENIDO_FORM)
    setResourceFile(null)
    setEditingContenidoId(null)
    setShowContentForm(false)
  }

  const validarLeccion = () => {
    const titulo = normalizeText(lessonForm.titulo)
    const descripcion = normalizeText(lessonForm.descripcion)
    const videoUrl = lessonForm.videoUrl.trim()
    const fechaEntrega = fromDateTimeLocalValue(lessonForm.fechaEntrega)

    if (!titulo) {
      setMensaje('Escribe el titulo de la clase.')
      limpiarMensaje()
      return null
    }

    if (videoUrl && !isSafeHttpUrl(videoUrl)) {
      setMensaje('La URL del video principal no es valida.')
      limpiarMensaje()
      return null
    }

    if (lessonForm.fechaEntrega && !fechaEntrega) {
      setMensaje('La fecha limite no es valida.')
      limpiarMensaje()
      return null
    }

    if (lessonFile) {
      if (!isPdfOrImageFile(lessonFile)) {
        setMensaje('El archivo principal debe ser PDF o imagen.')
        limpiarMensaje()
        return null
      }

      if (lessonFile.size > MAX_UPLOAD_SIZE_BYTES) {
        setMensaje('El archivo principal no puede superar los 10 MB.')
        limpiarMensaje()
        return null
      }
    }

    return {
      titulo,
      descripcion,
      curso_id: cursoId,
      video_url: videoUrl,
      fecha_entrega: fechaEntrega,
    }
  }

  const validarContenido = () => {
    const titulo = normalizeText(contentForm.titulo)
    const descripcion = normalizeText(contentForm.descripcion)
    const contenidoUrl = contentForm.contenidoUrl.trim()
    const orden = Number(contentForm.orden) || 1

    if (!selectedLeccionId) {
      setMensaje('Selecciona una clase para editar sus actividades.')
      limpiarMensaje()
      return null
    }

    if (!titulo) {
      setMensaje('Escribe el titulo del contenido.')
      limpiarMensaje()
      return null
    }

    if (contenidoUrl && !isSafeHttpUrl(contenidoUrl)) {
      setMensaje('La URL del contenido no es valida.')
      limpiarMensaje()
      return null
    }

    if (resourceFile && resourceFile.size > MAX_UPLOAD_SIZE_BYTES) {
      setMensaje('El archivo del contenido no puede superar los 10 MB.')
      limpiarMensaje()
      return null
    }

    if (resourceFile && !isPdfOrImageFile(resourceFile)) {
      setMensaje('El archivo del contenido debe ser PDF o imagen.')
      limpiarMensaje()
      return null
    }

    const requiresExternalResource = contentForm.tipo !== 'simulador'

    if (requiresExternalResource && !editingContenidoId && !resourceFile && !contenidoUrl) {
      setMensaje('Agrega una URL o un archivo al contenido.')
      limpiarMensaje()
      return null
    }

    return {
      leccion_id: selectedLeccionId,
      titulo,
      descripcion,
      tipo: contentForm.tipo,
      orden,
      contenido_url: contenidoUrl,
      acepta_entrega: contentForm.aceptaEntrega,
      simulador_base_id: contentForm.simuladorBaseId ? Number(contentForm.simuladorBaseId) : null,
    }
  }

  const clonarSimuladorBase = async (
    templateSimulatorId: number,
    nuevoContenidoId: number,
  ) => {
    const template = simuladores.find((item) => item.id === templateSimulatorId)
    if (!template) return

    const { data: newSimulator, error: simulatorError } = await supabase
      .from('simuladores')
      .insert([
        {
          contenido_id: nuevoContenidoId,
          titulo: template.titulo,
          instrucciones: template.instrucciones,
          duracion_minutos: template.duracion_minutos,
          mostrar_resultado_inmediato: template.mostrar_resultado_inmediato,
          mezclar_preguntas: template.mezclar_preguntas,
          max_intentos: template.max_intentos,
        },
      ])
      .select()
      .single()

    if (simulatorError || !newSimulator) {
      console.log(simulatorError)
      throw new Error('No se pudo clonar la configuracion del simulador.')
    }

    const preguntasTemplate = simuladorPreguntas.filter(
      (pregunta) => pregunta.simulador_id === templateSimulatorId,
    )

    if (preguntasTemplate.length === 0) return

    const { error: questionsError } = await supabase
      .from('simulador_preguntas')
      .insert(
        preguntasTemplate.map((pregunta) => ({
          simulador_id: newSimulator.id,
          enunciado: pregunta.enunciado,
          recurso_visual_url: pregunta.recurso_visual_url,
          recurso_visual_alt: pregunta.recurso_visual_alt,
          opcion_a: pregunta.opcion_a,
          opcion_b: pregunta.opcion_b,
          opcion_c: pregunta.opcion_c,
          opcion_d: pregunta.opcion_d,
          respuesta_correcta: pregunta.respuesta_correcta,
          explicacion: pregunta.explicacion,
          orden: pregunta.orden,
        })),
      )

    if (questionsError) {
      console.log(questionsError)
      throw new Error('No se pudieron clonar las preguntas del simulador.')
    }
  }

  const handleLessonSubmit = async () => {
    const payload = validarLeccion()

    if (!payload) return

    if (!editingLeccionId && !lessonFile) {
      setMensaje('Debes adjuntar un archivo principal para crear una clase nueva.')
      limpiarMensaje()
      return
    }

    setMensaje('')
    setIsSubmittingLesson(true)

    const adminUser = await getAdminUser()

    if (!adminUser) {
      setIsSubmittingLesson(false)
      return
    }

    const uploadedPdf =
      lessonFile && cursoId
        ? await subirArchivo(adminUser.id, 'lecciones', cursoId, lessonFile)
        : null

    if (lessonFile && !uploadedPdf) {
      setMensaje('Error al subir el PDF principal.')
      limpiarMensaje()
      setIsSubmittingLesson(false)
      return
    }

    if (editingLeccionId) {
      const actual = lecciones.find((item) => item.id === editingLeccionId)

      const { error } = await supabase
        .from('lecciones')
        .update({
          ...payload,
          pdf_url: uploadedPdf || actual?.pdf_url || '',
        })
        .eq('id', editingLeccionId)

      if (error) {
        console.log(error)
        setMensaje('No se pudo actualizar la clase.')
        limpiarMensaje()
        setIsSubmittingLesson(false)
        return
      }

      if (uploadedPdf && actual?.pdf_url && actual.pdf_url !== uploadedPdf) {
        await borrarArchivoStorage(actual.pdf_url)
      }

      setMensaje('Clase actualizada con exito.')
    } else {
      const nextOrden = lecciones.length + 1
      const { error } = await supabase
        .from('lecciones')
        .insert([
          {
            ...payload,
            pdf_url: uploadedPdf || '',
            orden: nextOrden,
          },
        ])

      if (error) {
        console.log(error)
        setMensaje('No se pudo crear la clase.')
        limpiarMensaje()
        setIsSubmittingLesson(false)
        return
      }

      setMensaje('Clase creada con exito.')
    }

    limpiarFormularioLeccion()
    await cargarCurso()
    setIsSubmittingLesson(false)
    limpiarMensaje()
  }

  const handleContentSubmit = async () => {
    const payload = validarContenido()

    if (!payload) return

    const { simulador_base_id, ...contentPayload } = payload

    setMensaje('')
    setIsSubmittingContent(true)

    const adminUser = await getAdminUser()

    if (!adminUser) {
      setIsSubmittingContent(false)
      return
    }

    let uploadedResource = payload.contenido_url

    if (resourceFile && selectedLeccionId) {
      const uploadedPath = await subirArchivo(
        adminUser.id,
        'contenidos',
        selectedLeccionId,
        resourceFile,
      )

      if (!uploadedPath) {
        setMensaje('Error al subir el archivo del contenido.')
        limpiarMensaje()
        setIsSubmittingContent(false)
        return
      }

      uploadedResource = uploadedPath
    }

    if (editingContenidoId) {
      const actual = contenidos.find((item) => item.id === editingContenidoId)

      const { error } = await supabase
        .from('leccion_contenidos')
        .update({
          ...contentPayload,
          contenido_url: uploadedResource || actual?.contenido_url || '',
        })
        .eq('id', editingContenidoId)

      if (error) {
        console.log(error)
        setMensaje('No se pudo actualizar la actividad.')
        limpiarMensaje()
        setIsSubmittingContent(false)
        return
      }

      if (uploadedResource && actual?.contenido_url && actual.contenido_url !== uploadedResource) {
        await borrarArchivoStorage(actual.contenido_url)
      }

      setMensaje('Actividad actualizada con exito.')
    } else {
      const nextOrden = contenidosDeLeccion.length + 1
      const { data: insertedContent, error } = await supabase
        .from('leccion_contenidos')
        .insert([
          {
            ...contentPayload,
            contenido_url: uploadedResource,
            orden: nextOrden,
          },
        ])
        .select()
        .single()

      if (error) {
        console.log(error)
        setMensaje('No se pudo crear la actividad.')
        limpiarMensaje()
        setIsSubmittingContent(false)
        return
      }

      if (
        contentPayload.tipo === 'simulador' &&
        simulador_base_id &&
        insertedContent?.id
      ) {
        try {
          await clonarSimuladorBase(simulador_base_id, insertedContent.id)
          setMensaje('Actividad creada con exito usando un simulador anterior.')
        } catch (cloneError) {
          console.log(cloneError)
          setMensaje(
            'La actividad se creo, pero no se pudo copiar el simulador base.',
          )
        }
      } else {
        setMensaje('Actividad creada con exito.')
      }

    }

    limpiarFormularioContenido()
    await cargarCurso()
    setIsSubmittingContent(false)
    limpiarMensaje()
  }

  const reorderLecciones = async (items: Leccion[]) => {
    await Promise.all(
      items.map((item, index) =>
        supabase.from('lecciones').update({ orden: index + 1 }).eq('id', item.id),
      ),
    )
    await cargarCurso()
  }

  const moverLeccion = async (leccionId: number, direction: 'up' | 'down') => {
    const index = lecciones.findIndex((item) => item.id === leccionId)
    if (index < 0) return

    const swapIndex = direction === 'up' ? index - 1 : index + 1
    if (swapIndex < 0 || swapIndex >= lecciones.length) return

    const next = [...lecciones]
    ;[next[index], next[swapIndex]] = [next[swapIndex], next[index]]
    await reorderLecciones(next)
  }

  const reorderContenidos = async (items: ContenidoLeccion[]) => {
    await Promise.all(
      items.map((item, index) =>
        supabase.from('leccion_contenidos').update({ orden: index + 1 }).eq('id', item.id),
      ),
    )
    await cargarCurso()
  }

  const moverContenido = async (contenidoId: number, direction: 'up' | 'down') => {
    const index = contenidosDeLeccion.findIndex((item) => item.id === contenidoId)
    if (index < 0) return

    const swapIndex = direction === 'up' ? index - 1 : index + 1
    if (swapIndex < 0 || swapIndex >= contenidosDeLeccion.length) return

    const next = [...contenidosDeLeccion]
    ;[next[index], next[swapIndex]] = [next[swapIndex], next[index]]
    await reorderContenidos(next)
  }

  const eliminarClase = async (leccion: Leccion) => {
    const adminUser = await getAdminUser()
    if (!adminUser) return

    const contenidosRelacionados = contenidos.filter((item) => item.leccion_id === leccion.id)
    const entregasRelacionadas = entregas.filter((entrega) =>
      contenidosRelacionados.some((contenido) => contenido.id === entrega.contenido_id),
    )

    await Promise.all([
      borrarArchivoStorage(leccion.pdf_url),
      ...contenidosRelacionados.map((item) => borrarArchivoStorage(item.contenido_url)),
      ...entregasRelacionadas.map((item) => borrarArchivoStorage(item.archivo_url)),
    ])

    const { error } = await supabase.from('lecciones').delete().eq('id', leccion.id)
    if (error) {
      console.log(error)
      setMensaje('No se pudo eliminar la clase.')
      limpiarMensaje()
      return
    }

    if (selectedLeccionId === leccion.id) {
      setSelectedLeccionId(null)
    }

    setMensaje('Clase eliminada con exito.')
    await cargarCurso()
    limpiarMensaje()
  }

  const eliminarContenido = async (contenido: ContenidoLeccion) => {
    const adminUser = await getAdminUser()
    if (!adminUser) return

    const entregasRelacionadas = entregas.filter((item) => item.contenido_id === contenido.id)
    await Promise.all([
      borrarArchivoStorage(contenido.contenido_url),
      ...entregasRelacionadas.map((item) => borrarArchivoStorage(item.archivo_url)),
    ])

    const { error } = await supabase
      .from('leccion_contenidos')
      .delete()
      .eq('id', contenido.id)

    if (error) {
      console.log(error)
      setMensaje('No se pudo eliminar la actividad.')
      limpiarMensaje()
      return
    }

    setMensaje('Actividad eliminada con exito.')
    await cargarCurso()
    limpiarMensaje()
  }

  const guardarRevision = async (entrega: EntregaActividad) => {
    const adminUser = await getAdminUser()
    if (!adminUser) return

    const form = revisionForms[entrega.id] || {
      nota: entrega.nota?.toString() || '',
      retroalimentacion: entrega.retroalimentacion || '',
    }

    const nota = form.nota ? Number(form.nota) : null
    if (form.nota && Number.isNaN(nota)) {
      setMensaje('La nota debe ser numerica.')
      limpiarMensaje()
      return
    }

    setIsSavingRevision(entrega.id)
    const { error } = await supabase
      .from('entregas_actividades')
      .update({
        nota,
        retroalimentacion: normalizeText(form.retroalimentacion),
        estado: nota !== null ? 'calificado' : 'entregado',
        calificado_en: nota !== null ? new Date().toISOString() : null,
      })
      .eq('id', entrega.id)

    if (error) {
      console.log(error)
      setMensaje('No se pudo guardar la revision.')
      limpiarMensaje()
      setIsSavingRevision(null)
      return
    }

    await cargarCurso()
    setIsSavingRevision(null)
    setMensaje('Revision guardada con exito.')
    limpiarMensaje()
  }

  const iniciarEdicionLeccion = (leccion: Leccion) => {
    setEditingLeccionId(leccion.id)
    setSelectedLeccionId(leccion.id)
    setShowLessonForm(true)
    setShowContentForm(false)
    setLessonForm({
      titulo: leccion.titulo,
      descripcion: leccion.descripcion ?? '',
      videoUrl: leccion.video_url ?? '',
      fechaEntrega: toDateTimeLocalValue(leccion.fecha_entrega),
    })
    setLessonFile(null)
  }

  const iniciarNuevaActividad = (leccionId: number) => {
    setShowLessonForm(false)
    setShowContentForm(true)
    setSelectedLeccionId(leccionId)
    setEditingContenidoId(null)
    setResourceFile(null)
    setContentForm({
      ...INITIAL_CONTENIDO_FORM,
      orden: String(
        contenidos.filter((item) => item.leccion_id === leccionId).length + 1,
      ),
    })
  }

  const iniciarEdicionContenido = (contenido: ContenidoLeccion) => {
    setSelectedLeccionId(contenido.leccion_id)
    setEditingContenidoId(contenido.id)
    setShowContentForm(true)
    setContentForm({
      titulo: contenido.titulo,
      descripcion: contenido.descripcion ?? '',
      tipo: contenido.tipo,
      contenidoUrl: contenido.contenido_url ?? '',
      orden: String(contenido.orden || 1),
      aceptaEntrega: Boolean(contenido.acepta_entrega),
      simuladorBaseId: '',
    })
    setResourceFile(null)
  }

  const getTipoLabel = (tipo: TipoContenido) =>
    CONTENT_TYPES.find((item) => item.value === tipo)?.label || tipo

  const getEntregasDeContenido = (contenidoId: number) =>
    entregas.filter((item) => item.contenido_id === contenidoId)

  const getSimuladorDeContenido = (contenidoId: number) =>
    simuladores.find((item) => item.contenido_id === contenidoId) || null

  const getIntentoDeEntrega = (entrega: EntregaActividad, contenidoId: number) => {
    if (entrega.simulador_intento_id) {
      return (
        simuladorIntentos.find((item) => item.id === entrega.simulador_intento_id) || null
      )
    }

    const simulador = getSimuladorDeContenido(contenidoId)
    if (!simulador) return null

    return (
      simuladorIntentos.find(
        (item) =>
          item.simulador_id === simulador.id && item.estudiante_id === entrega.estudiante_id,
      ) || null
    )
  }

  const getRespuestaLabel = (preguntaId: number, respuestas?: Record<string, string> | null) =>
    respuestas?.[String(preguntaId)] || 'Sin responder'

  return (
    <div className="container admin-course-layout">
      <div className="admin-course-header">
        <button className="resource-button secondary" onClick={() => navigate('/dashboard')}>
          Volver al dashboard
        </button>
        <div>
          <p className="dashboard-eyebrow">Curso en gestion</p>
          <h2>{curso?.nombre || 'Curso'}</h2>
          <p className="dashboard-copy">
            Gestiona clases, actividades, entregas y revisiones desde un solo panel por curso.
          </p>
        </div>
        <div className="course-page-highlight admin-highlight">
          <span>Entregas del curso</span>
          <strong>{entregasDeLeccion.length}</strong>
        </div>
      </div>

      {mensaje && (
        <p className={`feedback-banner ${mensaje.includes('exito') ? 'success' : 'error'}`}>
          {mensaje}
        </p>
      )}

      <div className="admin-course-grid">
        <section className="curso-card admin-sidebar">
          <div className="admin-panel-title">
            <p className="dashboard-eyebrow">Clases del curso</p>
            <h3>{lecciones.length} clases</h3>
          </div>

          <div className="admin-sidebar-toolbar">
            <button
              className="icon-action-button"
              onClick={() => {
                setShowLessonForm((current) => !current)
                setShowContentForm(false)
                setEditingLeccionId(null)
                setLessonForm(INITIAL_LECCION_FORM)
                setLessonFile(null)
                setEditingContenidoId(null)
                setContentForm(INITIAL_CONTENIDO_FORM)
                setResourceFile(null)
              }}
              aria-label="Crear nueva clase"
              title="Crear nueva clase"
            >
              +
            </button>
            <span className="toolbar-hint">Nueva clase</span>
          </div>

          <div className="lesson-list">
            {lecciones.map((leccion, index) => (
              <article
                key={leccion.id}
                className={`lesson-list-card ${selectedLeccionId === leccion.id ? 'active' : ''}`}
                onClick={() => {
                  setSelectedLeccionId(leccion.id)
                  setShowLessonForm(false)
                }}
              >
                <strong>{index + 1}. {leccion.titulo}</strong>
                <span>
                  {leccion.fecha_entrega
                    ? new Date(leccion.fecha_entrega).toLocaleDateString('es-EC')
                    : 'Sin fecha limite'}
                </span>
                <div className="lesson-list-actions">
                  <button className="inline-link-button" onClick={(event) => {
                    event.stopPropagation()
                    void moverLeccion(leccion.id, 'up')
                  }}>
                    Subir
                  </button>
                  <button className="inline-link-button" onClick={(event) => {
                    event.stopPropagation()
                    void moverLeccion(leccion.id, 'down')
                  }}>
                    Bajar
                  </button>
                  <button className="inline-link-button" onClick={(event) => {
                    event.stopPropagation()
                    iniciarEdicionLeccion(leccion)
                  }}>
                    Editar
                  </button>
                  <button className="inline-link-button" onClick={(event) => {
                    event.stopPropagation()
                    iniciarNuevaActividad(leccion.id)
                  }}>
                    Actividades
                  </button>
                  <button className="inline-link-button danger" onClick={(event) => {
                    event.stopPropagation()
                    void eliminarClase(leccion)
                  }}>
                    Eliminar
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="admin-main-stack">
          {showLessonForm && (
            <article className="curso-card admin-editor-card">
              <div className="admin-panel-title">
                <p className="dashboard-eyebrow">
                  {editingLeccionId ? 'Editando clase' : 'Nueva clase'}
                </p>
                <h3>{editingLeccionId ? 'Actualizar clase' : 'Crear clase'}</h3>
              </div>

              <div className="form-grid">
                <input
                  value={lessonForm.titulo}
                  placeholder="Titulo de la clase"
                  onChange={(event) =>
                    setLessonForm((current) => ({ ...current, titulo: event.target.value }))
                  }
                />

                <textarea
                  value={lessonForm.descripcion}
                  placeholder="Descripcion general de la clase"
                  rows={4}
                  onChange={(event) =>
                    setLessonForm((current) => ({
                      ...current,
                      descripcion: event.target.value,
                    }))
                  }
                />

                <input
                  value={lessonForm.videoUrl}
                  placeholder="URL del video principal"
                  onChange={(event) =>
                    setLessonForm((current) => ({ ...current, videoUrl: event.target.value }))
                  }
                />

                <label>
                  Fecha y hora maxima de entrega
                  <br />
                  <input
                    type="datetime-local"
                    value={lessonForm.fechaEntrega}
                    onChange={(event) =>
                      setLessonForm((current) => ({
                        ...current,
                        fechaEntrega: event.target.value,
                      }))
                    }
                  />
                </label>

                <label>
                  Archivo principal PDF o imagen {editingLeccionId ? '(opcional para reemplazar)' : ''}
                  <br />
                  <input
                    type="file"
                    accept="application/pdf,image/*"
                    onChange={(event) => setLessonFile(event.target.files?.[0] || null)}
                  />
                </label>

                {lessonPreviewUrl && (
                  <div className="media-preview-card">
                    <p className="resource-type">Vista previa</p>
                    <img src={lessonPreviewUrl} alt="Vista previa del archivo principal" className="uploaded-media-preview" />
                  </div>
                )}

                <div className="action-row">
                  <button className="resource-button" onClick={handleLessonSubmit} disabled={isSubmittingLesson}>
                    {isSubmittingLesson
                      ? 'Guardando...'
                      : editingLeccionId
                        ? 'Actualizar clase'
                        : 'Crear clase'}
                  </button>

                  <button className="resource-button secondary" onClick={limpiarFormularioLeccion}>
                    Cancelar
                  </button>
                </div>
              </div>
            </article>
          )}

          {!showLessonForm && leccionSeleccionada && (
            <article className="curso-card admin-editor-card">
              <div className="admin-panel-title">
                <p className="dashboard-eyebrow">Clase seleccionada</p>
                <h3>{leccionSeleccionada.titulo}</h3>
              </div>

              <div className="admin-class-summary">
                <div className="summary-chip">
                  <span>Fecha limite</span>
                  <strong>
                    {leccionSeleccionada.fecha_entrega
                      ? new Date(leccionSeleccionada.fecha_entrega).toLocaleString('es-EC')
                      : 'Sin fecha limite'}
                  </strong>
                </div>
                <div className="summary-chip">
                  <span>Actividades</span>
                  <strong>{contenidosDeLeccion.length}</strong>
                </div>
                <div className="summary-chip">
                  <span>Entregas</span>
                  <strong>{entregasDeLeccion.length}</strong>
                </div>
              </div>

              <p className="module-description">
                {leccionSeleccionada.descripcion || 'Sin descripcion para esta clase.'}
              </p>

              {leccionSeleccionada.pdf_url && isImageResource(leccionSeleccionada.pdf_url) && (
                <div className="media-preview-card">
                  <p className="resource-type">Portada o material visual</p>
                  <ResourceImage
                    resource={leccionSeleccionada.pdf_url}
                    alt={`Material visual de ${leccionSeleccionada.titulo}`}
                    className="uploaded-media-preview"
                  />
                </div>
              )}

              <div className="action-row">
                <button className="resource-button" onClick={() => iniciarNuevaActividad(leccionSeleccionada.id)}>
                  + Nueva actividad
                </button>
                <button className="resource-button secondary" onClick={() => iniciarEdicionLeccion(leccionSeleccionada)}>
                  Editar clase
                </button>
              </div>

              {showContentForm && (
                <div className="nested-editor">
                  <div className="admin-panel-title">
                    <p className="dashboard-eyebrow">
                      {editingContenidoId ? 'Editando actividad' : 'Nueva actividad'}
                    </p>
                    <h3>{editingContenidoId ? 'Actualizar actividad' : 'Crear actividad'}</h3>
                  </div>

                  <div className="form-grid">
                    <input
                      value={contentForm.titulo}
                      placeholder="Titulo del contenido o actividad"
                      onChange={(event) =>
                        setContentForm((current) => ({ ...current, titulo: event.target.value }))
                      }
                    />

                    <textarea
                      value={contentForm.descripcion}
                      placeholder="Descripcion o instrucciones"
                      rows={3}
                      onChange={(event) =>
                        setContentForm((current) => ({
                          ...current,
                          descripcion: event.target.value,
                        }))
                      }
                    />

                    <select
                      value={contentForm.tipo}
                      onChange={(event) =>
                        setContentForm((current) => ({
                          ...current,
                          tipo: event.target.value as TipoContenido,
                          simuladorBaseId:
                            event.target.value === 'simulador'
                              ? current.simuladorBaseId
                              : '',
                        }))
                      }
                    >
                      {CONTENT_TYPES.map((item) => (
                        <option key={item.value} value={item.value}>
                          {item.label}
                        </option>
                      ))}
                    </select>

                    <label className="checkbox-row">
                      <input
                        type="checkbox"
                        checked={contentForm.aceptaEntrega}
                        onChange={(event) =>
                          setContentForm((current) => ({
                            ...current,
                            aceptaEntrega: event.target.checked,
                          }))
                        }
                      />
                      Esta actividad acepta entrega del estudiante
                    </label>

                    {contentForm.tipo === 'simulador' && (
                      <select
                        value={contentForm.simuladorBaseId}
                        onChange={(event) =>
                          setContentForm((current) => ({
                            ...current,
                            simuladorBaseId: event.target.value,
                          }))
                        }
                      >
                        <option value="">Crear simulador desde cero</option>
                        {simuladoresDisponibles.map((simulador) => (
                          <option key={simulador.id} value={simulador.id}>
                            {simulador.label}
                          </option>
                        ))}
                      </select>
                    )}

                    <input
                      value={contentForm.contenidoUrl}
                      placeholder="URL externa del recurso"
                      onChange={(event) =>
                        setContentForm((current) => ({
                          ...current,
                          contenidoUrl: event.target.value,
                        }))
                      }
                    />

                    <label>
                      Archivo del contenido PDF o imagen
                      <br />
                      <input
                        type="file"
                        accept="application/pdf,image/*"
                        onChange={(event) => setResourceFile(event.target.files?.[0] || null)}
                      />
                    </label>

                    {resourcePreviewUrl && (
                      <div className="media-preview-card">
                        <p className="resource-type">Vista previa</p>
                        <img src={resourcePreviewUrl} alt="Vista previa del contenido" className="uploaded-media-preview" />
                      </div>
                    )}

                    {!resourcePreviewUrl && contentForm.contenidoUrl && isImageResource(contentForm.contenidoUrl) && (
                      <div className="media-preview-card">
                        <p className="resource-type">Vista previa</p>
                        <ResourceImage
                          resource={contentForm.contenidoUrl}
                          alt="Vista previa del contenido"
                          className="uploaded-media-preview"
                        />
                      </div>
                    )}

                    <input
                      type="number"
                      min="1"
                      value={contentForm.orden}
                      onChange={(event) =>
                        setContentForm((current) => ({ ...current, orden: event.target.value }))
                      }
                    />

                    <div className="action-row">
                      <button className="resource-button" onClick={handleContentSubmit} disabled={isSubmittingContent}>
                        {isSubmittingContent
                          ? 'Guardando...'
                          : editingContenidoId
                            ? 'Actualizar actividad'
                            : 'Crear actividad'}
                      </button>

                      <button className="resource-button secondary" onClick={limpiarFormularioContenido}>
                        Cancelar
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <div className="lesson-content-list">
                {contenidosDeLeccion.length === 0 && (
                  <p className="empty-state">
                    Esta clase todavia no tiene actividades ni recursos creados.
                  </p>
                )}

                {contenidosDeLeccion.map((contenido) => {
                  const entregaCount = getEntregasDeContenido(contenido.id).length
                  return (
                    <article key={contenido.id} className="resource-card stacked">
                      <div className="resource-main">
                        <p className="resource-type">{getTipoLabel(contenido.tipo)}</p>
                        <h4>{contenido.orden}. {contenido.titulo}</h4>
                        <p>{contenido.descripcion || 'Sin descripcion.'}</p>
                        {contenido.contenido_url && isImageResource(contenido.contenido_url) && (
                          <div className="media-preview-card">
                            <p className="resource-type">Vista previa</p>
                            <ResourceImage
                              resource={contenido.contenido_url}
                              alt={`Vista previa de ${contenido.titulo}`}
                              className="uploaded-media-preview"
                            />
                          </div>
                        )}
                        <div className="meta-row">
                          <span className="status-pill neutral">
                            {contenido.acepta_entrega ? 'Con entrega' : 'Solo lectura'}
                          </span>
                          <span className="status-pill neutral">
                            {entregaCount} entregas
                          </span>
                        </div>
                      </div>
                      <div className="resource-actions-column">
                        <button className="resource-button secondary" onClick={() => void moverContenido(contenido.id, 'up')}>
                          Subir
                        </button>
                        <button className="resource-button secondary" onClick={() => void moverContenido(contenido.id, 'down')}>
                          Bajar
                        </button>
                        {contenido.tipo === 'simulador' && (
                          <button
                            className="resource-button secondary"
                            onClick={() => navigate(`/admin/simulador/${contenido.id}`)}
                          >
                            Configurar simulador
                          </button>
                        )}
                        <button className="resource-button" onClick={() => iniciarEdicionContenido(contenido)}>
                          Editar
                        </button>
                        <button className="resource-button secondary" onClick={() => void eliminarContenido(contenido)}>
                          Eliminar
                        </button>
                      </div>
                    </article>
                  )
                })}
              </div>
            </article>
          )}

          <article className="curso-card admin-editor-card">
            <div className="admin-panel-title">
              <p className="dashboard-eyebrow">Libro de calificaciones</p>
              <h3>Resumen del curso</h3>
            </div>

            {gradebookRows.length === 0 && (
              <p className="empty-state">Todavia no hay entregas suficientes para mostrar el libro de calificaciones.</p>
            )}

            {gradebookRows.length > 0 && (
              <div className="gradebook-grid">
                {gradebookRows.map((row) => (
                  <article key={row.studentId} className="gradebook-card">
                    <div className="resource-heading">
                      <div>
                        <p className="resource-type">Estudiante</p>
                        <h4>{shortStudentId(row.studentId)}</h4>
                      </div>
                      <span className={`status-pill ${row.promedio !== null ? 'calificado' : 'pendiente'}`}>
                        {row.promedio !== null ? `Promedio ${row.promedio.toFixed(1)}` : 'Sin nota'}
                      </span>
                    </div>

                    <div className="admin-class-summary">
                      <div className="summary-chip">
                        <span>Actividades</span>
                        <strong>{row.totalActividades}</strong>
                      </div>
                      <div className="summary-chip">
                        <span>Entregadas</span>
                        <strong>{row.entregadas}</strong>
                      </div>
                      <div className="summary-chip">
                        <span>Calificadas</span>
                        <strong>{row.calificadas}</strong>
                      </div>
                      <div className="summary-chip">
                        <span>Pendientes</span>
                        <strong>{row.pendientes}</strong>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </article>

          {!showLessonForm && leccionSeleccionada && (
            <article className="curso-card admin-editor-card">
              <div className="admin-panel-title">
                <p className="dashboard-eyebrow">Revision docente</p>
                <h3>Entregas de la clase</h3>
              </div>

              {entregasDeLeccion.length === 0 && (
                <p className="empty-state">Todavia no hay entregas registradas en esta clase.</p>
              )}

              <div className="lesson-content-list">
                {contenidosDeLeccion
                  .filter((contenido) => contenido.acepta_entrega)
                  .map((contenido) => {
                    const entregasContenido = getEntregasDeContenido(contenido.id)
                    return (
                      <div key={contenido.id} className="submission-group">
                        <h4>{contenido.titulo}</h4>
                        {entregasContenido.length === 0 && (
                          <p className="empty-state">Sin entregas para esta actividad.</p>
                        )}
                        {entregasContenido.map((entrega) => {
                          const form = revisionForms[entrega.id] || {
                            nota: entrega.nota?.toString() || '',
                            retroalimentacion: entrega.retroalimentacion || '',
                          }
                          const status = getEntregaStatus(leccionSeleccionada, contenido, entrega)
                          const simulador = contenido.tipo === 'simulador'
                            ? getSimuladorDeContenido(contenido.id)
                            : null
                          const intento = simulador
                            ? getIntentoDeEntrega(entrega, contenido.id)
                            : null
                          const preguntasIntento = simulador
                            ? simuladorPreguntas.filter(
                                (pregunta) => pregunta.simulador_id === simulador.id,
                              )
                            : []
                          return (
                            <article key={entrega.id} className="submission-card">
                              <div className="submission-meta">
                                <div>
                                  <strong>Estudiante</strong>
                                  <p>{entrega.estudiante_id}</p>
                                </div>
                                <span className={`status-pill ${status}`}>
                                  {getStatusLabel(status)}
                                </span>
                              </div>

                              {entrega.comentario && (
                                <p className="submission-comment">{entrega.comentario}</p>
                              )}

                              {intento && (
                                <div className="attempt-review-card">
                                  <div className="meta-row">
                                    <span className="status-pill neutral">
                                      Intento #{intento.numero_intento || 1}
                                    </span>
                                    <span className="status-pill neutral">
                                      Puntaje {intento.puntaje}/{intento.total_preguntas}
                                    </span>
                                    <span className="status-pill neutral">
                                      Tiempo {Math.floor((intento.tiempo_segundos || 0) / 60)}:
                                      {((intento.tiempo_segundos || 0) % 60).toString().padStart(2, '0')}
                                    </span>
                                  </div>

                                  <div className="attempt-answer-list">
                                    {preguntasIntento.map((pregunta) => {
                                      const respuestaEstudiante = getRespuestaLabel(
                                        pregunta.id,
                                        intento.respuestas,
                                      )
                                      const esCorrecta =
                                        respuestaEstudiante === pregunta.respuesta_correcta

                                      return (
                                        <div key={pregunta.id} className="attempt-answer-item">
                                          <strong>
                                            {pregunta.orden}.{' '}
                                            <MathContent
                                              text={pregunta.enunciado}
                                              className="resource-math-content inline"
                                            />
                                          </strong>
                                          <p>
                                            Respuesta del estudiante: {respuestaEstudiante}
                                          </p>
                                          <p>
                                            Respuesta correcta: {pregunta.respuesta_correcta}
                                          </p>
                                          <span
                                            className={`status-pill ${esCorrecta ? 'calificado' : 'vencido'}`}
                                          >
                                            {esCorrecta ? 'Correcta' : 'Incorrecta'}
                                          </span>
                                        </div>
                                      )
                                    })}
                                  </div>
                                </div>
                              )}

                              {entrega.archivo_url && (
                                <button
                                  className="resource-button secondary"
                                  onClick={async () => {
                                    const { data } = await supabase.storage
                                      .from('archivos')
                                      .download(entrega.archivo_url || '')
                                    if (!data) return
                                    const blobUrl = URL.createObjectURL(data)
                                    window.open(blobUrl, '_blank', 'noopener,noreferrer')
                                    window.setTimeout(() => URL.revokeObjectURL(blobUrl), 60000)
                                  }}
                                >
                                  Abrir entrega
                                </button>
                              )}

                              <div className="form-grid compact">
                                <input
                                  type="number"
                                  step="0.1"
                                  min="0"
                                  max="10"
                                  value={form.nota}
                                  placeholder="Nota"
                                  onChange={(event) =>
                                    setRevisionForm(entrega.id, { nota: event.target.value })
                                  }
                                />
                                <textarea
                                  rows={3}
                                  value={form.retroalimentacion}
                                  placeholder="Retroalimentacion"
                                  onChange={(event) =>
                                    setRevisionForm(entrega.id, {
                                      retroalimentacion: event.target.value,
                                    })
                                  }
                                />
                                <button
                                  className="resource-button"
                                  onClick={() => void guardarRevision(entrega)}
                                  disabled={isSavingRevision === entrega.id}
                                >
                                  {isSavingRevision === entrega.id
                                    ? 'Guardando...'
                                    : 'Guardar revision'}
                                </button>
                              </div>
                            </article>
                          )
                        })}
                      </div>
                    )
                  })}
              </div>
            </article>
          )}
        </section>
      </div>
    </div>
  )
}
