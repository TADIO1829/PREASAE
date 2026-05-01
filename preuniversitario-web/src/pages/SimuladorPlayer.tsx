import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import MathContent from '../components/MathContent'
import ResourceImage from '../components/ResourceImage'
import { supabase } from '../services/supabaseClient'
import { getEntregaStatus } from '../utils/activityStatus'
import type {
  ContenidoLeccion,
  EntregaActividad,
  Leccion,
  Simulador,
  SimuladorIntento,
  SimuladorPregunta,
} from '../types'

type AnswerMap = Record<number, 'A' | 'B' | 'C' | 'D'>

export default function SimuladorPlayer() {
  const { contenidoId } = useParams()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const contenidoNumericId = Number(contenidoId)
  const courseId = searchParams.get('curso')

  const [contenido, setContenido] = useState<ContenidoLeccion | null>(null)
  const [leccion, setLeccion] = useState<Leccion | null>(null)
  const [simulador, setSimulador] = useState<Simulador | null>(null)
  const [preguntas, setPreguntas] = useState<SimuladorPregunta[]>([])
  const [answers, setAnswers] = useState<AnswerMap>({})
  const [attempts, setAttempts] = useState<SimuladorIntento[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [started, setStarted] = useState(false)
  const [finished, setFinished] = useState(false)
  const [secondsLeft, setSecondsLeft] = useState(0)
  const [finalTimeUsed, setFinalTimeUsed] = useState<number | null>(null)
  const [mensaje, setMensaje] = useState('')
  const [lastIntento, setLastIntento] = useState<SimuladorIntento | null>(null)
  const [isFinishing, setIsFinishing] = useState(false)

  useEffect(() => {
    void loadSimulator()
  }, [contenidoId])

  useEffect(() => {
    if (!started || finished || secondsLeft <= 0) return

    const timer = window.setInterval(() => {
      setSecondsLeft((current) => current - 1)
    }, 1000)

    return () => window.clearInterval(timer)
  }, [started, finished, secondsLeft])

  useEffect(() => {
    if (started && !finished && secondsLeft <= 0) {
      void finishSimulator()
    }
  }, [started, finished, secondsLeft])

  const currentQuestion = preguntas[currentIndex]

  const answeredCount = useMemo(
    () => Object.keys(answers).length,
    [answers],
  )

  const correctCount = useMemo(
    () =>
      preguntas.filter((pregunta) => answers[pregunta.id] === pregunta.respuesta_correcta).length,
    [preguntas, answers],
  )

  const loadSimulator = async () => {
    if (!Number.isInteger(contenidoNumericId) || contenidoNumericId <= 0) {
      setMensaje('Simulador invalido.')
      return
    }

    const {
      data: { user },
    } = await supabase.auth.getUser()

    const requests = [
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
    ]

    if (user) {
      requests.push(
        supabase
          .from('simulador_intentos')
          .select('*')
          .eq('estudiante_id', user.id)
          .order('created_at', { ascending: false })
          .order('id', { ascending: false }),
      )
    }

    const [contenidoRes, simuladorRes, preguntasRes, intentoRes] = await Promise.all(requests)

    if (contenidoRes.error || simuladorRes.error || preguntasRes.error || intentoRes?.error) {
      console.log(contenidoRes.error || simuladorRes.error || preguntasRes.error || intentoRes?.error)
      setMensaje('No se pudo cargar el simulador.')
      return
    }

    let leccionData: Leccion | null = null
    if (contenidoRes.data?.leccion_id) {
      const { data: lessonRow, error: lessonError } = await supabase
        .from('lecciones')
        .select('*')
        .eq('id', contenidoRes.data.leccion_id)
        .maybeSingle()

      if (lessonError) {
        console.log(lessonError)
      } else {
        leccionData = lessonRow || null
      }
    }

    setContenido(contenidoRes.data || null)
    setLeccion(leccionData)
    setSimulador(simuladorRes.data || null)
    const questionRows = (preguntasRes.data || []) as SimuladorPregunta[]
    const list = questionRows.filter(
      (pregunta) => pregunta.simulador_id === simuladorRes.data?.id,
    )
    const ordered = simuladorRes.data?.mezclar_preguntas
      ? [...list].sort(() => Math.random() - 0.5)
      : list
    setPreguntas(ordered)
    const allAttempts = ((intentoRes?.data as SimuladorIntento[] | undefined) || []).filter(
      (intento) => intento.simulador_id === simuladorRes.data?.id,
    )
    const latestAttempt = allAttempts[0] || null
    setAttempts(allAttempts)
    setLastIntento(latestAttempt)

    if (!started && !finished) {
      setSecondsLeft((simuladorRes.data?.duracion_minutos || 20) * 60)
    }
  }

  const formatTime = (value: number) => {
    const minutes = Math.floor(value / 60)
    const seconds = value % 60
    return `${minutes}:${seconds.toString().padStart(2, '0')}`
  }

  const selectAnswer = (option: 'A' | 'B' | 'C' | 'D') => {
    if (!currentQuestion || answers[currentQuestion.id]) return
    setAnswers((current) => ({
      ...current,
      [currentQuestion.id]: option,
    }))
  }

  const goBackToCourse = () => {
    if (courseId) {
      navigate(`/curso/${courseId}`)
      return
    }

    navigate(-1)
  }

  const registrarEntregaSimulador = async (
    userId: string,
    score: number,
    usedSeconds: number,
    intentoId: number,
  ) => {
    if (!contenido?.acepta_entrega || !leccion) return

    const { data: entregaActual, error: entregaActualError } = await supabase
      .from('entregas_actividades')
      .select('*')
      .eq('contenido_id', contenido.id)
      .eq('estudiante_id', userId)
      .maybeSingle()

    if (entregaActualError) {
      throw entregaActualError
    }

    const status = getEntregaStatus(leccion, contenido, entregaActual as EntregaActividad | null)
    const payload = {
      contenido_id: contenido.id,
      estudiante_id: userId,
      archivo_url: entregaActual?.archivo_url || null,
      simulador_intento_id: intentoId,
      comentario: `Simulador completado: ${score}/${preguntas.length} en ${formatTime(usedSeconds)}.`,
      estado: status === 'vencido' ? 'vencido' : 'entregado',
      entregado_en: new Date().toISOString(),
      nota: null,
      retroalimentacion: null,
    }

    const { error } = await supabase
      .from('entregas_actividades')
      .upsert(payload, { onConflict: 'contenido_id,estudiante_id' })

    if (error) {
      throw error
    }
  }

  const finishSimulator = async () => {
    if (!simulador || isFinishing) return

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      setMensaje('Debes iniciar sesion para guardar tu intento.')
      return
    }

    if (simulador.max_intentos && attempts.length >= simulador.max_intentos) {
      setMensaje('Ya alcanzaste el maximo de intentos permitido para este simulador.')
      return
    }

    setIsFinishing(true)
    const timeUsed = Math.max(0, (simulador.duracion_minutos * 60) - secondsLeft)
    setFinished(true)
    setFinalTimeUsed(timeUsed)

    const payload = {
      simulador_id: simulador.id,
      estudiante_id: user.id,
      puntaje: correctCount,
      total_preguntas: preguntas.length,
      numero_intento: attempts.length + 1,
      tiempo_segundos: timeUsed,
      respuestas: answers,
    }

    const { data: intentoGuardado, error } = await supabase
      .from('simulador_intentos')
      .insert([payload])
      .select()
      .single()

    if (error) {
      console.log(error)
      setMensaje('No se pudo guardar el intento del simulador.')
      setIsFinishing(false)
      return
    }

    try {
      await registrarEntregaSimulador(user.id, correctCount, timeUsed, intentoGuardado.id)
    } catch (submissionError) {
      console.log(submissionError)
      setMensaje(
        'El simulador se guardo, pero no se pudo registrar la entrega de la actividad.',
      )
      setLastIntento((intentoGuardado as SimuladorIntento) || null)
      setIsFinishing(false)
      return
    }

    setLastIntento((intentoGuardado as SimuladorIntento) || null)
    setAttempts((current) => [(intentoGuardado as SimuladorIntento), ...current])
    setMensaje('Simulador completado con exito.')
    setIsFinishing(false)
  }

  const nextQuestion = async () => {
    if (!currentQuestion) return

    if (currentIndex === preguntas.length - 1) {
      await finishSimulator()
      return
    }

    setCurrentIndex((current) => current + 1)
  }

  return (
    <div className="container simulator-shell">
      <div className="admin-course-header">
        <button className="resource-button secondary" onClick={goBackToCourse}>
          {courseId ? 'Volver al curso' : 'Volver'}
        </button>
        <div>
          <p className="dashboard-eyebrow">Simulador interactivo</p>
          <h2>{simulador?.titulo || contenido?.titulo || 'Simulador'}</h2>
          <p className="dashboard-copy">
            Responde una sola vez cada reactivo y administra tu tiempo como si fuera una evaluacion real.
          </p>
        </div>
        <div className="course-page-highlight admin-highlight">
          <span>Tiempo restante</span>
          <strong>{formatTime(secondsLeft)}</strong>
        </div>
      </div>

      {mensaje && (
        <p className={`feedback-banner ${mensaje.includes('exito') ? 'success' : 'error'}`}>
          {mensaje}
        </p>
      )}

      {!started && !finished && (
        <section className="curso-card simulator-start-card">
          <p className="dashboard-eyebrow">Antes de comenzar</p>
          <h3>{simulador?.titulo || contenido?.titulo}</h3>
          <MathContent
            text={
              simulador?.instrucciones ||
              'Al iniciar, comienza el cronometro. Cada reactivo acepta una sola respuesta.'
            }
            className="module-description resource-math-content"
          />
          <div className="admin-class-summary">
            <div className="summary-chip">
              <span>Preguntas</span>
              <strong>{preguntas.length}</strong>
            </div>
            <div className="summary-chip">
              <span>Duracion</span>
              <strong>{simulador?.duracion_minutos || 20} min</strong>
            </div>
            <div className="summary-chip">
              <span>Ultimo intento</span>
              <strong>
                {lastIntento
                  ? `${lastIntento.puntaje}/${lastIntento.total_preguntas}`
                  : 'Sin intentos'}
              </strong>
            </div>
            <div className="summary-chip">
              <span>Intentos usados</span>
              <strong>
                {attempts.length}
                {simulador?.max_intentos ? `/${simulador.max_intentos}` : ''}
              </strong>
            </div>
          </div>
          <button
            className="resource-button"
            onClick={() => {
              if (simulador?.max_intentos && attempts.length >= simulador.max_intentos) {
                setMensaje('Ya alcanzaste el maximo de intentos permitido para este simulador.')
                return
              }
              setFinalTimeUsed(null)
              setMensaje('')
              setAnswers({})
              setCurrentIndex(0)
              setFinished(false)
              setSecondsLeft((simulador?.duracion_minutos || 20) * 60)
              setStarted(true)
            }}
            disabled={Boolean(simulador?.max_intentos && attempts.length >= simulador.max_intentos)}
          >
            {simulador?.max_intentos && attempts.length >= simulador.max_intentos
              ? 'Intentos agotados'
              : 'Iniciar simulador'}
          </button>
          {courseId && (
            <button className="resource-button secondary" onClick={goBackToCourse}>
              Volver al curso
            </button>
          )}
        </section>
      )}

      {started && !finished && currentQuestion && (
        <section className="curso-card simulator-question-card">
          <div className="resource-heading">
            <p className="resource-type">
              Pregunta {currentIndex + 1} de {preguntas.length}
            </p>
            <span className="status-pill neutral">
              Respondidas {answeredCount}/{preguntas.length}
            </span>
          </div>

          <h3>
            <MathContent text={currentQuestion.enunciado} className="resource-math-content resource-title" />
          </h3>

          {currentQuestion.recurso_visual_url && (
            <div className="question-visual-preview student">
              <ResourceImage
                resource={currentQuestion.recurso_visual_url}
                alt={currentQuestion.recurso_visual_alt || 'Recurso visual de la pregunta'}
                className="uploaded-media-preview"
              />
            </div>
          )}

          <div className="simulator-options">
            {(['A', 'B', 'C', 'D'] as const).map((option) => {
              const content =
                option === 'A'
                  ? currentQuestion.opcion_a
                  : option === 'B'
                    ? currentQuestion.opcion_b
                    : option === 'C'
                      ? currentQuestion.opcion_c
                      : currentQuestion.opcion_d

              if (!content) return null

              const selected = answers[currentQuestion.id] === option
              const correct = currentQuestion.respuesta_correcta === option
              const showFeedback = Boolean(
                answers[currentQuestion.id] && simulador?.mostrar_resultado_inmediato,
              )

              return (
                <button
                  key={option}
                  className={`simulator-option ${selected ? 'selected' : ''} ${
                    showFeedback && correct ? 'correct' : ''
                  } ${showFeedback && selected && !correct ? 'incorrect' : ''}`}
                  onClick={() => selectAnswer(option)}
                  disabled={Boolean(answers[currentQuestion.id])}
                >
                  <strong>{option}</strong>
                  <MathContent text={content} className="resource-math-content inline" />
                </button>
              )
            })}
          </div>

          {answers[currentQuestion.id] && simulador?.mostrar_resultado_inmediato && (
            <div className="simulator-feedback">
              <p className={`feedback-banner ${
                answers[currentQuestion.id] === currentQuestion.respuesta_correcta
                  ? 'success'
                  : 'error'
              }`}>
                {answers[currentQuestion.id] === currentQuestion.respuesta_correcta
                  ? 'Respuesta correcta.'
                  : `Respuesta incorrecta. La correcta es ${currentQuestion.respuesta_correcta}.`}
              </p>
              {currentQuestion.explicacion && (
                <MathContent
                  text={currentQuestion.explicacion}
                  className="module-description resource-math-content"
                />
              )}
            </div>
          )}

          <div className="action-row">
            <button
              className="resource-button"
              onClick={() => void nextQuestion()}
              disabled={!answers[currentQuestion.id] || isFinishing}
            >
              {currentIndex === preguntas.length - 1
                ? isFinishing
                  ? 'Guardando resultado...'
                  : 'Finalizar simulador'
                : 'Siguiente pregunta'}
            </button>
            {courseId && (
              <button className="resource-button secondary" onClick={goBackToCourse}>
                Salir al curso
              </button>
            )}
          </div>
        </section>
      )}

      {finished && (
        <section className="curso-card simulator-result-card">
          <p className="dashboard-eyebrow">Resultado final</p>
          <h3>Completaste el simulador</h3>
          <div className="admin-class-summary">
            <div className="summary-chip">
              <span>Puntaje</span>
              <strong>{correctCount}/{preguntas.length}</strong>
            </div>
            <div className="summary-chip">
              <span>Intento</span>
              <strong>{lastIntento?.numero_intento || attempts[0]?.numero_intento || attempts.length || 1}</strong>
            </div>
            <div className="summary-chip">
              <span>Respuestas</span>
              <strong>{answeredCount}</strong>
            </div>
            <div className="summary-chip">
              <span>Tiempo usado</span>
              <strong>{formatTime(finalTimeUsed ?? lastIntento?.tiempo_segundos ?? 0)}</strong>
            </div>
          </div>
          <div className="action-row">
            <button className="resource-button" onClick={() => window.location.reload()}>
              Intentarlo de nuevo
            </button>
            {courseId && (
              <button className="resource-button secondary" onClick={goBackToCourse}>
                Volver al curso
              </button>
            )}
          </div>
        </section>
      )}
    </div>
  )
}
