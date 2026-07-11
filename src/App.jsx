import { Navigate, Route, Routes } from 'react-router-dom'
import ProtectedRoute from './components/ProtectedRoute'
import DashboardLayout from './components/DashboardLayout'
import Login from './pages/Login'
import Signup from './pages/Signup'
import Overzicht from './pages/dashboard/Overzicht'
import Kanalen from './pages/dashboard/Kanalen'
import Strategie from './pages/dashboard/Strategie'
import Contentkalender from './pages/dashboard/Contentkalender'
import Resultaten from './pages/dashboard/Resultaten'
import Instellingen from './pages/dashboard/Instellingen'

function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <DashboardLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Overzicht />} />
        <Route path="kanalen" element={<Kanalen />} />
        <Route path="strategie" element={<Strategie />} />
        <Route path="contentkalender" element={<Contentkalender />} />
        <Route path="resultaten" element={<Resultaten />} />
        <Route path="instellingen" element={<Instellingen />} />
      </Route>
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  )
}

export default App