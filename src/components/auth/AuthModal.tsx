import { useState } from 'react'
import { Button } from '../ui/button'
import { useAuth } from '../../contexts/AuthContext'

interface AuthModalProps {
  isOpen: boolean
  onClose: () => void
  defaultMode?: 'login' | 'signup'
}

const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose, defaultMode = 'login' }) => {
  const [mode, setMode] = useState<'login' | 'signup'>(defaultMode)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const { signUp, signIn } = useAuth()

  const resetForm = () => {
    setEmail('')
    setPassword('')
    setUsername('')
    setError(null)
    setMessage(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setMessage(null)

    try {
      if (mode === 'signup') {
        const { data, error } = await signUp(email, password, { username })
        if (error) throw error
        
        if (data?.user && !data.session) {
          setMessage('Check your email for the confirmation link!')
        } else {
          setMessage('Account created successfully!')
          resetForm()
          onClose()
        }
      } else {
        const { data, error } = await signIn(email, password)
        if (error) throw error
        
        setMessage('Signed in successfully!')
        resetForm()
        onClose()
      }
    } catch (error: any) {
      setError(error.message || 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  const switchMode = () => {
    setMode(mode === 'login' ? 'signup' : 'login')
    resetForm()
  }

  const handleSignUp = async () => {
    setLoading(true);
    setError('');
    
    try {
      const { error } = await signUp(email, password);
      if (error) throw error;
      
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000
    }}>
      <div style={{
        background: 'linear-gradient(145deg, rgba(10, 10, 10, 0.95), rgba(26, 26, 46, 0.95))',
        backdropFilter: 'blur(20px)',
        borderRadius: '16px',
        padding: '2rem',
        width: '100%',
        maxWidth: '400px',
        margin: '1rem',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        boxShadow: '0 20px 40px rgba(0, 0, 0, 0.3)'
      }}>
        {/* Header */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '2rem'
        }}>
          <h2 style={{
            color: 'white',
            fontSize: '1.5rem',
            fontWeight: '600',
            background: 'linear-gradient(45deg, #00ff88, #0099ff)',
            backgroundClip: 'text',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent'
          }}>
            {mode === 'login' ? '🏗️ Welcome Back' : '🌱 Join Climate Refuge'}
          </h2>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'white',
              fontSize: '1.5rem',
              cursor: 'pointer',
              opacity: 0.7,
              transition: 'opacity 0.3s ease'
            }}
            onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
            onMouseLeave={(e) => e.currentTarget.style.opacity = '0.7'}
          >
            ✕
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem'
        }}>
          {mode === 'signup' && (
            <div>
              <label style={{
                display: 'block',
                color: 'white',
                fontSize: '0.875rem',
                marginBottom: '0.5rem',
                opacity: 0.9
              }}>
                Username
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required={mode === 'signup'}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  borderRadius: '8px',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  background: 'rgba(255, 255, 255, 0.1)',
                  color: 'white',
                  fontSize: '1rem',
                  transition: 'border-color 0.3s ease',
                  outline: 'none'
                }}
                onFocus={(e) => e.currentTarget.style.borderColor = '#00ff88'}
                onBlur={(e) => e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)'}
                placeholder="Choose a username"
              />
            </div>
          )}

          <div>
            <label style={{
              display: 'block',
              color: 'white',
              fontSize: '0.875rem',
              marginBottom: '0.5rem',
              opacity: 0.9
            }}>
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              style={{
                width: '100%',
                padding: '0.75rem',
                borderRadius: '8px',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                background: 'rgba(255, 255, 255, 0.1)',
                color: 'white',
                fontSize: '1rem',
                transition: 'border-color 0.3s ease',
                outline: 'none'
              }}
              onFocus={(e) => e.currentTarget.style.borderColor = '#00ff88'}
              onBlur={(e) => e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)'}
              placeholder="your@email.com"
            />
          </div>

          <div>
            <label style={{
              display: 'block',
              color: 'white',
              fontSize: '0.875rem',
              marginBottom: '0.5rem',
              opacity: 0.9
            }}>
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              style={{
                width: '100%',
                padding: '0.75rem',
                borderRadius: '8px',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                background: 'rgba(255, 255, 255, 0.1)',
                color: 'white',
                fontSize: '1rem',
                transition: 'border-color 0.3s ease',
                outline: 'none'
              }}
              onFocus={(e) => e.currentTarget.style.borderColor = '#00ff88'}
              onBlur={(e) => e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)'}
              placeholder="••••••••"
            />
          </div>

          {error && (
            <div style={{
              padding: '0.75rem',
              borderRadius: '8px',
              background: 'rgba(255, 107, 107, 0.1)',
              border: '1px solid rgba(255, 107, 107, 0.3)',
              color: '#ff6b6b',
              fontSize: '0.875rem'
            }}>
              {error}
            </div>
          )}

          {message && (
            <div style={{
              padding: '0.75rem',
              borderRadius: '8px',
              background: 'rgba(0, 255, 136, 0.1)',
              border: '1px solid rgba(0, 255, 136, 0.3)',
              color: '#00ff88',
              fontSize: '0.875rem'
            }}>
              {message}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: '0.875rem',
              borderRadius: '8px',
              border: 'none',
              background: loading 
                ? 'rgba(255, 255, 255, 0.1)' 
                : 'linear-gradient(45deg, #00ff88, #0099ff)',
              color: loading ? 'rgba(255, 255, 255, 0.5)' : 'white',
              fontSize: '1rem',
              fontWeight: '600',
              cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'all 0.3s ease',
              opacity: loading ? 0.6 : 1
            }}
          >
            {loading 
              ? (mode === 'login' ? 'Signing In...' : 'Creating Account...') 
              : (mode === 'login' ? '🔑 Sign In' : '🚀 Create Account')}
          </button>
        </form>

        {/* Switch Mode */}
        <div style={{
          textAlign: 'center',
          marginTop: '1.5rem',
          paddingTop: '1rem',
          borderTop: '1px solid rgba(255, 255, 255, 0.1)'
        }}>
          <span style={{ color: 'rgba(255, 255, 255, 0.7)', fontSize: '0.875rem' }}>
            {mode === 'login' ? "Don't have an account?" : "Already have an account?"}
          </span>
          <button
            type="button"
            onClick={switchMode}
            style={{
              background: 'none',
              border: 'none',
              color: '#00ff88',
              fontSize: '0.875rem',
              fontWeight: '600',
              cursor: 'pointer',
              marginLeft: '0.5rem',
              textDecoration: 'underline',
              transition: 'color 0.3s ease'
            }}
            onMouseEnter={(e) => e.currentTarget.style.color = '#0099ff'}
            onMouseLeave={(e) => e.currentTarget.style.color = '#00ff88'}
          >
            {mode === 'login' ? 'Sign up' : 'Sign in'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default AuthModal 