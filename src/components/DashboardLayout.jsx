import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'

export default function DashboardLayout() {
  const navigate = useNavigate()

  async function handleLogout() {
    await supabase.auth.signOut()
    navigate('/login', { replace: true })
  }

  return (
    <div>
      <nav>
        <ul>
          <li>
            <NavLink to="/dashboard" end>
              Overzicht
            </NavLink>
          </li>
          <li>
            <NavLink to="/dashboard/kanalen">Kanalen</NavLink>
          </li>
          <li>
            <NavLink to="/dashboard/strategie">Strategie</NavLink>
          </li>
          <li>
            <NavLink to="/dashboard/contentkalender">Contentkalender</NavLink>
          </li>
          <li>
            <NavLink to="/dashboard/resultaten">Resultaten</NavLink>
          </li>
          <li>
            <NavLink to="/dashboard/instellingen">Instellingen</NavLink>
          </li>
        </ul>
        <button type="button" onClick={handleLogout}>
          Uitloggen
        </button>
      </nav>
      <main>
        <Outlet />
      </main>
    </div>
  )
}
