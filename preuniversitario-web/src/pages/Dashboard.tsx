import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../services/supabaseClient'
import { normalizeText } from '../utils/security'
import type { Curso, EntregaActividad, Perfil } from '../types'

export default function Dashboard() {
  const [cursos, setCursos] = useState<Curso[]>([])
  const [entregas, setEntregas] = useState<EntregaActividad[]>([])
  const [perfil, setPerfil] = useState<Perfil | null>(null)
  const [loading, setLoading] = useState(true)
  const [mensaje, setMensaje] = useState('')
  const [showCourseForm, setShowCourseForm] = useState(false)
  const [courseName, setCourseName] = useState('')
  const [courseDescription, setCourseDescription] = useState('')
  const [isCreatingCourse, setIsCreatingCourse] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    void cargarDashboard()
  }, [])

  const cargarDashboard = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      setLoading(false)
      return
    }

    const requests = [
      supabase.from('cursos').select('*').order('nombre'),
      supabase.from('perfiles').select('id, rol').eq('id', user.id).maybeSingle(),
    ]

    requests.push(
      supabase
        .from('entregas_actividades')
        .select('*')
        .eq('estudiante_id', user.id)
        .order('created_at', { ascending: false }),
    )

    const [cursosResult, perfilResult, entregasResult] = await Promise.all(requests)

    setCursos(cursosResult.data || [])
    setPerfil((perfilResult.data as Perfil | null) || null)
    setEntregas((entregasResult.data as EntregaActividad[] | undefined) || [])
    setLoading(false)
  }

  const isAdmin = perfil?.rol === 'admin'
  const calificadas = entregas.filter((entrega) => entrega.nota !== null && entrega.nota !== undefined)
  const promedioGeneral =
    calificadas.length > 0
      ? calificadas.reduce((total, entrega) => total + (entrega.nota || 0), 0) / calificadas.length
      : null
  const pendientesRevision = entregas.filter((entrega) => entrega.estado === 'entregado').length

  const clearMessage = () => {
    window.setTimeout(() => setMensaje(''), 3500)
  }

  const crearCurso = async () => {
    const nombre = normalizeText(courseName)
    const descripcion = normalizeText(courseDescription)

    if (!nombre) {
      setMensaje('Escribe el nombre del curso.')
      clearMessage()
      return
    }

    setIsCreatingCourse(true)

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      setMensaje('Tu sesion expiro. Inicia sesion otra vez.')
      setIsCreatingCourse(false)
      clearMessage()
      return
    }

    const { data: profile } = await supabase
      .from('perfiles')
      .select('rol')
      .eq('id', user.id)
      .maybeSingle()

    if (profile?.rol !== 'admin') {
      setMensaje('No tienes permisos para crear cursos.')
      setIsCreatingCourse(false)
      clearMessage()
      return
    }

    const { error } = await supabase.from('cursos').insert([
      {
        nombre,
        descripcion,
      },
    ])

    if (error) {
      console.log(error)
      setMensaje('No se pudo crear el curso.')
      setIsCreatingCourse(false)
      clearMessage()
      return
    }

    setCourseName('')
    setCourseDescription('')
    setShowCourseForm(false)
    setMensaje('Curso creado con exito.')
    setIsCreatingCourse(false)
    await cargarDashboard()
    clearMessage()
  }

  if (loading) {
    return <div className="container"><p>Cargando dashboard...</p></div>
  }

  return (
    <div className="container dashboard-shell">
      <section className="dashboard-hero">
        <div>
          <p className="dashboard-eyebrow">
            {isAdmin ? 'Panel de administracion' : 'Campus del estudiante'}
          </p>
          <h2>{isAdmin ? 'Gestiona tus cursos' : 'Continua tu aprendizaje'}</h2>
          <p className="dashboard-copy">
            {isAdmin
              ? 'Entra a cada curso para editar sus clases, actividades, guias, simuladores y pruebas por separado.'
              : 'Abre cada curso para revisar clases, recursos y actividades en un formato mas claro e interactivo.'}
          </p>
        </div>

        <div className="dashboard-hero-stats">
          <article className="hero-stat-card">
            <span>Total de cursos</span>
            <strong>{cursos.length}</strong>
          </article>
          <article className="hero-stat-card">
            <span>Modo actual</span>
            <strong>{isAdmin ? 'Administrador' : 'Estudiante'}</strong>
          </article>
          {!isAdmin && (
            <article className="hero-stat-card">
              <span>Promedio</span>
              <strong>{promedioGeneral !== null ? promedioGeneral.toFixed(1) : 'Sin notas'}</strong>
            </article>
          )}
        </div>
      </section>

      {mensaje && (
        <p className={`feedback-banner ${mensaje.includes('exito') ? 'success' : 'error'}`}>
          {mensaje}
        </p>
      )}

      {!isAdmin && (
        <section className="dashboard-grid">
          <article className="curso-card dashboard-course-card student">
            <div className="dashboard-course-top">
              <span className="dashboard-course-pill">Entregas</span>
              <h3>{entregas.length}</h3>
            </div>
            <p className="dashboard-course-description">
              Actividades que ya registraste en la plataforma.
            </p>
          </article>

          <article className="curso-card dashboard-course-card student">
            <div className="dashboard-course-top">
              <span className="dashboard-course-pill">Calificadas</span>
              <h3>{calificadas.length}</h3>
            </div>
            <p className="dashboard-course-description">
              Entregas que ya tienen nota y retroalimentacion.
            </p>
          </article>

          <article className="curso-card dashboard-course-card student">
            <div className="dashboard-course-top">
              <span className="dashboard-course-pill">Pendientes de revision</span>
              <h3>{pendientesRevision}</h3>
            </div>
            <p className="dashboard-course-description">
              Actividades enviadas que todavia esperan revision docente.
            </p>
          </article>
        </section>
      )}

      {isAdmin && (
        <section className="curso-card admin-editor-card">
          <div className="resource-heading">
            <div>
              <p className="dashboard-eyebrow">Gestion de cursos</p>
              <h3>{showCourseForm ? 'Crear nuevo curso' : 'Tus cursos'}</h3>
            </div>
            <button
              className="resource-button"
              onClick={() => setShowCourseForm((current) => !current)}
            >
              {showCourseForm ? 'Cerrar' : '+ Nuevo curso'}
            </button>
          </div>

          {showCourseForm && (
            <div className="form-grid">
              <input
                value={courseName}
                placeholder="Nombre del curso"
                onChange={(event) => setCourseName(event.target.value)}
              />
              <textarea
                rows={3}
                value={courseDescription}
                placeholder="Descripcion del curso"
                onChange={(event) => setCourseDescription(event.target.value)}
              />
              <div className="action-row">
                <button
                  className="resource-button"
                  onClick={() => void crearCurso()}
                  disabled={isCreatingCourse}
                >
                  {isCreatingCourse ? 'Creando...' : 'Crear curso'}
                </button>
                <button
                  className="resource-button secondary"
                  onClick={() => {
                    setShowCourseForm(false)
                    setCourseName('')
                    setCourseDescription('')
                  }}
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      <section className="dashboard-grid">
        {cursos.map((curso) => (
          <article
            key={curso.id}
            className={`curso-card dashboard-course-card ${isAdmin ? 'admin' : 'student'}`}
            onClick={() =>
              navigate(isAdmin ? `/admin/curso/${curso.id}` : `/curso/${curso.id}`)
            }
          >
            <div className="dashboard-course-top">
              <span className="dashboard-course-pill">
                {isAdmin ? 'Gestionar curso' : 'Entrar al curso'}
              </span>
              <h3>{curso.nombre}</h3>
            </div>
            <p className="dashboard-course-description">{curso.descripcion}</p>
            <div className="dashboard-course-footer">
              <span>{isAdmin ? 'Clases y actividades' : 'Contenido del modulo'}</span>
              <strong>{isAdmin ? 'Abrir panel' : 'Ver curso'}</strong>
            </div>
          </article>
        ))}
      </section>
    </div>
  )
}
