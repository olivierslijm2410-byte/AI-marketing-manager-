import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const navigate = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (!email || !password) {
      setError('Vul zowel e-mailadres als wachtwoord in.')
      return
    }

    setSubmitting(true)
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    })
    setSubmitting(false)

    if (signInError) {
      setError('Onjuist e-mailadres of wachtwoord.')
      return
    }

    navigate('/dashboard')
  }

  return (
    <div>
      <h1>Inloggen</h1>
      <form onSubmit={handleSubmit}>
        <div>
          <label htmlFor="email">E-mailadres</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="password">Wachtwoord</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        {error && <p>{error}</p>}
        <button type="submit" disabled={submitting}>
          {submitting ? 'Bezig met inloggen...' : 'Inloggen'}
        </button>
      </form>
      <p>
        Nog geen account? <Link to="/signup">Registreer hier</Link>
      </p>
    </div>
  )
}