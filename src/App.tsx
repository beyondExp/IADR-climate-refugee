import { useState, useEffect } from 'react'
import { AuthProvider } from './contexts/AuthContext'
import { useAuth } from './contexts/AuthContext'
import LandingPage from './pages/LandingPage'
import EnhancedCreatorInterface from './components/EnhancedCreatorInterface'
import VisitorInterface from './components/VisitorInterface'
import AuthModal from './components/auth/AuthModal'
import UserProfile from './components/auth/UserProfile'
import './index.css'

// Import database store
import { useDatabaseStore } from './stores/database'

// Import professional styles
import './styles/professional.css'

// Main App Component (wrapped in AuthProvider)
function AppContent() {
  const [currentView, setCurrentView] = useState<'landing' | 'creator' | 'visitor'>('landing')
  const [showAuth, setShowAuth] = useState(false)
  const [showProfile, setShowProfile] = useState(false)

  const { user, loading } = useAuth()
  const { loadProjects } = useDatabaseStore()

  // Load user's projects when authenticated
  useEffect(() => {
    if (user) {
      loadProjects(user.id)
    }
  }, [user, loadProjects])

  const handleModeSelection = (selectedMode: 'landing' | 'creator' | 'visitor') => {
    console.log('🎯 Mode selection:', selectedMode);
    console.log('👤 Current user state:', user ? user.email : 'No user');
    console.log('🔐 Loading state:', loading);
    
    // Require authentication for creator mode
    if (selectedMode === 'creator' && !user) {
      console.log('❌ Creator mode requires auth, showing auth modal');
      setShowAuth(true)
      return
    }
    
    console.log('✅ Setting current view to:', selectedMode);
    setCurrentView(selectedMode)
  }

  const handleBackToHome = () => {
    setCurrentView('landing')
  }

  const handleAuthSuccess = () => {
    console.log('🎉 Auth success! Current view:', currentView);
    console.log('👤 User after auth:', user ? user.email : 'Still no user');
    
    setShowAuth(false)
    // Auto-navigate to creator mode after signup
    if (currentView === 'landing') {
      console.log('✅ Navigating to creator mode');
      setCurrentView('creator')
    }
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
    switch (currentView) {
      case 'creator':
        return (
          <EnhancedCreatorInterface 
            onBack={handleBackToHome}
          />
        )

      case 'visitor':
        return (
          <VisitorInterface 
            onBack={handleBackToHome}
          />
        )

      default:
        return (
          <LandingPage 
            onModeSelect={handleModeSelection}
          />
        )
    }
  }

  return (
    <>
      {renderCurrentMode()}
      
      {/* Auth Modal */}
      <AuthModal
        isOpen={showAuth}
        onClose={() => setShowAuth(false)}
        onSuccess={handleAuthSuccess}
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
