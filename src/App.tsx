import { useState, useEffect } from 'react'
import type { AppMode } from './types'

// Import auth components
import { AuthProvider, useAuth } from './contexts/AuthContext'
import AuthModal from './components/auth/AuthModal'
import UserProfile from './components/auth/UserProfile'

// Import pages
import LandingPage from './pages/LandingPage'
import EnhancedCreatorInterface from './components/EnhancedCreatorInterface'
import VisitorInterface from './components/VisitorInterface'

// Import database store
import { useDatabaseStore } from './stores/database'

// Import professional styles
import './styles/professional.css'

// Main App Component (wrapped in AuthProvider)
function AppContent() {
  const [mode, setMode] = useState<AppMode>('selection')
  const [showAuthModal, setShowAuthModal] = useState(false)
  const [showProfile, setShowProfile] = useState(false)
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login')

  const { user, loading } = useAuth()
  const { loadProjects } = useDatabaseStore()

  // Load user's projects when authenticated
  useEffect(() => {
    if (user) {
      loadProjects(user.id)
    }
  }, [user, loadProjects])

  const handleModeSelect = (selectedMode: AppMode) => {
    // Require authentication for creator mode
    if (selectedMode === 'creator' && !user) {
      setAuthMode('login')
      setShowAuthModal(true)
      return
    }
    setMode(selectedMode)
  }

  const handleBackToHome = () => {
    setMode('selection')
  }

  const handleAuthSuccess = () => {
    setShowAuthModal(false)
    // Auto-navigate to creator mode after signup
    if (mode === 'selection') {
      setMode('creator')
    }
  }

  const handleShowLogin = () => {
    setAuthMode('login')
    setShowAuthModal(true)
  }

  const handleShowSignup = () => {
    setAuthMode('signup')
    setShowAuthModal(true)
  }

  const handleShowProfile = () => {
    setShowProfile(true)
  }

  // Show loading spinner while auth is initializing
  if (loading) {
    return (
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 50%, #16213e 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        color: 'white'
      }}>
        <div style={{
          width: '60px',
          height: '60px',
          border: '3px solid rgba(0, 255, 136, 0.3)',
          borderTop: '3px solid #00ff88',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite',
          marginBottom: '1rem'
        }}></div>
        <p style={{ 
          fontSize: '1.2rem',
          background: 'linear-gradient(45deg, #00ff88, #0099ff)',
          backgroundClip: 'text',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent'
        }}>
          🏗️ Initializing Climate Refuge...
        </p>
        <style>{`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    )
  }

  // Render based on current mode
  const renderCurrentMode = () => {
    switch (mode) {
      case 'creator':
        return (
          <div className="app-container">
            <EnhancedCreatorInterface 
              onBack={handleBackToHome}
              user={user}
              onShowProfile={handleShowProfile}
            />
          </div>
        )

      case 'visitor':
        return (
          <div className="app-container">
            <VisitorInterface 
              onBack={handleBackToHome}
              user={user}
              onShowProfile={user ? handleShowProfile : undefined}
              onShowAuth={user ? undefined : handleShowLogin}
            />
          </div>
        )

      default:
        return (
          <LandingPage 
            onModeSelect={handleModeSelect}
            user={user}
            onShowLogin={handleShowLogin}
            onShowSignup={handleShowSignup}
            onShowProfile={user ? handleShowProfile : undefined}
          />
        )
    }
  }

  return (
    <>
      {renderCurrentMode()}
      
      {/* Auth Modal */}
      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        defaultMode={authMode}
      />

      {/* User Profile Modal */}
      <UserProfile
        isOpen={showProfile}
        onClose={() => setShowProfile(false)}
      />
    </>
  )
}

// Root App Component with Provider
function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  )
}

export default App
