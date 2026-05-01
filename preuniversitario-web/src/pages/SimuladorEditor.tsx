import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import MathContent from '../components/MathContent'
import ResourceImage from '../components/ResourceImage'
import { supabase } from '../services/supabaseClient'
import {
  isImageFile,
  isSafeHttpUrl,
  MAX_UPLOAD_SIZE_BYTES,
  normalizeText,
  sanitizeFileName,
} from '../utils/security'
import type {
  ContenidoLeccion,
  PreguntaBanco,
  Simulador,
  SimuladorPregunta,
} from '../types'

interface SimulatorFormState {
  titulo: string
  instrucciones: string
  duracionMinutos: string
  maxIntentos: string
  mostrarResultadoInmediato: boolean
  mezclarPreguntas: boolean
}

interface QuestionFormState {
  tema: string
  dificultad: 'basico' | 'intermedio' | 'avanzado'
  enunciado: string
  recursoVisualUrl: string
  recursoVisualAlt: string
  opcionA: string
  opcionB: string
  opcionC: string
  opcionD: string
  respuestaCorrecta: 'A' | 'B' | 'C' | 'D'
  explicacion: string
  guardarEnBanco: boolean
}

const INITIAL_SIMULATOR_FORM: SimulatorFormState = {
  titulo: '',
  instrucciones: '',
  duracionMinutos: '20',
  maxIntentos: '',
  mostrarResultadoInmediato: true,
  mezclarPreguntas: false,
}

const INITIAL_QUESTION_FORM: QuestionFormState = {
  tema: '',
  dificultad: 'intermedio',
  enunciado: '',
  recursoVisualUrl: '',
  recursoVisualAlt: '',
  opcionA: '',
  opcionB: '',
  opcionC: '',
  opcionD: '',
  respuestaCorrecta: 'A',
  explicacion: '',
  guardarEnBanco: true,
}

const trimRichText = (value: string) => value.trim()

