import { useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs'
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
  // Component state management

  const handleDemoQRPair = () => {
    const mockQRPair = {
      primary: { 
        id: 'qr1', 
        anchor_id: 'anchor1',
        project_id: 'demo-project',
        user_id: 'demo-user',
        qr_data: { data: 'demo1' },
        qr_code_url: '',
        qr_position: 'primary' as const,
        qr_pair_id: undefined,
        reference_distance: 2.0,
        created_at: new Date().toISOString()
      } as QRCode,
      secondary: { 
        id: 'qr2', 
        anchor_id: 'anchor2',
        project_id: 'demo-project',
        user_id: 'demo-user',
        qr_data: { data: 'demo2' },
        qr_code_url: '',
        qr_position: 'secondary' as const,
        qr_pair_id: undefined,
        reference_distance: 2.0,
        created_at: new Date().toISOString()
      } as QRCode,
      referenceDistance: 2.0,
      projectId: 'demo-project'
    }
    setQrPairData(mockQRPair)
    setActiveTab('viewer')
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
        <div className="text-center py-12">
          <div className="text-6xl mb-4">🥽</div>
          <h3 className="text-xl font-semibold text-gray-800 mb-2">AR View Active</h3>
          <p className="text-gray-600 mb-6">Viewing construction: {scannedData.projectName}</p>
          <button onClick={handleExitAR} className="btn-secondary">Exit AR</button>
        </div>
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
          <TabsList className="grid w-full grid-cols-2 glass-card p-2 mb-8">
            <TabsTrigger value="scanner" className="rounded-xl font-medium">📱 QR Scanner</TabsTrigger>
            <TabsTrigger value="viewer" className="rounded-xl font-medium">🥽 AR Viewer</TabsTrigger>
          </TabsList>

          {/* QR Scanner Tab */}
          <TabsContent value="scanner" className="space-y-6">
            <div className="glass-card p-8">
              <h2 className="text-2xl font-bold text-gray-800 mb-6">📱 QR Code Scanner</h2>
              
              <div className="grid md:grid-cols-2 gap-8">
                <div>
                  <h3 className="text-lg font-semibold text-gray-800 mb-4">🎯 How to Scan</h3>
                  <div className="space-y-3">
                    <div className="flex items-start gap-3">
                      <span className="status-dot status-active mt-2"></span>
                      <div>
                        <strong>Find QR Code:</strong> Look for the printed QR code at the construction site
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <span className="status-dot status-active mt-2"></span>
                      <div>
                        <strong>Point Camera:</strong> Aim your device camera at the QR code
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <span className="status-dot status-active mt-2"></span>
                      <div>
                        <strong>View in AR:</strong> Watch the 3D construction appear in real space
                      </div>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="text-lg font-semibold text-gray-800 mb-4">📱 Camera Scanner</h3>
                  <div className="bg-gray-100 rounded-xl p-8 text-center h-64 flex items-center justify-center">
                    <div className="glass-card p-8 w-full h-full relative overflow-hidden">
                      <div className="absolute inset-0 flex items-center justify-center text-center">
                        <div>
                          <span className="text-6xl block mb-4">📱</span>
                          <h3 className="text-xl font-semibold text-gray-800 mb-2">Ready to Scan</h3>
                          <p className="text-gray-600 mb-6">Point your camera at a QR code to view the construction in AR</p>
                          
                          <div className="space-y-4">
                            <button 
                              className="btn-primary w-full max-w-xs mx-auto block"
                              onClick={handleDemoQRPair}
                            >
                              📸 Open Camera Scanner
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-8 grid md:grid-cols-3 gap-6">
                <div className="text-center glass-card p-6">
                  <div className="text-3xl mb-2">🏗️</div>
                  <div className="text-xl font-bold text-gray-800">3D Models</div>
                  <div className="text-gray-600">See constructions in 3D space</div>
                </div>
                <div className="text-center glass-card p-6">
                  <div className="text-3xl mb-2">📐</div>
                  <div className="text-xl font-bold text-gray-800">Real Scale</div>
                  <div className="text-gray-600">Experience true-to-life dimensions</div>
                </div>
                <div className="text-center glass-card p-6">
                  <div className="text-3xl mb-2">🌱</div>
                  <div className="text-xl font-bold text-gray-800">Sustainable</div>
                  <div className="text-gray-600">Learn about eco-friendly materials</div>
                </div>
              </div>
            </div>
          </TabsContent>

          {/* AR Viewer Tab */}
          <TabsContent value="viewer" className="space-y-6">
            <div className="glass-card p-8">
              <h2 className="text-2xl font-bold text-gray-800 mb-6">🥽 AR Viewer</h2>
              
              {qrPairData ? (
                <ARViewerPairs 
                  qrPairData={qrPairData}
                  onBack={() => setActiveTab('scanner')}
                />
              ) : scannedData ? (
                <div className="text-center py-12">
                  <div className="text-6xl mb-4">🥽</div>
                  <h3 className="text-xl font-semibold text-gray-800 mb-2">AR View Ready</h3>
                  <p className="text-gray-600 mb-6">Viewing construction: {scannedData.projectName}</p>
                  
                  <div className="glass-card p-6 max-w-md mx-auto text-left">
                    <h4 className="font-semibold text-gray-800 mb-3">📍 Anchor Details</h4>
                    <div className="space-y-2 text-sm">
                      <div><strong>Name:</strong> {scannedData.anchor.name}</div>
                      <div><strong>Purpose:</strong> {scannedData.anchor.purpose}</div>
                      <div><strong>Material:</strong> {brickTypes[scannedData.brickType as keyof typeof brickTypes]?.name}</div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-12">
                  <div className="text-6xl mb-4">📱</div>
                  <h3 className="text-xl font-semibold text-gray-800 mb-2">No QR Code Scanned</h3>
                  <p className="text-gray-600 mb-6">Go to scanner tab to scan a QR code first</p>
                  <button 
                    onClick={() => setActiveTab('scanner')}
                    className="btn-primary"
                  >
                    📱 Go to Scanner
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