import { Routes, Route } from 'react-router-dom'
import Home from './pages/Home'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Curso from './pages/Curso'
import PrivateRoute from './components/PrivateRoute'
import Admin from './pages/Admin'
import AdminCurso from './pages/AdminCurso'
import SimuladorEditor from './pages/SimuladorEditor'
import SimuladorPlayer from './pages/SimuladorPlayer'
function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/login" element={<Login />} />
      <Route
        path="/admin"
        element={
          <PrivateRoute requireAdmin>
            <Admin />
          </PrivateRoute>
        }
      />
      <Route
        path="/admin/curso/:id"
        element={
          <PrivateRoute requireAdmin>
            <AdminCurso />
          </PrivateRoute>
        }
      />
      <Route
        path="/admin/simulador/:contenidoId"
        element={
          <PrivateRoute requireAdmin>
            <SimuladorEditor />
          </PrivateRoute>
        }
      />

      <Route
        path="/dashboard"
        element={
          <PrivateRoute>
            <Dashboard />
          </PrivateRoute>
        }
      />

      <Route
        path="/curso/:id"
        element={
          <PrivateRoute>
            <Curso />
          </PrivateRoute>
        }
      />
      <Route
        path="/simulador/:contenidoId"
        element={
          <PrivateRoute>
            <SimuladorPlayer />
          </PrivateRoute>
        }
      />
    </Routes>
    
  )
}

export default App
