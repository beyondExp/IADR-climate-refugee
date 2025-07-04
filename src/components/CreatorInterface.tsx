import { useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs'
import { useDatabaseStore } from '../stores/database'
import { brickTypes } from '../utils/brickTypes'
import type { CreatorTab } from '../types'
import { useQRCodeGenerator, useQRDataManager } from '../hooks/useQRCode'
import { generateUID } from '../lib/utils'
import type { BrickTypeKey, Anchor, Project, AnchorQRData, AnchorPurpose, ConstructionType } from '../types'

interface AnchorFormData {
  name: string;
  purpose: AnchorPurpose;
  constructionType: ConstructionType;
  notes: string;
  brickType: BrickTypeKey;
  x: number;
  y: number;
  z: number;
}

interface CreatorInterfaceProps {
  onBack?: () => void;
}

export default function CreatorInterface({ onBack }: CreatorInterfaceProps) {
  const [activeTab, setActiveTab] = useState<CreatorTab>('construction')
  const { getAllProjects, saveProject, updateProject } = useDatabaseStore()
  const { generateSingleQR, isGenerating } = useQRCodeGenerator()
  const { qrCodes, addQRCode, exportQRCodes, clearQRCodes } = useQRDataManager()
  
  const projects = getAllProjects()
  
  const [currentProject, setCurrentProject] = useState<Project | null>(null)
  const [anchorForm, setAnchorForm] = useState<AnchorFormData>({
    name: '',
    purpose: 'foundation',
    constructionType: 'foundation',
    notes: '',
    brickType: 'clay-sustainable',
    x: 0,
    y: 0,
    z: 0
  })

  const handleCreateProject = () => {
    const projectData = {
      name: `Climate Refuge Project ${projects.length + 1}`,
      description: `Sustainable construction project created on ${new Date().toLocaleDateString()}`,
      brickType: 'clay-sustainable' as BrickTypeKey,
      anchors: [],
      type: 'modular-construction' as const
    }
    
    saveProject(projectData)
    // Get the newly created project from the updated store
    setTimeout(() => {
      const updatedProjects = getAllProjects()
      const newProject = updatedProjects[updatedProjects.length - 1]
      setCurrentProject(newProject)
    }, 100)
  }

  const handleCreateAnchor = async () => {
    if (!currentProject) return

    try {
      const newAnchor: Anchor = {
        name: anchorForm.name || `Anchor ${currentProject.anchors.length + 1}`,
        purpose: anchorForm.purpose,
        constructionType: anchorForm.constructionType,
        notes: anchorForm.notes,
        position: {
          x: anchorForm.x,
          y: anchorForm.y,
          z: anchorForm.z
        }
      }

      const anchorUID = generateUID()
      const qrData: AnchorQRData = {
        projectId: currentProject.id,
        projectUID: currentProject.uid,
        projectName: currentProject.name,
        anchorIndex: currentProject.anchors.length,
        anchorUID: anchorUID,
        anchor: newAnchor,
        brickType: anchorForm.brickType,
        totalAnchors: currentProject.anchors.length + 1,
        type: 'construction-anchor',
        timestamp: new Date().toISOString()
      }

      const qrCodeURL = await generateSingleQR(qrData, 300)
      
      // Update project with new anchor
      const updatedAnchors = [...currentProject.anchors, newAnchor]
      
      updateProject(currentProject.id, { anchors: updatedAnchors })
      setCurrentProject({
        ...currentProject,
        anchors: updatedAnchors,
        timestamp: new Date().toISOString()
      })
      addQRCode(qrData, qrCodeURL)
      
      // Reset form
      setAnchorForm({
        name: '',
        purpose: 'foundation',
        constructionType: 'foundation',
        notes: '',
        brickType: 'clay-sustainable',
        x: 0,
        y: 0,
        z: 0
      })
    } catch (error) {
      console.error('Failed to create anchor:', error)
    }
  }

  return (
    <div className="app-container min-h-screen">
      <div className="container mx-auto p-6 max-w-7xl">
        
        {/* Header */}
        <div className="text-center mb-8 fade-in-up">
          {onBack && (
            <div className="flex justify-start mb-4">
              <button 
                onClick={onBack}
                className="btn-secondary flex items-center gap-2"
              >
                ← Back to Home
              </button>
            </div>
          )}
          <h1 className="text-4xl font-bold bg-gradient-to-r from-amber-600 to-orange-600 bg-clip-text text-transparent mb-2">
            🏗️ Student Creator Studio
          </h1>
          <p className="text-gray-600 text-lg">Design sustainable construction projects with AR anchor points</p>
        </div>

        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as any)} className="w-full">
          <TabsList className="grid w-full grid-cols-4 glass-card p-2 mb-8">
            <TabsTrigger value="construction" className="rounded-xl font-medium">🏗️ Projects</TabsTrigger>
            <TabsTrigger value="anchor-creator" className="rounded-xl font-medium">📍 Anchors</TabsTrigger>
            <TabsTrigger value="database" className="rounded-xl font-medium">💾 Database</TabsTrigger>
            <TabsTrigger value="gallery" className="rounded-xl font-medium">📱 QR Gallery</TabsTrigger>
          </TabsList>

          {/* Construction Projects Tab */}
          <TabsContent value="construction" className="space-y-6">
            <div className="glass-card p-8">
              <div className="text-center mb-8">
                <h2 className="text-2xl font-bold text-gray-800 mb-4">Climate Refuge Construction Projects</h2>
                <p className="text-gray-600 max-w-3xl mx-auto leading-relaxed">
                  Create modular, sustainable shelters using QR anchor-based construction. Each project uses eco-friendly materials 
                  and can be experienced in immersive AR by visitors.
                </p>
              </div>

              <div className="grid md:grid-cols-2 gap-8">
                <div className="glass-card p-6">
                  <h3 className="text-xl font-semibold text-gray-800 mb-4 flex items-center gap-2">
                    <span className="text-2xl">🎯</span>
                    How It Works
                  </h3>
                  <div className="space-y-4 text-gray-600">
                    <div className="flex items-start gap-3">
                      <span className="status-dot status-active mt-2"></span>
                      <div>
                        <strong>Design Anchor Points:</strong> Create strategic construction points with specific purposes and materials
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <span className="status-dot status-active mt-2"></span>
                      <div>
                        <strong>Generate QR Codes:</strong> Each anchor gets a unique QR code containing construction data
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <span className="status-dot status-active mt-2"></span>
                      <div>
                        <strong>AR Construction:</strong> Visitors scan codes to see 3D building in real-time
                      </div>
                    </div>
                  </div>
                </div>

                <div className="glass-card p-6">
                  <h3 className="text-xl font-semibold text-gray-800 mb-4 flex items-center gap-2">
                    <span className="text-2xl">🌱</span>
                    Sustainable Materials
                  </h3>
                  <div className="space-y-3">
                    {Object.entries(brickTypes).map(([key, brick]) => (
                      <div key={key} className="flex items-center gap-3 p-3 bg-white/50 rounded-xl">
                        <div 
                          className="w-4 h-4 rounded-full"
                          style={{ backgroundColor: `#${brick.color.toString(16).padStart(6, '0')}` }}
                        ></div>
                        <div>
                          <div className="font-medium text-gray-800">{brick.name}</div>
                          <div className="text-sm text-gray-600">{brick.material}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="text-center mt-8">
                <button 
                  onClick={handleCreateProject}
                  className="btn-primary text-lg px-8 py-4"
                >
                  Create New Project
                </button>
              </div>
            </div>

            {/* Current Project Display */}
            {currentProject && (
              <div className="glass-card p-6">
                <h3 className="text-xl font-semibold text-gray-800 mb-4">Current Project</h3>
                <div className="bg-gradient-to-r from-amber-50 to-orange-50 rounded-xl p-4">
                  <div className="font-semibold text-gray-800">{currentProject.name}</div>
                  <div className="text-gray-600">{currentProject.description}</div>
                  <div className="text-sm text-gray-500 mt-2">
                    Anchors: {currentProject.anchors.length} • Brick Type: {brickTypes[currentProject.brickType].name}
                  </div>
                </div>
              </div>
            )}
          </TabsContent>

          {/* Anchor Creator Tab */}
          <TabsContent value="anchor-creator" className="space-y-6">
            <div className="glass-card p-8">
              <h2 className="text-2xl font-bold text-gray-800 mb-6">Create QR Anchor Points</h2>
              
              {!currentProject ? (
                <div className="text-center py-12">
                  <div className="text-6xl mb-4">📝</div>
                  <h3 className="text-xl font-semibold text-gray-800 mb-2">No Active Project</h3>
                  <p className="text-gray-600 mb-6">Create a project first to start adding anchor points</p>
                  <button 
                    onClick={handleCreateProject}
                    className="btn-primary"
                  >
                    Create Project
                  </button>
                </div>
              ) : (
                <div className="grid lg:grid-cols-2 gap-8">
                  
                  {/* Anchor Form */}
                  <div className="space-y-6">
                    <h3 className="text-lg font-semibold text-gray-800">Anchor Configuration</h3>
                    
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Anchor Name</label>
                        <input
                          type="text"
                          value={anchorForm.name}
                          onChange={(e) => setAnchorForm(prev => ({ ...prev, name: e.target.value }))}
                          placeholder="Foundation Corner A"
                          className="form-input"
                        />
                      </div>

                      <div className="grid md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">Purpose</label>
                          <select
                            value={anchorForm.purpose}
                            onChange={(e) => setAnchorForm(prev => ({ ...prev, purpose: e.target.value as AnchorPurpose }))}
                            className="form-select"
                          >
                            <option value="foundation">Foundation</option>
                            <option value="column-base">Column Base</option>
                            <option value="wall-corner">Wall Corner</option>
                            <option value="height-marker">Height Marker</option>
                            <option value="roof-point">Roof Point</option>
                            <option value="beam-junction">Beam Junction</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">Construction Type</label>
                          <select
                            value={anchorForm.constructionType}
                            onChange={(e) => setAnchorForm(prev => ({ ...prev, constructionType: e.target.value as ConstructionType }))}
                            className="form-select"
                          >
                            <option value="foundation">Foundation</option>
                            <option value="wall">Wall</option>
                            <option value="column">Column</option>
                            <option value="beam">Beam</option>
                            <option value="arch">Arch</option>
                          </select>
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Brick Type</label>
                        <select
                          value={anchorForm.brickType}
                          onChange={(e) => setAnchorForm(prev => ({ ...prev, brickType: e.target.value as BrickTypeKey }))}
                          className="form-select"
                        >
                          {Object.entries(brickTypes).map(([key, brick]) => (
                            <option key={key} value={key}>{brick.name}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">3D Position</label>
                        <div className="grid grid-cols-3 gap-3">
                          <input
                            type="number"
                            step="0.1"
                            value={anchorForm.x}
                            onChange={(e) => setAnchorForm(prev => ({ ...prev, x: parseFloat(e.target.value) || 0 }))}
                            placeholder="X"
                            className="form-input text-center"
                          />
                          <input
                            type="number"
                            step="0.1"
                            value={anchorForm.y}
                            onChange={(e) => setAnchorForm(prev => ({ ...prev, y: parseFloat(e.target.value) || 0 }))}
                            placeholder="Y"
                            className="form-input text-center"
                          />
                          <input
                            type="number"
                            step="0.1"
                            value={anchorForm.z}
                            onChange={(e) => setAnchorForm(prev => ({ ...prev, z: parseFloat(e.target.value) || 0 }))}
                            placeholder="Z"
                            className="form-input text-center"
                          />
                        </div>
                        <div className="text-xs text-gray-500 mt-1">X: East/West, Y: Up/Down, Z: North/South (meters)</div>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Notes</label>
                        <textarea
                          value={anchorForm.notes}
                          onChange={(e) => setAnchorForm(prev => ({ ...prev, notes: e.target.value }))}
                          placeholder="Additional construction notes..."
                          rows={3}
                          className="form-input resize-none"
                        />
                      </div>

                      <button
                        onClick={handleCreateAnchor}
                        disabled={isGenerating || !anchorForm.name}
                        className="btn-primary w-full"
                      >
                        {isGenerating ? 'Generating...' : 'Create Anchor & QR Code'}
                      </button>
                    </div>
                  </div>

                  {/* Anchor Preview */}
                  <div className="space-y-6">
                    <h3 className="text-lg font-semibold text-gray-800">Project Anchors</h3>
                    
                    {currentProject.anchors.length === 0 ? (
                      <div className="text-center py-8 bg-gray-50 rounded-xl">
                        <div className="text-4xl mb-2">📍</div>
                        <p className="text-gray-600">No anchors created yet</p>
                      </div>
                    ) : (
                      <div className="space-y-3 max-h-96 overflow-y-auto">
                        {currentProject.anchors.map((anchor, index) => (
                          <div key={index} className="bg-white rounded-xl p-4 border border-gray-200">
                            <div className="flex items-start justify-between">
                              <div>
                                <div className="font-medium text-gray-800">{anchor.name}</div>
                                <div className="text-sm text-gray-600">{anchor.purpose} • {anchor.constructionType}</div>
                                <div className="text-xs text-gray-500">
                                  ({anchor.position.x}, {anchor.position.y}, {anchor.position.z})
                                </div>
                              </div>
                              <span className="text-sm font-medium text-amber-600">#{index + 1}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </TabsContent>

          {/* Database Tab */}
          <TabsContent value="database" className="space-y-6">
            <div className="glass-card p-8">
              <h2 className="text-2xl font-bold text-gray-800 mb-6">Project Database</h2>
              
              <div className="grid md:grid-cols-3 gap-6 mb-8">
                <div className="text-center glass-card p-6">
                  <div className="text-3xl mb-2">📊</div>
                  <div className="text-2xl font-bold text-gray-800">{projects.length}</div>
                  <div className="text-gray-600">Projects</div>
                </div>
                <div className="text-center glass-card p-6">
                  <div className="text-3xl mb-2">📍</div>
                  <div className="text-2xl font-bold text-gray-800">
                    {projects.reduce((sum, p) => sum + p.anchors.length, 0)}
                  </div>
                  <div className="text-gray-600">Total Anchors</div>
                </div>
                <div className="text-center glass-card p-6">
                  <div className="text-3xl mb-2">📱</div>
                  <div className="text-2xl font-bold text-gray-800">{qrCodes.length}</div>
                  <div className="text-gray-600">QR Codes</div>
                </div>
              </div>

              {projects.length === 0 ? (
                <div className="text-center py-12">
                  <div className="text-6xl mb-4">📂</div>
                  <h3 className="text-xl font-semibold text-gray-800 mb-2">No Projects Yet</h3>
                  <p className="text-gray-600">Create your first climate refuge project to get started</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {projects.map(project => (
                    <div key={project.id} className="bg-white rounded-xl p-6 border border-gray-200">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="font-semibold text-gray-800">{project.name}</h3>
                          <p className="text-gray-600">{project.description}</p>
                          <div className="text-sm text-gray-500 mt-1">
                            {project.anchors.length} anchors • {brickTypes[project.brickType].name} • 
                            Created {new Date(project.timestamp).toLocaleDateString()}
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button 
                            onClick={() => setCurrentProject(project)}
                            className="btn-secondary"
                          >
                            Load
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>

          {/* QR Gallery Tab */}
          <TabsContent value="gallery" className="space-y-6">
            <div className="glass-card p-8">
              <h2 className="text-2xl font-bold text-gray-800 mb-6">QR Code Gallery</h2>
              
              {qrCodes.length === 0 ? (
                <div className="text-center py-12">
                  <div className="text-6xl mb-4">📱</div>
                  <h3 className="text-xl font-semibold text-gray-800 mb-2">No QR Codes Generated</h3>
                  <p className="text-gray-600">Create anchors to generate QR codes for AR experiences</p>
                </div>
              ) : (
                <>
                  <div className="flex justify-between items-center mb-6">
                    <p className="text-gray-600">{qrCodes.length} QR codes ready for scanning</p>
                    <div className="flex gap-3">
                      <button onClick={exportQRCodes} className="btn-secondary">
                        Export All
                      </button>
                      <button onClick={clearQRCodes} className="btn-secondary">
                        Clear All
                      </button>
                    </div>
                  </div>
                  
                  <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {qrCodes.map((qrCode, index) => (
                      <div key={index} className="glass-card p-6 text-center">
                        <img 
                          src={qrCode.qrCodeURL} 
                          alt={`QR Code for ${qrCode.data.anchor.name}`}
                          className="w-full max-w-[200px] mx-auto mb-4 rounded-xl"
                        />
                        <h3 className="font-semibold text-gray-800">{qrCode.data.anchor.name}</h3>
                        <p className="text-sm text-gray-600">{qrCode.data.projectName}</p>
                        <p className="text-xs text-gray-500 mt-1">
                          {qrCode.data.anchor.purpose} • {brickTypes[qrCode.data.brickType].name}
                        </p>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
} 