import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../services/supabaseClient'
import { normalizeText } from '../utils/security'
import type { ContenidoLeccion, Simulador, SimuladorPregunta } from '../types'

interface SimulatorFormState {
  titulo: string
  instrucciones: string
  duracionMinutos: string
  mostrarResultadoInmediato: boolean
  mezclarPreguntas: boolean
}

interface QuestionFormState {
  enunciado: string
  opcionA: string
  opcionB: string
  opcionC: string
  opcionD: string
  respuestaCorrecta: 'A' | 'B' | 'C' | 'D'
  explicacion: string
}

const INITIAL_SIMULATOR_FORM: SimulatorFormState = {
  titulo: '',
  instrucciones: '',
  duracionMinutos: '20',
  mostrarResultadoInmediato: true,
  mezclarPreguntas: false,
}

const INITIAL_QUESTION_FORM: QuestionFormState = {
  enunciado: '',
  opcionA: '',
  opcionB: '',
  opcionC: '',
  opcionD: '',
  respuestaCorrecta: 'A',
  explicacion: '',
}

export default function SimuladorEditor() {
  const { contenidoId } = useParams()
  const navigate = useNavigate()
  const contenidoNumericId = Number(contenidoId)

  const [contenido, setContenido] = useState<ContenidoLeccion | null>(null)
  const [simulador, setSimulador] = useState<Simulador | null>(null)
  const [preguntas, setPreguntas] = useState<SimuladorPregunta[]>([])
  const [simulatorForm, setSimulatorForm] = useState<SimulatorFormState>(INITIAL_SIMULATOR_FORM)
  const [questionForm, setQuestionForm] = useState<QuestionFormState>(INITIAL_QUESTION_FORM)
  const [editingQuestionId, setEditingQuestionId] = useState<number | null>(null)
  const [mensaje, setMensaje] = useState('')
  const [isSavingSimulator, setIsSavingSimulator] = useState(false)
  const [isSavingQuestion, setIsSavingQuestion] = useState(false)

  useEffect(() => {
    void loadData()
  }, [contenidoId])

  const orderedQuestions = useMemo(
    () => [...preguntas].sort((a, b) => a.orden - b.orden || a.id - b.id),
    [preguntas],
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
    ])

    if (contenidoError || simuladorError || preguntasError) {
      console.log(contenidoError || simuladorError || preguntasError)
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

    if (simuladorData) {
      setSimulatorForm({
        titulo: simuladorData.titulo || contenidoData?.titulo || '',
        instrucciones: simuladorData.instrucciones || '',
        duracionMinutos: String(simuladorData.duracion_minutos || 20),
        mostrarResultadoInmediato: simuladorData.mostrar_resultado_inmediato,
        mezclarPreguntas: simuladorData.mezclar_preguntas,
      })
    }
  }

  const clearMessage = () => {
    window.setTimeout(() => setMensaje(''), 3500)
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
    if (!Number.isInteger(duracion) || duracion <= 0) {
      setMensaje('La duracion del simulador debe ser valida.')
      clearMessage()
      return
    }

    setIsSavingSimulator(true)
    const payload = {
      contenido_id: contenido.id,
      titulo: normalizeText(simulatorForm.titulo) || contenido.titulo,
      instrucciones: normalizeText(simulatorForm.instrucciones),
      duracion_minutos: duracion,
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

    const enunciado = normalizeText(questionForm.enunciado)
    const opcionA = normalizeText(questionForm.opcionA)
    const opcionB = normalizeText(questionForm.opcionB)

    if (!enunciado || !opcionA || !opcionB) {
      setMensaje('Completa el enunciado y al menos las opciones A y B.')
      clearMessage()
      return
    }

    setIsSavingQuestion(true)
    const payload = {
      simulador_id: simulador.id,
      enunciado,
      opcion_a: opcionA,
      opcion_b: opcionB,
      opcion_c: normalizeText(questionForm.opcionC),
      opcion_d: normalizeText(questionForm.opcionD),
      respuesta_correcta: questionForm.respuestaCorrecta,
      explicacion: normalizeText(questionForm.explicacion),
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

    setQuestionForm(INITIAL_QUESTION_FORM)
    setEditingQuestionId(null)
    setMensaje('Pregunta guardada con exito.')
    clearMessage()
    setIsSavingQuestion(false)
    await loadData()
  }

  const editQuestion = (pregunta: SimuladorPregunta) => {
    setEditingQuestionId(pregunta.id)
    setQuestionForm({
      enunciado: pregunta.enunciado,
      opcionA: pregunta.opcion_a,
      opcionB: pregunta.opcion_b,
      opcionC: pregunta.opcion_c || '',
      opcionD: pregunta.opcion_d || '',
      respuestaCorrecta: pregunta.respuesta_correcta,
      explicacion: pregunta.explicacion || '',
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

          <div className="form-grid">
            <textarea
              rows={4}
              value={questionForm.enunciado}
              placeholder="Enunciado de la pregunta"
              onChange={(event) =>
                setQuestionForm((current) => ({ ...current, enunciado: event.target.value }))
              }
            />

            <input
              value={questionForm.opcionA}
              placeholder="Opcion A"
              onChange={(event) =>
                setQuestionForm((current) => ({ ...current, opcionA: event.target.value }))
              }
            />

            <input
              value={questionForm.opcionB}
              placeholder="Opcion B"
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
              placeholder="Explicacion o retroalimentacion"
              onChange={(event) =>
                setQuestionForm((current) => ({
                  ...current,
                  explicacion: event.target.value,
                }))
              }
            />

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
                  <h4>{pregunta.enunciado}</h4>
                  <p>A. {pregunta.opcion_a}</p>
                  <p>B. {pregunta.opcion_b}</p>
                  {pregunta.opcion_c && <p>C. {pregunta.opcion_c}</p>}
                  {pregunta.opcion_d && <p>D. {pregunta.opcion_d}</p>}
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
