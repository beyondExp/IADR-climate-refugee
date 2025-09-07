import { useState, useEffect } from 'react'
import ARViewer from './ARViewer'
import { useAuth } from '../contexts/AuthContext'
import { useDatabaseStore } from '../stores/database'
import type { Project } from '../lib/supabase'

interface VisitorInterfaceProps {
  onBack?: () => void;
}

export default function VisitorInterface({ onBack }: VisitorInterfaceProps) {
  const { user } = useAuth()
  const { loadProjectById } = useDatabaseStore()
  const [currentProject, setCurrentProject] = useState<Project | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Check for project ID in URL parameters
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search)
    const projectId = urlParams.get('project') || urlParams.get('projectId') || urlParams.get('id')
    
    if (projectId) {
      console.log('🔍 Project ID detected in URL:', projectId)
      handleLoadProject(projectId)
    }
  }, [])

  const handleLoadProject = async (projectId: string) => {
    setLoading(true)
    setError(null)
    
    try {
      console.log('📡 Loading project from URL parameter:', projectId)
      const project = await loadProjectById(projectId)
      
      if (project) {
        console.log('✅ Project loaded successfully for AR viewer:', project.name)
        setCurrentProject(project as unknown as Project)
      } else {
        console.log('❌ Project not found or access denied:', projectId)
        setError('Project not found or you don\'t have access to view it.')
      }
    } catch (err: any) {
      console.error('❌ Failed to load project:', err)
      setError('Failed to load project: ' + (err.message || 'Unknown error'))
    } finally {
      setLoading(false)
    }
  }

  // Show loading state while project is being loaded
  if (loading) {
    return (
      <div className="fixed inset-0 w-screen h-screen" style={{ background: 'linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 50%, #16213e 100%)' }}>
        <div className="flex items-center justify-center h-full">
          <div className="text-center text-white">
            <div className="animate-spin w-16 h-16 border-4 border-white/20 border-t-white mx-auto mb-4 rounded-full"></div>
            <p className="text-xl mb-2">Loading Project...</p>
            <p className="text-white/70">Please wait while we load your AR experience</p>
          </div>
        </div>
      </div>
    )
  }

  // Show error state if project failed to load
  if (error) {
    return (
      <div className="fixed inset-0 w-screen h-screen" style={{ background: 'linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 50%, #16213e 100%)' }}>
        <div className="flex items-center justify-center h-full">
          <div className="text-center text-white max-w-md px-4">
            <div className="text-6xl mb-4">🚫</div>
            <h2 className="text-2xl font-bold mb-4">Project Not Found</h2>
            <p className="text-white/70 mb-6">{error}</p>
            <button 
              onClick={() => {
                setError(null)
                setCurrentProject(null)
                // Clear URL parameters
                const url = new URL(window.location.href)
                url.search = ''
                window.history.replaceState({}, '', url.toString())
              }}
              className="bg-white/20 hover:bg-white/30 px-6 py-3 rounded-lg border border-white/30 transition-colors"
            >
              Browse Projects
            </button>
            {onBack && (
              <button 
                onClick={onBack}
                className="ml-4 bg-white/10 hover:bg-white/20 px-6 py-3 rounded-lg border border-white/20 transition-colors"
              >
                Back to Home
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  // Show AR viewer with the loaded project or default behavior
  return (
    <ARViewer 
      user={user}
      project={currentProject}
      onBack={onBack}
    />
  )
} 