import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../services/supabaseClient'
import type {
  ContenidoLeccion,
  Simulador,
  SimuladorIntento,
  SimuladorPregunta,
} from '../types'

type AnswerMap = Record<number, 'A' | 'B' | 'C' | 'D'>

export default function SimuladorPlayer() {
  const { contenidoId } = useParams()
  const navigate = useNavigate()
  const contenidoNumericId = Number(contenidoId)

  const [contenido, setContenido] = useState<ContenidoLeccion | null>(null)
  const [simulador, setSimulador] = useState<Simulador | null>(null)
  const [preguntas, setPreguntas] = useState<SimuladorPregunta[]>([])
  const [answers, setAnswers] = useState<AnswerMap>({})
  const [currentIndex, setCurrentIndex] = useState(0)
  const [started, setStarted] = useState(false)
  const [finished, setFinished] = useState(false)
  const [secondsLeft, setSecondsLeft] = useState(0)
  const [mensaje, setMensaje] = useState('')
  const [lastIntento, setLastIntento] = useState<SimuladorIntento | null>(null)

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
          .limit(1),
      )
    }

    const [contenidoRes, simuladorRes, preguntasRes, intentoRes] = await Promise.all(requests)

    if (contenidoRes.error || simuladorRes.error || preguntasRes.error || intentoRes?.error) {
      console.log(contenidoRes.error || simuladorRes.error || preguntasRes.error || intentoRes?.error)
      setMensaje('No se pudo cargar el simulador.')
      return
    }

    setContenido(contenidoRes.data || null)
    setSimulador(simuladorRes.data || null)
    const questionRows = (preguntasRes.data || []) as SimuladorPregunta[]
    const list = questionRows.filter(
      (pregunta) => pregunta.simulador_id === simuladorRes.data?.id,
    )
    const ordered = simuladorRes.data?.mezclar_preguntas
      ? [...list].sort(() => Math.random() - 0.5)
      : list
    setPreguntas(ordered)
    setLastIntento((intentoRes?.data as SimuladorIntento[] | undefined)?.[0] || null)
    setSecondsLeft((simuladorRes.data?.duracion_minutos || 20) * 60)
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

  const finishSimulator = async () => {
    if (!simulador) return

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      setMensaje('Debes iniciar sesion para guardar tu intento.')
      return
    }

    setFinished(true)

    const payload = {
      simulador_id: simulador.id,
      estudiante_id: user.id,
      puntaje: correctCount,
      total_preguntas: preguntas.length,
      tiempo_segundos: (simulador.duracion_minutos * 60) - secondsLeft,
      respuestas: answers,
    }

    const { error } = await supabase.from('simulador_intentos').insert([payload])

    if (error) {
      console.log(error)
      setMensaje('No se pudo guardar el intento del simulador.')
      return
    }

    setMensaje('Simulador completado con exito.')
    await loadSimulator()
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
        <button className="resource-button secondary" onClick={() => navigate(-1)}>
          Volver
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
          <p className="module-description">
            {simulador?.instrucciones ||
              'Al iniciar, comienza el cronometro. Cada reactivo acepta una sola respuesta.'}
          </p>
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
          </div>
          <button className="resource-button" onClick={() => setStarted(true)}>
            Iniciar simulador
          </button>
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

          <h3>{currentQuestion.enunciado}</h3>

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
                  <span>{content}</span>
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
                <p className="module-description">{currentQuestion.explicacion}</p>
              )}
            </div>
          )}

          <div className="action-row">
            <button
              className="resource-button"
              onClick={() => void nextQuestion()}
              disabled={!answers[currentQuestion.id]}
            >
              {currentIndex === preguntas.length - 1 ? 'Finalizar simulador' : 'Siguiente pregunta'}
            </button>
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
              <span>Respuestas</span>
              <strong>{answeredCount}</strong>
            </div>
            <div className="summary-chip">
              <span>Tiempo usado</span>
              <strong>{formatTime((simulador?.duracion_minutos || 20) * 60 - secondsLeft)}</strong>
            </div>
          </div>
          <button className="resource-button" onClick={() => window.location.reload()}>
            Intentarlo de nuevo
          </button>
        </section>
      )}
    </div>
  )
}
