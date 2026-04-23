import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../services/supabaseClient'
import type { Curso, Perfil } from '../types'

export default function Dashboard() {
  const [cursos, setCursos] = useState<Curso[]>([])
  const [perfil, setPerfil] = useState<Perfil | null>(null)
  const [loading, setLoading] = useState(true)
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

    const [{ data: cursosData }, { data: perfilData }] = await Promise.all([
      supabase.from('cursos').select('*').order('nombre'),
      supabase.from('perfiles').select('id, rol').eq('id', user.id).maybeSingle(),
    ])

    setCursos(cursosData || [])
    setPerfil((perfilData as Perfil | null) || null)
    setLoading(false)
  }

  const isAdmin = perfil?.rol === 'admin'

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
          <h2>{isAdmin ? 'Gestiona tus cursos como en Moodle' : 'Continua tu aprendizaje'}</h2>
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
        </div>
      </section>

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
