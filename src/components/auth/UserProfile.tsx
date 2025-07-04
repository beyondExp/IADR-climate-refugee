import React, { useState, useEffect } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'

interface UserProfileProps {
  isOpen: boolean
  onClose: () => void
}

const UserProfile: React.FC<UserProfileProps> = ({ isOpen, onClose }) => {
  const { user, signOut, updateProfile } = useAuth()
  const [loading, setLoading] = useState(false)
  const [username, setUsername] = useState('')
  const [avatarUrl, setAvatarUrl] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [userStats, setUserStats] = useState({
    projectCount: 0,
    anchorCount: 0,
    qrCodeCount: 0
  })

  useEffect(() => {
    if (user && isOpen) {
      loadUserProfile()
      loadUserStats()
    }
  }, [user, isOpen])

  const loadUserProfile = async () => {
    if (!user) return

    try {
      const { data, error } = await supabase
        .from('users')
        .select('username, avatar_url')
        .eq('id', user.id)
        .single()

      if (error) throw error

      if (data) {
        setUsername(data.username || '')
        setAvatarUrl(data.avatar_url || '')
      }
    } catch (error: any) {
      console.error('Error loading profile:', error)
    }
  }

  const loadUserStats = async () => {
    if (!user) return

    try {
      // Get project count
      const { count: projectCount } = await supabase
        .from('projects')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)

      // Get anchor count
      const { count: anchorCount } = await supabase
        .from('anchors')
        .select('*', { count: 'exact', head: true })
        .eq('project_id', user.id)

      // Get QR code count
      const { count: qrCodeCount } = await supabase
        .from('qr_codes')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)

      setUserStats({
        projectCount: projectCount || 0,
        anchorCount: anchorCount || 0,
        qrCodeCount: qrCodeCount || 0
      })
    } catch (error: any) {
      console.error('Error loading stats:', error)
    }
  }

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setMessage(null)

    try {
      const updates = {
        username: username.trim(),
        avatar_url: avatarUrl.trim() || null,
        updated_at: new Date().toISOString()
      }

      const { error } = await updateProfile(updates)
      if (error) throw error

      setMessage('Profile updated successfully!')
    } catch (error: any) {
      setError(error.message || 'Failed to update profile')
    } finally {
      setLoading(false)
    }
  }

  const handleSignOut = async () => {
    try {
      await signOut()
      onClose()
    } catch (error: any) {
      setError(error.message || 'Failed to sign out')
    }
  }

  if (!isOpen || !user) return null

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
        maxWidth: '500px',
        margin: '1rem',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        boxShadow: '0 20px 40px rgba(0, 0, 0, 0.3)',
        maxHeight: '90vh',
        overflowY: 'auto'
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
            👤 User Profile
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

        {/* User Stats */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '1rem',
          marginBottom: '2rem'
        }}>
          <div style={{
            background: 'rgba(0, 255, 136, 0.1)',
            border: '1px solid rgba(0, 255, 136, 0.3)',
            borderRadius: '8px',
            padding: '1rem',
            textAlign: 'center'
          }}>
            <div style={{ color: '#00ff88', fontSize: '1.5rem', fontWeight: '600' }}>
              {userStats.projectCount}
            </div>
            <div style={{ color: 'rgba(255, 255, 255, 0.7)', fontSize: '0.75rem' }}>
              Projects
            </div>
          </div>
          <div style={{
            background: 'rgba(0, 153, 255, 0.1)',
            border: '1px solid rgba(0, 153, 255, 0.3)',
            borderRadius: '8px',
            padding: '1rem',
            textAlign: 'center'
          }}>
            <div style={{ color: '#0099ff', fontSize: '1.5rem', fontWeight: '600' }}>
              {userStats.anchorCount}
            </div>
            <div style={{ color: 'rgba(255, 255, 255, 0.7)', fontSize: '0.75rem' }}>
              Anchors
            </div>
          </div>
          <div style={{
            background: 'rgba(255, 107, 107, 0.1)',
            border: '1px solid rgba(255, 107, 107, 0.3)',
            borderRadius: '8px',
            padding: '1rem',
            textAlign: 'center'
          }}>
            <div style={{ color: '#ff6b6b', fontSize: '1.5rem', fontWeight: '600' }}>
              {userStats.qrCodeCount}
            </div>
            <div style={{ color: 'rgba(255, 255, 255, 0.7)', fontSize: '0.75rem' }}>
              QR Codes
            </div>
          </div>
        </div>

        {/* Profile Form */}
        <form onSubmit={handleUpdateProfile} style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem'
        }}>
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
              value={user.email || ''}
              disabled
              style={{
                width: '100%',
                padding: '0.75rem',
                borderRadius: '8px',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                background: 'rgba(255, 255, 255, 0.05)',
                color: 'rgba(255, 255, 255, 0.7)',
                fontSize: '1rem',
                cursor: 'not-allowed'
              }}
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
              Username
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
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
              placeholder="Your username"
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
              Avatar URL (optional)
            </label>
            <input
              type="url"
              value={avatarUrl}
              onChange={(e) => setAvatarUrl(e.target.value)}
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
              placeholder="https://example.com/avatar.jpg"
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

          <div style={{
            display: 'flex',
            gap: '1rem',
            marginTop: '1rem'
          }}>
            <button
              type="submit"
              disabled={loading}
              style={{
                flex: 1,
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
              {loading ? 'Updating...' : '💾 Update Profile'}
            </button>

            <button
              type="button"
              onClick={handleSignOut}
              style={{
                flex: 1,
                padding: '0.875rem',
                borderRadius: '8px',
                border: '1px solid rgba(255, 107, 107, 0.3)',
                background: 'rgba(255, 107, 107, 0.1)',
                color: '#ff6b6b',
                fontSize: '1rem',
                fontWeight: '600',
                cursor: 'pointer',
                transition: 'all 0.3s ease'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255, 107, 107, 0.2)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(255, 107, 107, 0.1)'
              }}
            >
              🚪 Sign Out
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default UserProfile 