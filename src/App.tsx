import { useState, useEffect } from 'react'
import { AuthProvider } from './contexts/AuthContext'
import { useAuth } from './contexts/AuthContext'
import LandingPage from './pages/LandingPage'
import EnhancedCreatorInterface from './components/EnhancedCreatorInterface'
import VisitorInterface from './components/VisitorInterface'
import AuthModal from './components/auth/AuthModal'
import UserProfile from './components/auth/UserProfile'
import AdminRouter from './components/admin/AdminRouter'
import './index.css'
import './styles/admin.css'

// Import database store
import { useDatabaseStore } from './stores/database'

// Import professional styles
import './styles/professional.css'

// Main App Component (wrapped in AuthProvider)
function AppContent() {
  const [currentView, setCurrentView] = useState<'landing' | 'creator' | 'visitor' | 'admin'>('landing')
  const [showAuth, setShowAuth] = useState(false)
  const [showProfile, setShowProfile] = useState(false)

  const { user, loading } = useAuth()
  const { loadProjects } = useDatabaseStore()

  // Load user's projects when authenticated (initial load only, not force refresh)
  useEffect(() => {
    console.log('🔍 App.tsx useEffect triggered:', { hasUser: !!user, userId: user?.id });
    if (user) {
      console.log('📞 App.tsx calling loadProjects for user:', user.id, '(initial load)');
      loadProjects(user.id, false) // Don't force refresh on initial app load
    }
  }, [user])

  // Listen for admin navigation events
  useEffect(() => {
    const handleAdminNavigation = () => {
      console.log('🔧 Admin navigation event received');
      handleModeSelection('admin');
    };

    window.addEventListener('navigateToAdmin', handleAdminNavigation);
    
    return () => {
      window.removeEventListener('navigateToAdmin', handleAdminNavigation);
    };
  }, [])

  // Handle URL-based navigation
  useEffect(() => {
    const handleInitialRoute = () => {
      const path = window.location.pathname;
      console.log('🔍 Initial route detection:', path);
      
      // Don't trigger URL updates during initial routing
      const originalPushState = window.history.pushState;
      window.history.pushState = () => {}; // Temporarily disable URL updates
      
      if (path === '/admin' || path.startsWith('/admin/')) {
        console.log('🔧 Admin URL detected, switching to admin mode');
        setCurrentView('admin');
      } else if (path === '/creator') {
        console.log('🏗️ Creator URL detected');  
        setCurrentView('creator');
      } else if (path === '/visitor') {
        console.log('👁️ Visitor URL detected');
        setCurrentView('visitor');  
      } else {
        console.log('🏠 Landing page URL detected');
        setCurrentView('landing');
      }
      
      // Re-enable URL updates
      window.history.pushState = originalPushState;
    };

    // Handle initial route after a brief delay to ensure user state is loaded
    const timer = setTimeout(handleInitialRoute, 100);

    // Handle browser back/forward buttons
    const handlePopState = () => {
      console.log('🔄 Browser navigation detected');
      handleInitialRoute();
    };

    window.addEventListener('popstate', handlePopState);
    
    return () => {
      clearTimeout(timer);
      window.removeEventListener('popstate', handlePopState);
    };
  }, [])

  const handleModeSelection = (selectedMode: 'landing' | 'creator' | 'visitor' | 'admin') => {
    console.log('🎯 Mode selection:', selectedMode);
    console.log('👤 Current user state:', user ? user.email : 'No user');
    console.log('🔐 Loading state:', loading);
    
    // Require authentication for creator and admin modes
    if ((selectedMode === 'creator' || selectedMode === 'admin') && !user) {
      console.log('❌ Creator/Admin mode requires auth, showing auth modal');
      setShowAuth(true)
      return
    }
    
    // Check admin access for admin mode
    if (selectedMode === 'admin' && user) {
      // For now, allow admin access for all authenticated users (you can add role checking later)
      console.log('🔧 Admin mode access granted for user:', user.email);
    }
    
    console.log('✅ Setting current view to:', selectedMode);
    setCurrentView(selectedMode)
    
    // Update URL to match the current view
    const urlMap = {
      'landing': '/',
      'creator': '/creator',
      'visitor': '/visitor',
      'admin': '/admin'
    };
    
    const newUrl = urlMap[selectedMode];
    if (window.location.pathname !== newUrl) {
      window.history.pushState({}, '', newUrl);
    }
  }

  const handleBackToHome = () => {
    handleModeSelection('landing')
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

      case 'admin':
        return (
          <AdminRouter 
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
