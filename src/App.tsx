import { useState } from 'react'
import type { AppMode } from './types'

// Import pages
import LandingPage from './pages/LandingPage'
import EnhancedCreatorInterface from './components/EnhancedCreatorInterface'
import VisitorInterface from './components/VisitorInterface'

// Import professional styles
import './styles/professional.css'

function App() {
  const [mode, setMode] = useState<AppMode>('selection')

  const handleModeSelect = (selectedMode: AppMode) => {
    setMode(selectedMode)
  }

  const handleBackToHome = () => {
    setMode('selection')
  }

  // Render based on current mode
  switch (mode) {
    case 'creator':
      return (
        <div className="app-container">
          <EnhancedCreatorInterface onBack={handleBackToHome} />
        </div>
      )

    case 'visitor':
      return (
        <div className="app-container">
          <VisitorInterface onBack={handleBackToHome} />
        </div>
      )

    default:
      return <LandingPage onModeSelect={handleModeSelect} />
  }
}

export default App
