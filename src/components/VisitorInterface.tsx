import { useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs'
import { Camera, QrCode, Play, Eye, Scan, Zap, Cpu, Smartphone } from 'lucide-react'
import { useQRScanner } from '../hooks/useQRCode'
import { useDatabaseStore } from '../stores/database'
import { brickTypes } from '../utils/brickTypes'
import ARViewer from './ARViewer'
import type { AnchorQRData } from '../types'

interface VisitorInterfaceProps {
  onBack?: () => void;
}

export default function VisitorInterface({ onBack }: VisitorInterfaceProps) {
  const [activeTab, setActiveTab] = useState<'scanner' | 'viewer' | 'gallery'>('scanner')
  const [isARActive, setIsARActive] = useState(false)
  const [scannedData, setScannedData] = useState<AnchorQRData | null>(null)
  const [manualQRInput, setManualQRInput] = useState('')
  
  const { getAllProjects } = useDatabaseStore()
  const { startCamera, stopCamera, startScanning, stopScanning, isScanning, scannedData: scannedQRData, error } = useQRScanner()
  
  const projects = getAllProjects()

  const handleStartScanning = async () => {
    try {
      await startCamera()
      startScanning()
    } catch (error) {
      console.error('Failed to start scanning:', error)
    }
  }

  const handleManualQRInput = () => {
    try {
      const parsedData = JSON.parse(manualQRInput) as AnchorQRData
      setScannedData(parsedData)
      setManualQRInput('')
    } catch (error) {
      console.error('Invalid QR data:', error)
    }
  }

  const handleLaunchAR = (data?: AnchorQRData) => {
    const dataToUse = data || scannedData || scannedQRData
    if (dataToUse) {
      setScannedData(dataToUse)
      setIsARActive(true)
    }
  }

  const handleExitAR = () => {
    setIsARActive(false)
  }

  if (isARActive && scannedData) {
    return (
      <ARViewer 
        scannedData={scannedData}
        onBack={handleExitAR}
      />
    )
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
          <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent mb-2">
            🥽 AR Visitor Experience
          </h1>
          <p className="text-gray-600 text-lg">Scan QR codes to explore immersive climate refuge construction</p>
        </div>

        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as any)} className="w-full">
          <TabsList className="grid w-full grid-cols-3 glass-card p-2 mb-8">
            <TabsTrigger value="scanner" className="rounded-xl font-medium">📱 QR Scanner</TabsTrigger>
            <TabsTrigger value="viewer" className="rounded-xl font-medium">🥽 AR Viewer</TabsTrigger>
            <TabsTrigger value="gallery" className="rounded-xl font-medium">🏗️ Gallery</TabsTrigger>
          </TabsList>

          {/* QR Scanner Tab */}
          <TabsContent value="scanner" className="space-y-6">
            <div className="glass-card p-8">
              <div className="text-center mb-8">
                <h2 className="text-2xl font-bold text-gray-800 mb-4">QR Code Scanner</h2>
                <p className="text-gray-600 max-w-2xl mx-auto leading-relaxed">
                  Scan anchor QR codes to unlock immersive AR construction experiences. 
                  Watch sustainable structures build in real-time using Three.js WebXR technology.
                </p>
              </div>

              <div className="grid lg:grid-cols-2 gap-8">
                
                {/* Camera Scanner */}
                <div className="space-y-6">
                  <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                    <Camera className="h-5 w-5 text-blue-600" />
                    Camera Scanner
                  </h3>
                  
                  <div className="camera-container aspect-square bg-gray-900 rounded-xl relative overflow-hidden">
                    {isScanning ? (
                      <>
                        <div id="qr-video" className="w-full h-full object-cover"></div>
                        <div className="camera-overlay"></div>
                        <div className="absolute top-4 left-4 flex items-center gap-2 text-white bg-black/50 px-3 py-1 rounded-lg">
                          <div className="status-dot status-active"></div>
                          <span className="text-sm font-medium">Scanning...</span>
                        </div>
                      </>
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center text-center">
                        <div>
                          <QrCode className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                          <p className="text-gray-400 mb-6">Camera feed will appear here</p>
                          <button 
                            onClick={handleStartScanning}
                            className="btn-primary"
                          >
                            <Camera className="h-4 w-4 mr-2" />
                            Start Camera
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex gap-3">
                    {!isScanning ? (
                      <button 
                        onClick={handleStartScanning}
                        className="btn-primary flex-1"
                      >
                        <Scan className="h-4 w-4 mr-2" />
                        Start Scanning
                      </button>
                    ) : (
                      <button 
                        onClick={() => {
                          stopScanning()
                          stopCamera()
                        }}
                        className="btn-secondary flex-1"
                      >
                        Stop Scanning
                      </button>
                    )}
                  </div>

                  {error && (
                    <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                      <p className="text-red-600 text-sm">{error}</p>
                    </div>
                  )}
                </div>

                {/* Manual Input & Results */}
                <div className="space-y-6">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                      <QrCode className="h-5 w-5 text-purple-600" />
                      Manual QR Input
                    </h3>
                    <textarea
                      value={manualQRInput}
                      onChange={(e) => setManualQRInput(e.target.value)}
                      placeholder="Paste QR code data here..."
                      rows={4}
                      className="form-input resize-none mb-4"
                    />
                    <button 
                      onClick={handleManualQRInput}
                      disabled={!manualQRInput.trim()}
                      className="btn-secondary w-full"
                    >
                      Process QR Data
                    </button>
                  </div>

                  {/* Scanned Data Display */}
                  {(scannedQRData || scannedData) && (
                    <div className="glass-card p-6">
                      <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                        <Zap className="h-5 w-5 text-green-600" />
                        Scanned Data
                      </h3>
                      
                      {(() => {
                        const data = scannedData || scannedQRData
                        const brick = data ? brickTypes[data.brickType] : null
                        
                        return data && brick ? (
                          <div className="space-y-4">
                            <div className="bg-gradient-to-r from-green-50 to-blue-50 rounded-xl p-4">
                              <div className="font-semibold text-gray-800">{data.projectName}</div>
                              <div className="text-gray-600">{data.anchor.name}</div>
                              <div className="text-sm text-gray-500 mt-1">
                                {data.anchor.purpose} • {data.anchor.constructionType}
                              </div>
                            </div>
                            
                            <div className="grid grid-cols-2 gap-4 text-sm">
                              <div>
                                <div className="font-medium text-gray-700">Material</div>
                                <div className="text-gray-600">{brick.name}</div>
                              </div>
                              <div>
                                <div className="font-medium text-gray-700">Position</div>
                                <div className="text-gray-600">
                                  ({data.anchor.position.x}, {data.anchor.position.y}, {data.anchor.position.z})
                                </div>
                              </div>
                            </div>
                            
                            <button 
                              onClick={() => handleLaunchAR(data)}
                              className="btn-primary w-full text-lg py-3"
                            >
                              <Play className="h-5 w-5 mr-2" />
                              Launch AR Experience
                            </button>
                          </div>
                        ) : null
                      })()}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </TabsContent>

          {/* AR Viewer Tab */}
          <TabsContent value="viewer" className="space-y-6">
            <div className="glass-card p-8">
              <div className="text-center mb-8">
                <h2 className="text-2xl font-bold text-gray-800 mb-4">Three.js WebXR Experience</h2>
                <p className="text-gray-600 max-w-3xl mx-auto leading-relaxed">
                  Immersive AR construction powered by Three.js, WebXR, and advanced physics simulation. 
                  Experience real-time brick placement, structural analysis, and climate resilience features.
                </p>
              </div>

              <div className="grid md:grid-cols-2 gap-8 mb-8">
                <div className="glass-card p-6">
                  <h3 className="text-xl font-semibold text-gray-800 mb-4 flex items-center gap-2">
                    <Cpu className="h-6 w-6 text-blue-600" />
                    AR Technology Stack
                  </h3>
                  <div className="space-y-4 text-gray-600">
                    <div className="flex items-start gap-3">
                      <span className="status-dot status-active mt-2"></span>
                      <div>
                        <strong>Three.js Rendering:</strong> Advanced 3D graphics with realistic lighting and shadows
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <span className="status-dot status-active mt-2"></span>
                      <div>
                        <strong>WebXR Integration:</strong> Native AR/VR support across devices and platforms
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <span className="status-dot status-active mt-2"></span>
                      <div>
                        <strong>Physics Simulation:</strong> Real-time structural analysis and stability checking
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <span className="status-dot status-active mt-2"></span>
                      <div>
                        <strong>Climate Analysis:</strong> Thermal mass, wind resistance, and sustainability metrics
                      </div>
                    </div>
                  </div>
                </div>

                <div className="glass-card p-6">
                  <h3 className="text-xl font-semibold text-gray-800 mb-4 flex items-center gap-2">
                    <Smartphone className="h-6 w-6 text-purple-600" />
                    Device Compatibility
                  </h3>
                  <div className="space-y-4 text-gray-600">
                    <div className="flex items-start gap-3">
                      <span className="status-dot status-active mt-2"></span>
                      <div>
                        <strong>Mobile AR:</strong> iOS Safari, Android Chrome with WebXR support
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <span className="status-dot status-active mt-2"></span>
                      <div>
                        <strong>Desktop VR:</strong> Oculus, HTC Vive, Windows Mixed Reality
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <span className="status-dot status-active mt-2"></span>
                      <div>
                        <strong>AR Headsets:</strong> HoloLens, Magic Leap, Quest Pass-through
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <span className="status-dot status-warning mt-2"></span>
                      <div>
                        <strong>Fallback Mode:</strong> 3D viewer for non-WebXR devices
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* AR Quick Launch */}
              {scannedData || scannedQRData ? (
                <div className="text-center">
                  <button 
                    onClick={() => handleLaunchAR()}
                    className="btn-primary text-xl px-12 py-4"
                  >
                    <Eye className="h-6 w-6 mr-3" />
                    Enter AR Experience
                  </button>
                  <p className="text-gray-500 text-sm mt-3">Ready to launch with scanned anchor data</p>
                </div>
              ) : (
                <div className="text-center py-8">
                  <Eye className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-xl font-semibold text-gray-800 mb-2">No AR Data Available</h3>
                  <p className="text-gray-600 mb-6">Scan a QR code first to unlock the AR experience</p>
                  <button 
                    onClick={() => setActiveTab('scanner')}
                    className="btn-secondary"
                  >
                    Go to Scanner
                  </button>
                </div>
              )}
            </div>
          </TabsContent>

          {/* Gallery Tab */}
          <TabsContent value="gallery" className="space-y-6">
            <div className="glass-card p-8">
              <h2 className="text-2xl font-bold text-gray-800 mb-6">Project Gallery</h2>
              
              {projects.length === 0 ? (
                <div className="text-center py-12">
                  <div className="text-6xl mb-4">🏗️</div>
                  <h3 className="text-xl font-semibold text-gray-800 mb-2">No Projects Available</h3>
                  <p className="text-gray-600">No construction projects have been created yet</p>
                </div>
              ) : (
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {projects.map(project => (
                    <div key={project.id} className="glass-card p-6 group cursor-pointer">
                      <div className="text-center">
                        <div className="text-4xl mb-4 group-hover:scale-110 transition-transform duration-300">
                          🏗️
                        </div>
                        <h3 className="font-semibold text-gray-800 mb-2">{project.name}</h3>
                        <p className="text-gray-600 text-sm mb-4">{project.description}</p>
                        
                        <div className="space-y-2 text-xs text-gray-500 mb-4">
                          <div className="flex items-center justify-center gap-2">
                            <span className="status-dot status-active"></span>
                            {project.anchors.length} Anchor Points
                          </div>
                          <div className="flex items-center justify-center gap-2">
                            <div 
                              className="w-3 h-3 rounded-full"
                              style={{ backgroundColor: `#${brickTypes[project.brickType].color.toString(16).padStart(6, '0')}` }}
                            ></div>
                            {brickTypes[project.brickType].name}
                          </div>
                        </div>

                        {project.anchors.length > 0 && (
                          <button 
                            onClick={() => {
                              // Create demo AR data for the first anchor
                              const demoData: AnchorQRData = {
                                projectId: project.id,
                                projectUID: project.uid,
                                projectName: project.name,
                                anchorIndex: 0,
                                anchorUID: 'demo-anchor',
                                anchor: project.anchors[0],
                                brickType: project.brickType,
                                totalAnchors: project.anchors.length,
                                type: 'construction-anchor',
                                timestamp: new Date().toISOString()
                              }
                              handleLaunchAR(demoData)
                            }}
                            className="btn-primary w-full"
                          >
                            <Play className="h-4 w-4 mr-2" />
                            Explore in AR
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
} 