import { useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs'
import { useDatabaseStore } from '../stores/database'
import { brickTypes } from '../utils/brickTypes'
import ARViewerPairs from './ARViewerPairs'
import type { AnchorQRData } from '../types'
import type { QRCode } from '../lib/supabase'

interface VisitorInterfaceProps {
  onBack?: () => void;
}

export default function VisitorInterface({ onBack }: VisitorInterfaceProps) {
  const [activeTab, setActiveTab] = useState<'scanner' | 'viewer'>('scanner')
  const [isARActive, setIsARActive] = useState(false)
  const [scannedData, setScannedData] = useState<AnchorQRData | null>(null)
  const [qrPairData, setQrPairData] = useState<{ primary: QRCode; secondary: QRCode; referenceDistance: number; projectId: string } | null>(null)
  const [scanMode, setScanMode] = useState<'single' | 'pair'>('single')
  const [manualQRInput, setManualQRInput] = useState('')
  
  const { projects } = useDatabaseStore()

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

  const handleDemoQRPair = () => {
    // Demo QR pair data
    const demoQRPair = {
      primary: {
        id: 'demo-primary-qr',
        qr_pair_id: 'demo-pair-123',
        qr_position: 'primary' as const,
        qr_data: { anchor: { name: 'Foundation Corner A', position: { x: 0, y: 0, z: 0 } } },
        project_id: 'demo-project-456',
        anchor_id: 'demo-anchor-1',
        user_id: 'demo-user',
        qr_code_url: 'https://demo-qr-primary.png',
        reference_distance: 2.5,
        created_at: new Date().toISOString()
      },
      secondary: {
        id: 'demo-secondary-qr',
        qr_pair_id: 'demo-pair-123',
        qr_position: 'secondary' as const,
        qr_data: { anchor: { name: 'Foundation Corner B', position: { x: 2.5, y: 0, z: 0 } } },
        project_id: 'demo-project-456',
        anchor_id: 'demo-anchor-2', 
        user_id: 'demo-user',
        qr_code_url: 'https://demo-qr-secondary.png',
        reference_distance: 2.5,
        created_at: new Date().toISOString()
      },
      referenceDistance: 2.5,
      projectId: 'demo-project-456'
    };
    
    setQrPairData(demoQRPair);
    setIsARActive(true);
  }

  const handleExitAR = () => {
    setIsARActive(false)
    setScannedData(null)
    setQrPairData(null)
  }

  if (isARActive) {
    if (qrPairData) {
      return (
        <ARViewerPairs 
          qrPairData={qrPairData}
          onBack={handleExitAR}
        />
      )
    } else if (scannedData) {
      return (
        <ARViewer 
          scannedData={scannedData}
          onBack={handleExitAR}
        />
      )
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
          <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent mb-2">
            🥽 AR Visitor Experience
          </h1>
          <p className="text-gray-600 text-lg">Scan QR codes to explore immersive climate refuge construction</p>
        </div>

        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as any)} className="w-full">
          <TabsList className="grid w-full grid-cols-3 glass-card p-2 mb-8">
            <TabsTrigger value="scanner" className="rounded-xl font-medium">📱 QR Scanner</TabsTrigger>
            <TabsTrigger value="viewer" className="rounded-xl font-medium">🥽 AR Viewer</TabsTrigger>
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
                          <span className="text-6xl block mb-4">📱</span>
                          <h3 className="text-xl font-semibold text-gray-800 mb-2">Ready to Scan</h3>
                          <p className="text-gray-600 mb-6">Point your camera at a QR code to view the construction in AR</p>
                          
                          <div className="space-y-4">
                            <button 
                              className="btn-primary w-full max-w-xs mx-auto block"
                              onClick={() => setIsARActive(true)}
                            >
                              📸 Open Camera Scanner
                            </button>
                          </div>
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

                  {/* Demo QR Pair Button */}
                  <div className="border-t pt-4">
                    <h4 className="text-sm font-semibold text-gray-700 mb-2">🔬 Demo Mode</h4>
                    <button 
                      onClick={handleDemoQRPair}
                      className="btn-primary w-full text-sm"
                    >
                      📱📱 Try QR Pair Demo
                    </button>
                    <p className="text-xs text-gray-500 mt-2">
                      Experience precision AR construction with dual QR positioning
                    </p>
                  </div>
                </div>

                {/* Manual Input & Results */}
                <div className="space-y-6">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                      <div className="flex items-center gap-3 p-4 bg-white/10 rounded-lg">
                        <span className="text-purple-400 text-xl">📱</span>
                        <div>
                          <div className="text-white font-medium">QR Pair Mode</div>
                          <div className="text-purple-200 text-sm">Higher precision positioning</div>
                        </div>
                      </div>
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
        </Tabs>
      </div>
    </div>
  )
} 