export default function SimuladorEditor() {
  const { contenidoId } = useParams()
  const navigate = useNavigate()
  const contenidoNumericId = Number(contenidoId)

  const [contenido, setContenido] = useState<ContenidoLeccion | null>(null)
  const [simulador, setSimulador] = useState<Simulador | null>(null)
  const [preguntas, setPreguntas] = useState<SimuladorPregunta[]>([])
  const [bancoPreguntas, setBancoPreguntas] = useState<PreguntaBanco[]>([])
  const [simulatorForm, setSimulatorForm] = useState<SimulatorFormState>(INITIAL_SIMULATOR_FORM)
  const [questionForm, setQuestionForm] = useState<QuestionFormState>(INITIAL_QUESTION_FORM)
  const [questionVisualFile, setQuestionVisualFile] = useState<File | null>(null)
  const [editingQuestionId, setEditingQuestionId] = useState<number | null>(null)
  const [mensaje, setMensaje] = useState('')
  const [isSavingSimulator, setIsSavingSimulator] = useState(false)
  const [isSavingQuestion, setIsSavingQuestion] = useState(false)
  const [isImportingQuestionId, setIsImportingQuestionId] = useState<number | null>(null)
  const [questionVisualPreviewUrl, setQuestionVisualPreviewUrl] = useState<string | null>(null)
  const [bankTopicFilter, setBankTopicFilter] = useState('')
  const [bankDifficultyFilter, setBankDifficultyFilter] = useState<
    'todos' | 'basico' | 'intermedio' | 'avanzado'
  >('todos')

  useEffect(() => {
    void loadData()
  }, [contenidoId])

  useEffect(() => {
    if (!questionVisualFile) {
      setQuestionVisualPreviewUrl(null)
      return
    }

    const objectUrl = URL.createObjectURL(questionVisualFile)
    setQuestionVisualPreviewUrl(objectUrl)

    return () => URL.revokeObjectURL(objectUrl)
  }, [questionVisualFile])

  const orderedQuestions = useMemo(
    () => [...preguntas].sort((a, b) => a.orden - b.orden || a.id - b.id),
    [preguntas],
  )

  const temasBanco = useMemo(
    () =>
      [...new Set(bancoPreguntas.map((pregunta) => (pregunta.tema || '').trim()).filter(Boolean))].sort(
        (a, b) => a.localeCompare(b),
      ),
    [bancoPreguntas],
  )

  const bancoFiltrado = useMemo(
    () =>
      bancoPreguntas.filter((pregunta) => {
        const matchesTopic =
          !bankTopicFilter.trim() ||
          (pregunta.tema || '').toLowerCase().includes(bankTopicFilter.trim().toLowerCase())
        const matchesDifficulty =
          bankDifficultyFilter === 'todos' || pregunta.dificultad === bankDifficultyFilter
        return matchesTopic && matchesDifficulty
      }),
    [bancoPreguntas, bankDifficultyFilter, bankTopicFilter],
  )

  const loadData = async () => {
    if (!Number.isInteger(contenidoNumericId) || contenidoNumericId <= 0) {
      setMensaje('Simulador invalido.')
      return
    }

    const [
      { data: contenidoData, error: contenidoError },
      { data: simuladorData, error: simuladorError },
      { data: preguntasData, error: preguntasError },
      { data: bancoPreguntasData, error: bancoPreguntasError },
    ] = await Promise.all([
      supabase
        .from('leccion_contenidos')
        .select('*')
        .eq('id', contenidoNumericId)
        .maybeSingle(),
      supabase
        .from('simuladores')
        .select('*')
        .eq('contenido_id', contenidoNumericId)
        .maybeSingle(),
      supabase
        .from('simulador_preguntas')
        .select('*')
        .order('orden', { ascending: true })
        .order('id', { ascending: true }),
      supabase
        .from('banco_preguntas')
        .select('*')
        .order('updated_at', { ascending: false })
        .order('id', { ascending: false }),
    ])

    if (contenidoError || simuladorError || preguntasError || bancoPreguntasError) {
      console.log(contenidoError || simuladorError || preguntasError || bancoPreguntasError)
      setMensaje('No se pudo cargar el editor del simulador.')
      return
    }

    setContenido(contenidoData || null)
    setSimulador(simuladorData || null)
    setPreguntas(
      (preguntasData || []).filter(
        (pregunta) => pregunta.simulador_id === simuladorData?.id,
      ),
    )
    setBancoPreguntas((bancoPreguntasData as PreguntaBanco[]) || [])

    if (simuladorData) {
      setSimulatorForm({
        titulo: simuladorData.titulo || contenidoData?.titulo || '',
        instrucciones: simuladorData.instrucciones || '',
        duracionMinutos: String(simuladorData.duracion_minutos || 20),
        maxIntentos: simuladorData.max_intentos ? String(simuladorData.max_intentos) : '',
        mostrarResultadoInmediato: simuladorData.mostrar_resultado_inmediato,
        mezclarPreguntas: simuladorData.mezclar_preguntas,
      })
    }
  }

  const clearMessage = () => {
    window.setTimeout(() => setMensaje(''), 3500)
  }

  const uploadQuestionVisual = async (userId: string, simuladorId: number, file: File) => {
    const fileName = sanitizeFileName(`${Date.now()}_${file.name}`)
    const filePath = `${userId}/simuladores/${simuladorId}/${fileName}`

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

  const ensureAdmin = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) return false

    const { data: profile } = await supabase
      .from('perfiles')
      .select('rol')
      .eq('id', user.id)
      .maybeSingle()

    return profile?.rol === 'admin'
  }

  const saveSimulator = async () => {
    const isAdmin = await ensureAdmin()
    if (!isAdmin || !contenido) {
      setMensaje('No tienes permisos para editar este simulador.')
      clearMessage()
      return
    }

    const duracion = Number(simulatorForm.duracionMinutos)
    const maxIntentos = simulatorForm.maxIntentos ? Number(simulatorForm.maxIntentos) : null
    if (!Number.isInteger(duracion) || duracion <= 0) {
      setMensaje('La duracion del simulador debe ser valida.')
      clearMessage()
      return
    }

    if (simulatorForm.maxIntentos && (!Number.isInteger(maxIntentos) || (maxIntentos ?? 0) <= 0)) {
      setMensaje('El maximo de intentos debe ser un numero entero mayor a 0.')
      clearMessage()
      return
    }

    setIsSavingSimulator(true)
    const payload = {
      contenido_id: contenido.id,
      titulo: normalizeText(simulatorForm.titulo) || contenido.titulo,
      instrucciones: trimRichText(simulatorForm.instrucciones),
      duracion_minutos: duracion,
      max_intentos: maxIntentos,
      mostrar_resultado_inmediato: simulatorForm.mostrarResultadoInmediato,
      mezclar_preguntas: simulatorForm.mezclarPreguntas,
    }

    const { data, error } = simulador
      ? await supabase
          .from('simuladores')
          .update(payload)
          .eq('id', simulador.id)
          .select()
          .single()
      : await supabase
          .from('simuladores')
          .insert([payload])
          .select()
          .single()

    if (error) {
      console.log(error)
      setMensaje('No se pudo guardar la configuracion del simulador.')
      clearMessage()
      setIsSavingSimulator(false)
      return
    }

    setSimulador(data)
    setMensaje('Configuracion del simulador guardada.')
    clearMessage()
    setIsSavingSimulator(false)
    await loadData()
  }

  const saveQuestion = async () => {
    const isAdmin = await ensureAdmin()
    if (!isAdmin || !simulador) {
      setMensaje('Primero guarda la configuracion del simulador.')
      clearMessage()
      return
    }

    const {
      data: { user },
    } = await supabase.auth.getUser()

    const tema = normalizeText(questionForm.tema)
    const enunciado = trimRichText(questionForm.enunciado)
    const opcionA = trimRichText(questionForm.opcionA)
    const opcionB = trimRichText(questionForm.opcionB)
    const recursoVisualUrl = trimRichText(questionForm.recursoVisualUrl)

    if (!enunciado || !opcionA || !opcionB) {
      setMensaje('Completa el enunciado y al menos las opciones A y B.')
      clearMessage()
      return
    }

    if (recursoVisualUrl && !isSafeHttpUrl(recursoVisualUrl)) {
      setMensaje('La URL del recurso visual debe ser valida y segura.')
      clearMessage()
      return
    }

    if (questionVisualFile) {
      if (!isImageFile(questionVisualFile)) {
        setMensaje('El recurso visual debe ser una imagen valida.')
        clearMessage()
        return
      }

      if (questionVisualFile.size > MAX_UPLOAD_SIZE_BYTES) {
        setMensaje('La imagen del recurso visual no puede superar los 10 MB.')
        clearMessage()
        return
      }
    }

    setIsSavingQuestion(true)
    let visualResource = recursoVisualUrl || null

    if (questionVisualFile && user) {
      visualResource = await uploadQuestionVisual(user.id, simulador.id, questionVisualFile)
      if (!visualResource) {
        setMensaje('No se pudo subir la imagen del recurso visual.')
        clearMessage()
        setIsSavingQuestion(false)
        return
      }
    }

    const payload = {
      simulador_id: simulador.id,
      tema: tema || null,
      dificultad: questionForm.dificultad || null,
      enunciado,
      recurso_visual_url: visualResource,
      recurso_visual_alt: normalizeText(questionForm.recursoVisualAlt) || null,
      opcion_a: opcionA,
      opcion_b: opcionB,
      opcion_c: trimRichText(questionForm.opcionC) || null,
      opcion_d: trimRichText(questionForm.opcionD) || null,
      respuesta_correcta: questionForm.respuestaCorrecta,
      explicacion: trimRichText(questionForm.explicacion) || null,
      orden: editingQuestionId
        ? orderedQuestions.find((item) => item.id === editingQuestionId)?.orden || 1
        : orderedQuestions.length + 1,
    }

    const { error } = editingQuestionId
      ? await supabase
          .from('simulador_preguntas')
          .update(payload)
          .eq('id', editingQuestionId)
      : await supabase.from('simulador_preguntas').insert([payload])

    if (error) {
      console.log(error)
      setMensaje('No se pudo guardar la pregunta.')
      clearMessage()
      setIsSavingQuestion(false)
      return
    }

    if (questionForm.guardarEnBanco && user) {
      const { error: bankError } = await supabase.from('banco_preguntas').insert([
        {
          tema: tema || null,
          dificultad: questionForm.dificultad || null,
          enunciado,
          recurso_visual_url: visualResource,
          recurso_visual_alt: normalizeText(questionForm.recursoVisualAlt) || null,
          opcion_a: opcionA,
          opcion_b: opcionB,
          opcion_c: trimRichText(questionForm.opcionC) || null,
          opcion_d: trimRichText(questionForm.opcionD) || null,
          respuesta_correcta: questionForm.respuestaCorrecta,
          explicacion: trimRichText(questionForm.explicacion) || null,
          created_by: user.id,
        },
      ])

      if (bankError) {
        console.log(bankError)
        setMensaje('La pregunta se guardo en el simulador, pero no en el banco.')
        clearMessage()
      }
    }

    setQuestionForm(INITIAL_QUESTION_FORM)
    setQuestionVisualFile(null)
    setEditingQuestionId(null)
    setMensaje('Pregunta guardada con exito.')
    clearMessage()
    setIsSavingQuestion(false)
    await loadData()
  }

  const editQuestion = (pregunta: SimuladorPregunta) => {
    setEditingQuestionId(pregunta.id)
    setQuestionVisualFile(null)
    setQuestionForm({
      tema: pregunta.tema || '',
      dificultad: pregunta.dificultad || 'intermedio',
      enunciado: pregunta.enunciado,
      recursoVisualUrl: pregunta.recurso_visual_url || '',
      recursoVisualAlt: pregunta.recurso_visual_alt || '',
      opcionA: pregunta.opcion_a,
      opcionB: pregunta.opcion_b,
      opcionC: pregunta.opcion_c || '',
      opcionD: pregunta.opcion_d || '',
      respuestaCorrecta: pregunta.respuesta_correcta,
      explicacion: pregunta.explicacion || '',
      guardarEnBanco: true,
    })
  }

  const reorderQuestions = async (next: SimuladorPregunta[]) => {
    await Promise.all(
      next.map((pregunta, index) =>
        supabase
          .from('simulador_preguntas')
          .update({ orden: index + 1 })
          .eq('id', pregunta.id),
      ),
    )
    await loadData()
  }

  const moveQuestion = async (preguntaId: number, direction: 'up' | 'down') => {
    const index = orderedQuestions.findIndex((item) => item.id === preguntaId)
    if (index < 0) return

    const swapIndex = direction === 'up' ? index - 1 : index + 1
    if (swapIndex < 0 || swapIndex >= orderedQuestions.length) return

    const next = [...orderedQuestions]
    ;[next[index], next[swapIndex]] = [next[swapIndex], next[index]]
    await reorderQuestions(next)
  }

  const deleteQuestion = async (preguntaId: number) => {
    const { error } = await supabase.from('simulador_preguntas').delete().eq('id', preguntaId)
    if (error) {
      console.log(error)
      setMensaje('No se pudo eliminar la pregunta.')
      clearMessage()
      return
    }

    setMensaje('Pregunta eliminada.')
    clearMessage()
    await loadData()
  }

  const importarPreguntaDesdeBanco = async (pregunta: PreguntaBanco) => {
    if (!simulador) {
      setMensaje('Primero guarda la configuracion del simulador.')
      clearMessage()
      return
    }

    setIsImportingQuestionId(pregunta.id)
    const { error } = await supabase.from('simulador_preguntas').insert([
      {
        simulador_id: simulador.id,
        tema: pregunta.tema || null,
        dificultad: pregunta.dificultad || null,
        enunciado: pregunta.enunciado,
        recurso_visual_url: pregunta.recurso_visual_url || null,
        recurso_visual_alt: pregunta.recurso_visual_alt || null,
        opcion_a: pregunta.opcion_a,
        opcion_b: pregunta.opcion_b,
        opcion_c: pregunta.opcion_c || null,
        opcion_d: pregunta.opcion_d || null,
        respuesta_correcta: pregunta.respuesta_correcta,
        explicacion: pregunta.explicacion || null,
        orden: orderedQuestions.length + 1,
      },
    ])

    if (error) {
      console.log(error)
      setMensaje('No se pudo importar la pregunta desde el banco.')
      clearMessage()
      setIsImportingQuestionId(null)
      return
    }

    setMensaje('Pregunta importada desde el banco.')
    clearMessage()
    setIsImportingQuestionId(null)
    await loadData()
  }

  return (
    <div className="container admin-course-layout">
      <div className="admin-course-header">
        <button className="resource-button secondary" onClick={() => navigate(-1)}>
          Volver
        </button>
        <div>
          <p className="dashboard-eyebrow">Editor de simulador</p>
          <h2>{contenido?.titulo || 'Simulador'}</h2>
          <p className="dashboard-copy">
            Crea un simulador con cronometro, preguntas secuenciales y retroalimentacion inmediata.
          </p>
        </div>
        <div className="course-page-highlight admin-highlight">
          <span>Preguntas activas</span>
          <strong>{orderedQuestions.length}</strong>
        </div>
      </div>

      {mensaje && (
        <p className={`feedback-banner ${mensaje.includes('exito') || mensaje.includes('guardada') ? 'success' : 'error'}`}>
          {mensaje}
        </p>
      )}

      <div className="admin-main-stack">
        <section className="curso-card admin-editor-card">
          <div className="admin-panel-title">
            <p className="dashboard-eyebrow">Configuracion</p>
            <h3>Parametros del simulador</h3>
          </div>

          <div className="form-grid">
            <input
              value={simulatorForm.titulo}
              placeholder="Titulo visible del simulador"
              onChange={(event) =>
                setSimulatorForm((current) => ({ ...current, titulo: event.target.value }))
              }
            />

            <textarea
              rows={4}
              value={simulatorForm.instrucciones}
              placeholder="Instrucciones iniciales"
              onChange={(event) =>
                setSimulatorForm((current) => ({
                  ...current,
                  instrucciones: event.target.value,
                }))
              }
            />

            <input
              type="number"
              min="1"
              value={simulatorForm.duracionMinutos}
              placeholder="Duracion en minutos"
              onChange={(event) =>
                setSimulatorForm((current) => ({
                  ...current,
                  duracionMinutos: event.target.value,
                }))
              }
            />

            <input
              type="number"
              min="1"
              value={simulatorForm.maxIntentos}
              placeholder="Maximo de intentos (opcional)"
              onChange={(event) =>
                setSimulatorForm((current) => ({
                  ...current,
                  maxIntentos: event.target.value,
                }))
              }
            />

            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={simulatorForm.mostrarResultadoInmediato}
                onChange={(event) =>
                  setSimulatorForm((current) => ({
                    ...current,
                    mostrarResultadoInmediato: event.target.checked,
                  }))
                }
              />
              Mostrar retroalimentacion inmediata al responder
            </label>

            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={simulatorForm.mezclarPreguntas}
                onChange={(event) =>
                  setSimulatorForm((current) => ({
                    ...current,
                    mezclarPreguntas: event.target.checked,
                  }))
                }
              />
              Mezclar preguntas al iniciar
            </label>

            <div className="action-row">
              <button className="resource-button" onClick={() => void saveSimulator()} disabled={isSavingSimulator}>
                {isSavingSimulator ? 'Guardando...' : 'Guardar simulador'}
              </button>
            </div>
          </div>
        </section>

        <section className="curso-card admin-editor-card">
          <div className="admin-panel-title">
            <p className="dashboard-eyebrow">Banco de preguntas</p>
            <h3>{editingQuestionId ? 'Editar pregunta' : 'Nueva pregunta'}</h3>
          </div>

          <p className="editor-hint">
            Usa LaTeX entre <code>$...$</code> para formulas cortas o <code>$$...$$</code> para
            bloques. Ejemplo: <code>$x^2 + y^2 = z^2$</code>.
          </p>

          <div className="form-grid">
            <input
              value={questionForm.tema}
              placeholder="Tema o unidad. Ejemplo: Algebra"
              onChange={(event) =>
                setQuestionForm((current) => ({ ...current, tema: event.target.value }))
              }
            />

            <select
              value={questionForm.dificultad}
              onChange={(event) =>
                setQuestionForm((current) => ({
                  ...current,
                  dificultad: event.target.value as 'basico' | 'intermedio' | 'avanzado',
                }))
              }
            >
              <option value="basico">Dificultad: Basico</option>
              <option value="intermedio">Dificultad: Intermedio</option>
              <option value="avanzado">Dificultad: Avanzado</option>
            </select>

            <textarea
              rows={4}
              value={questionForm.enunciado}
              placeholder="Enunciado de la pregunta. Puedes incluir formulas en LaTeX."
              onChange={(event) =>
                setQuestionForm((current) => ({ ...current, enunciado: event.target.value }))
              }
            />

            <input
              value={questionForm.recursoVisualUrl}
              placeholder="URL de imagen o recurso visual (opcional)"
              onChange={(event) =>
                setQuestionForm((current) => ({
                  ...current,
                  recursoVisualUrl: event.target.value,
                }))
              }
            />

            <label>
              Imagen del recurso visual
              <br />
              <input
                type="file"
                accept="image/*"
                onChange={(event) => setQuestionVisualFile(event.target.files?.[0] || null)}
              />
            </label>

            {questionVisualPreviewUrl && (
              <div className="media-preview-card">
                <p className="resource-type">Vista previa</p>
                <img
                  src={questionVisualPreviewUrl}
                  alt="Vista previa del recurso visual"
                  className="uploaded-media-preview"
                />
              </div>
            )}

            {!questionVisualPreviewUrl && questionForm.recursoVisualUrl && (
              <div className="media-preview-card">
                <p className="resource-type">Vista previa</p>
                <ResourceImage
                  resource={questionForm.recursoVisualUrl}
                  alt="Vista previa del recurso visual"
                  className="uploaded-media-preview"
                />
              </div>
            )}

            <input
              value={questionForm.recursoVisualAlt}
              placeholder="Descripcion corta de la imagen (opcional)"
              onChange={(event) =>
                setQuestionForm((current) => ({
                  ...current,
                  recursoVisualAlt: event.target.value,
                }))
              }
            />

            <input
              value={questionForm.opcionA}
              placeholder="Opcion A. Tambien acepta LaTeX."
              onChange={(event) =>
                setQuestionForm((current) => ({ ...current, opcionA: event.target.value }))
              }
            />

            <input
              value={questionForm.opcionB}
              placeholder="Opcion B. Tambien acepta LaTeX."
              onChange={(event) =>
                setQuestionForm((current) => ({ ...current, opcionB: event.target.value }))
              }
            />

            <input
              value={questionForm.opcionC}
              placeholder="Opcion C (opcional)"
              onChange={(event) =>
                setQuestionForm((current) => ({ ...current, opcionC: event.target.value }))
              }
            />

            <input
              value={questionForm.opcionD}
              placeholder="Opcion D (opcional)"
              onChange={(event) =>
                setQuestionForm((current) => ({ ...current, opcionD: event.target.value }))
              }
            />

            <select
              value={questionForm.respuestaCorrecta}
              onChange={(event) =>
                setQuestionForm((current) => ({
                  ...current,
                  respuestaCorrecta: event.target.value as 'A' | 'B' | 'C' | 'D',
                }))
              }
            >
              <option value="A">Respuesta correcta: A</option>
              <option value="B">Respuesta correcta: B</option>
              <option value="C">Respuesta correcta: C</option>
              <option value="D">Respuesta correcta: D</option>
            </select>

            <textarea
              rows={3}
              value={questionForm.explicacion}
              placeholder="Explicacion o retroalimentacion. Tambien acepta LaTeX."
              onChange={(event) =>
                setQuestionForm((current) => ({
                  ...current,
                  explicacion: event.target.value,
                }))
              }
            />

            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={questionForm.guardarEnBanco}
                onChange={(event) =>
                  setQuestionForm((current) => ({
                    ...current,
                    guardarEnBanco: event.target.checked,
                  }))
                }
              />
              Guardar tambien esta pregunta en el banco reutilizable
            </label>

            <div className="action-row">
              <button className="resource-button" onClick={() => void saveQuestion()} disabled={isSavingQuestion}>
                {isSavingQuestion
                  ? 'Guardando...'
                  : editingQuestionId
                    ? 'Actualizar pregunta'
                    : 'Agregar pregunta'}
              </button>
              {editingQuestionId && (
                <button
                  className="resource-button secondary"
                  onClick={() => {
                    setEditingQuestionId(null)
                    setQuestionVisualFile(null)
                    setQuestionForm(INITIAL_QUESTION_FORM)
                  }}
                >
                  Cancelar
                </button>
              )}
            </div>
          </div>
        </section>

        <section className="curso-card admin-editor-card">
          <div className="admin-panel-title">
            <p className="dashboard-eyebrow">Biblioteca reutilizable</p>
            <h3>Importar desde el banco de preguntas</h3>
          </div>

          <div className="form-grid">
            <input
              list="bank-topics"
              value={bankTopicFilter}
              placeholder="Filtrar por tema"
              onChange={(event) => setBankTopicFilter(event.target.value)}
            />
            <datalist id="bank-topics">
              {temasBanco.map((tema) => (
                <option key={tema} value={tema} />
              ))}
            </datalist>

            <select
              value={bankDifficultyFilter}
              onChange={(event) =>
                setBankDifficultyFilter(
                  event.target.value as 'todos' | 'basico' | 'intermedio' | 'avanzado',
                )
              }
            >
              <option value="todos">Todas las dificultades</option>
              <option value="basico">Basico</option>
              <option value="intermedio">Intermedio</option>
              <option value="avanzado">Avanzado</option>
            </select>
          </div>

          <div className="lesson-content-list">
            {bancoFiltrado.length === 0 && (
              <p className="empty-state">Todavia no hay preguntas que coincidan con ese filtro.</p>
            )}

            {bancoFiltrado.map((pregunta) => (
              <article key={pregunta.id} className="resource-card stacked">
                <div className="resource-main">
                  <div className="meta-row">
                    {pregunta.tema && <span className="status-pill neutral">{pregunta.tema}</span>}
                    {pregunta.dificultad && (
                      <span className="status-pill neutral">{pregunta.dificultad}</span>
                    )}
                  </div>
                  <MathContent
                    text={pregunta.enunciado}
                    className="resource-math-content resource-title"
                  />
                  {pregunta.recurso_visual_url && (
                    <div className="question-visual-preview">
                      <ResourceImage
                        resource={pregunta.recurso_visual_url}
                        alt={pregunta.recurso_visual_alt || 'Recurso visual del banco'}
                        className="uploaded-media-preview"
                      />
                    </div>
                  )}
                  <p>
                    <strong>A.</strong> {pregunta.opcion_a}
                  </p>
                  <p>
                    <strong>B.</strong> {pregunta.opcion_b}
                  </p>
                </div>
                <div className="resource-actions-column">
                  <button
                    className="resource-button"
                    onClick={() => void importarPreguntaDesdeBanco(pregunta)}
                    disabled={isImportingQuestionId === pregunta.id}
                  >
                    {isImportingQuestionId === pregunta.id ? 'Importando...' : 'Importar al simulador'}
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="curso-card admin-editor-card">
          <div className="admin-panel-title">
            <p className="dashboard-eyebrow">Vista previa</p>
            <h3>Preguntas del simulador</h3>
          </div>

          <div className="lesson-content-list">
            {orderedQuestions.length === 0 && (
              <p className="empty-state">Aun no hay preguntas en este simulador.</p>
            )}

            {orderedQuestions.map((pregunta) => (
              <article key={pregunta.id} className="resource-card stacked">
                <div className="resource-main">
                  <p className="resource-type">Pregunta {pregunta.orden}</p>
                  <div className="meta-row">
                    {pregunta.tema && <span className="status-pill neutral">{pregunta.tema}</span>}
                    {pregunta.dificultad && (
                      <span className="status-pill neutral">{pregunta.dificultad}</span>
                    )}
                  </div>
                  <MathContent text={pregunta.enunciado} className="resource-math-content resource-title" />
                  {pregunta.recurso_visual_url && (
                    <div className="question-visual-preview">
                      <ResourceImage
                        resource={pregunta.recurso_visual_url}
                        alt={pregunta.recurso_visual_alt || 'Recurso visual de la pregunta'}
                        className="uploaded-media-preview"
                      />
                    </div>
                  )}
                  <p>
                    <strong>A.</strong>{' '}
                    <MathContent text={pregunta.opcion_a} className="resource-math-content inline" />
                  </p>
                  <p>
                    <strong>B.</strong>{' '}
                    <MathContent text={pregunta.opcion_b} className="resource-math-content inline" />
                  </p>
                  {pregunta.opcion_c && (
                    <p>
                      <strong>C.</strong>{' '}
                      <MathContent text={pregunta.opcion_c} className="resource-math-content inline" />
                    </p>
                  )}
                  {pregunta.opcion_d && (
                    <p>
                      <strong>D.</strong>{' '}
                      <MathContent text={pregunta.opcion_d} className="resource-math-content inline" />
                    </p>
                  )}
                  {pregunta.explicacion && (
                    <MathContent
                      text={pregunta.explicacion}
                      className="resource-math-content resource-explanation"
                    />
                  )}
                  <div className="meta-row">
                    <span className="status-pill neutral">
                      Respuesta correcta: {pregunta.respuesta_correcta}
                    </span>
                  </div>
                </div>
                <div className="resource-actions-column">
                  <button className="resource-button secondary" onClick={() => void moveQuestion(pregunta.id, 'up')}>
                    Subir
                  </button>
                  <button className="resource-button secondary" onClick={() => void moveQuestion(pregunta.id, 'down')}>
                    Bajar
                  </button>
                  <button className="resource-button" onClick={() => editQuestion(pregunta)}>
                    Editar
                  </button>
                  <button className="resource-button secondary" onClick={() => void deleteQuestion(pregunta.id)}>
                    Eliminar
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}
