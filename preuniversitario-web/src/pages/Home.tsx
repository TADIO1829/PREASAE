import { useNavigate } from 'react-router-dom'

export default function Home() {
  const navigate = useNavigate()

  return (
    <main className="landing-shell">
      <section className="landing-hero">
        <div className="landing-copy">
          <p className="landing-kicker">Plataforma academica</p>
          <h1>Preuniversitario ASAE</h1>
          <p className="landing-description">
            Un campus digital para organizar clases, guias, simuladores, pruebas y
            actividades con una experiencia mas clara para estudiantes y docentes.
          </p>

          <div className="landing-actions">
            <button className="resource-button landing-primary" onClick={() => navigate('/login')}>
              Ingresar al campus
            </button>
            <button className="resource-button secondary" onClick={() => navigate('/dashboard')}>
              Ver mi dashboard
            </button>
          </div>
        </div>

        <div className="landing-panel">
          <div className="landing-stat-card accent-blue">
            <span>Aprendizaje guiado</span>
            <strong>Clases por modulos</strong>
            <p>Recursos organizados por curso, fecha y tipo de actividad.</p>
          </div>

          <div className="landing-stat-card accent-gold">
            <span>Experiencia docente</span>
            <strong>Gestion por curso</strong>
            <p>Administra contenidos y actividades sin mezclar todo en una sola pagina.</p>
          </div>

          <div className="landing-stat-card accent-green">
            <span>Experiencia estudiante</span>
            <strong>Vista mas clara</strong>
            <p>Encuentra rapido guias, simuladores, videos y pruebas dentro de cada clase.</p>
          </div>
        </div>
      </section>
    </main>
  )
}
