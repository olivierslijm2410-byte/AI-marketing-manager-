import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabaseClient'

export default function Signup() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSuccess(false)

    if (!email || !password || !confirmPassword) {
      setError('Vul alle velden in.')
      return
    }

    if (password !== confirmPassword) {
      setError('Wachtwoorden komen niet overeen.')
      return
    }

    setSubmitting(true)
    const { error: signUpError } = await supabase.auth.signUp({
      email,
      password,
    })
    setSubmitting(false)

    if (signUpError) {
      setError(signUpError.message)
      return
    }

    setSuccess(true)
  }

  return (
    <div>
      <h1>Account aanmaken</h1>
      {success ? (
        <p>Check je e-mail om je account te bevestigen.</p>
      ) : (
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
          <div>
            <label htmlFor="confirmPassword">Bevestig wachtwoord</label>
            <input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          </div>
          {error && <p>{error}</p>}
          <button type="submit" disabled={submitting}>
            {submitting ? 'Bezig met registreren...' : 'Registreren'}
          </button>
        </form>
      )}
      <p>
        Al een account? <Link to="/login">Log hier in</Link>
      </p>
    </div>
  )
}