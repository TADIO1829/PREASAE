import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../services/supabaseClient'
import { normalizeEmail } from '../utils/security'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mensaje, setMensaje] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const navigate = useNavigate()

  const handleLogin = async () => {
    const cleanEmail = normalizeEmail(email)

    if (!cleanEmail || !password.trim()) {
      setMensaje('Ingresa tu correo y contrasena.')
      limpiarMensaje()
      return
    }

    setMensaje('')
    setIsSubmitting(true)

    const { error } = await supabase.auth.signInWithPassword({
      email: cleanEmail,
      password,
    })

    if (error) {
      setMensaje('No se pudo iniciar sesion. Verifica tus datos.')
      limpiarMensaje()
      setIsSubmitting(false)
      return
    }

    const { data: userData } = await supabase.auth.getUser()
    const user = userData.user

    if (user) {
      const { data } = await supabase
        .from('perfiles')
        .select('id')
        .eq('id', user.id)
        .maybeSingle()

      if (!data) {
        await supabase.from('perfiles').insert([
          {
            id: user.id,
            rol: 'estudiante',
          },
        ])
      }
    }

    setMensaje('Inicio de sesion exitoso.')
    setEmail('')
    setPassword('')
    setIsSubmitting(false)

    setTimeout(() => {
      navigate('/dashboard')
    }, 1000)
  }

  const limpiarMensaje = () => {
    setTimeout(() => {
      setMensaje('')
    }, 3000)
  }

  return (
    <main className="auth-shell">
      <section className="auth-panel auth-copy-panel">
        <p className="landing-kicker">Acceso seguro</p>
        <h1>Bienvenido al campus virtual</h1>
        <p className="landing-description">
          Accede a tus cursos, materiales, actividades y herramientas del
          preuniversitario desde una sola plataforma.
        </p>

        <div className="auth-benefits">
          <div className="auth-benefit">
            <strong>Estudiantes</strong>
            <span>Revisan modulos, recursos y pruebas en una vista ordenada.</span>
          </div>
          <div className="auth-benefit">
            <strong>Administradores</strong>
            <span>Gestionan cursos y clases con paneles separados por contexto.</span>
          </div>
        </div>
      </section>

      <section className="auth-panel auth-form-panel">
        <div className="auth-form-header">
          <p className="dashboard-eyebrow">Inicio de sesion</p>
          <h2>Ingresa a tu cuenta</h2>
        </div>

        {mensaje && (
          <p className={`feedback-banner ${mensaje.includes('exitoso') ? 'success' : 'error'}`}>
            {mensaje}
          </p>
        )}

        <div className="form-grid">
          <input
            value={email}
            placeholder="Correo institucional"
            type="email"
            autoComplete="email"
            onChange={(e) => setEmail(e.target.value)}
          />

          <input
            type="password"
            value={password}
            placeholder="Contrasena"
            autoComplete="current-password"
            onChange={(e) => setPassword(e.target.value)}
          />

          <button className="resource-button auth-submit" onClick={handleLogin} disabled={isSubmitting}>
            {isSubmitting ? 'Ingresando...' : 'Entrar al campus'}
          </button>
        </div>
      </section>
    </main>
  )
}
