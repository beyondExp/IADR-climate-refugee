import { useEffect, useRef, useState } from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { useWebXR } from '../hooks/useWebXR';
import type { QRCode } from '../lib/supabase';

interface ARViewerPairsProps {
  qrPairData: { 
    primary: QRCode; 
    secondary: QRCode; 
    referenceDistance: number;
    projectId: string;
  };
  onBack: () => void;
}

export default function ARViewerPairs({ qrPairData, onBack }: ARViewerPairsProps) {
  const [currentQRPair, setCurrentQRPair] = useState<{primary: QRCode, secondary: QRCode} | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [detectedPairs, setDetectedPairs] = useState<{primary: any, secondary: any} | null>(null);
  const [isTrackingPairs, setIsTrackingPairs] = useState(false);
  const [constructionReady, setConstructionReady] = useState(false);
  
  const {
    xrState,
    error: xrError,
    startXRSession,
    endXRSession,
    clearError
  } = useWebXR();
  
  // Initialize with provided qrPairData
  useEffect(() => {
    if (qrPairData) {
      setCurrentQRPair({
        primary: qrPairData.primary,
        secondary: qrPairData.secondary
      });
    }
  }, [qrPairData]);

  // Calculate 3D coordinate system from QR pair positions
  const calculateCoordinateSystem = (primaryPose: any, secondaryPose: any) => {
    if (!qrPairData) return null;

    // Calculate the real-world scale based on detected distance vs reference distance
    const detectedDistance = Math.sqrt(
      Math.pow(secondaryPose.position.x - primaryPose.position.x, 2) +
      Math.pow(secondaryPose.position.y - primaryPose.position.y, 2) +
      Math.pow(secondaryPose.position.z - primaryPose.position.z, 2)
    );
    
    const scale = qrPairData.referenceDistance / detectedDistance;
    
    // Calculate orientation vector from primary to secondary
    const orientation = {
      x: secondaryPose.position.x - primaryPose.position.x,
      y: secondaryPose.position.y - primaryPose.position.y,
      z: secondaryPose.position.z - primaryPose.position.z
    };
    
    // Normalize orientation vector
    const length = Math.sqrt(orientation.x * orientation.x + orientation.y * orientation.y + orientation.z * orientation.z);
    orientation.x /= length;
    orientation.y /= length;
    orientation.z /= length;

    return {
      origin: primaryPose.position,
      scale,
      orientation,
      referenceDistance: qrPairData.referenceDistance
    };
  };

  const handleStartQRPairTracking = async () => {
    if (!qrPairData) return;
    
    setIsTrackingPairs(true);
    
    // Simulate QR pair detection
    setTimeout(() => {
      setDetectedPairs({
        primary: { position: { x: -1, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 } },
        secondary: { position: { x: 1, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 } }
      });
      setConstructionReady(true);
    }, 2000);
  };

  const handleStartARConstruction = async () => {
    if (!constructionReady || !detectedPairs?.primary || !detectedPairs?.secondary) return;
    
    try {
      if (clearError) clearError();
      if (startXRSession) await startXRSession();
      
      // Calculate coordinate system
      const coordSystem = calculateCoordinateSystem(detectedPairs.primary, detectedPairs.secondary);
      
      if (coordSystem && qrPairData) {
        console.log('Starting AR construction with coordinate system:', coordSystem);
        console.log('Project ID:', qrPairData.projectId);
      }
    } catch (error) {
      console.error('Failed to start AR construction:', error);
    }
  };

  const handleWebViewDemo = () => {
    // Show 3D preview of the construction project
    console.log('WebView demo mode activated');
  };

  return (
    <div className="w-full max-w-6xl mx-auto space-y-4">
      {/* AR Control Panel */}
      <Card className="bg-white/10 backdrop-blur-sm border-white/20">
        <CardHeader>
          <CardTitle className="text-white flex items-center justify-between">
            🔄 AR Construction with QR Pairs
            {onBack && (
              <Button onClick={onBack} variant="outline" size="sm" className="border-white/30 text-white">
                ← Back
              </Button>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          
          {/* QR Pair Information */}
          {qrPairData && (
            <div className="p-4 bg-white/10 rounded-lg space-y-3">
              <h3 className="text-white font-semibold text-lg">📐 QR Pair Configuration</h3>
              <div className="grid md:grid-cols-2 gap-4 text-sm">
                <div className="space-y-2">
                  <div className="text-cyan-200">
                    <strong>Primary QR:</strong> {qrPairData.primary.id.slice(0, 8)}...
                  </div>
                  <div className="text-cyan-200">
                    <strong>Secondary QR:</strong> {qrPairData.secondary.id.slice(0, 8)}...
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="text-cyan-200">
                    <strong>Reference Distance:</strong> {qrPairData.referenceDistance}m
                  </div>
                  <div className="text-cyan-200">
                    <strong>Project:</strong> {qrPairData.projectId.slice(0, 8)}...
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Step-by-Step Process */}
          <div className="space-y-4">
            
            {/* Step 1: QR Pair Detection */}
            <div className={`p-4 rounded-lg border-2 ${isTrackingPairs ? 'border-cyan-400 bg-cyan-500/20' : 'border-white/30 bg-white/10'}`}>
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-white font-semibold">1️⃣ Detect QR Code Pair</h4>
                  <p className="text-white/70 text-sm">Position both QR codes in camera view</p>
                </div>
                <div className="space-x-2">
                  {!isTrackingPairs ? (
                    <Button 
                      onClick={handleStartQRPairTracking}
                      className="bg-cyan-500 hover:bg-cyan-600 text-white"
                      disabled={!qrPairData}
                    >
                      📱 Start Detection
                    </Button>
                  ) : (
                    <div className="flex items-center space-x-2">
                      <div className="animate-spin h-4 w-4 border-2 border-cyan-400 border-t-transparent rounded-full"></div>
                      <span className="text-cyan-200 text-sm">Detecting...</span>
                    </div>
                  )}
                </div>
              </div>
              
              {isTrackingPairs && (
                <div className="mt-3 space-y-2">
                  <div className={`text-sm flex items-center space-x-2 ${detectedPairs?.primary ? 'text-green-300' : 'text-yellow-300'}`}>
                    <span>{detectedPairs?.primary ? '✅' : '🔍'}</span>
                    <span>Primary QR Code {detectedPairs?.primary ? 'Detected' : 'Scanning...'}</span>
                  </div>
                  <div className={`text-sm flex items-center space-x-2 ${detectedPairs?.secondary ? 'text-green-300' : 'text-yellow-300'}`}>
                    <span>{detectedPairs?.secondary ? '✅' : '🔍'}</span>
                    <span>Secondary QR Code {detectedPairs?.secondary ? 'Detected' : 'Scanning...'}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Step 2: AR Construction */}
            <div className={`p-4 rounded-lg border-2 ${constructionReady ? 'border-green-400 bg-green-500/20' : 'border-white/30 bg-white/10'}`}>
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-white font-semibold">2️⃣ Start AR Construction</h4>
                  <p className="text-white/70 text-sm">Begin building in augmented reality</p>
                </div>
                <div className="space-x-2">
                  {constructionReady ? (
                    <Button 
                      onClick={handleStartARConstruction}
                      className="bg-green-500 hover:bg-green-600 text-white"
                    >
                      🏗️ Enter AR Mode
                    </Button>
                  ) : (
                    <span className="text-gray-400 text-sm">Complete QR detection first</span>
                  )}
                </div>
              </div>
              
              {xrState.isSupported && (
                <div className="mt-3 text-sm text-green-300">
                  ✅ WebXR supported on this device
                </div>
              )}
            </div>

            {/* Step 3: Web View */}
            <div className={`p-4 rounded-lg border-2 ${xrState.isActive ? 'border-purple-400 bg-purple-500/20' : 'border-white/30 bg-white/10'}`}>
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-white font-semibold">3️⃣ Launch Web View</h4>
                  <p className="text-white/70 text-sm">View 3D construction project in web browser</p>
                </div>
                <div className="space-x-2">
                  <Button 
                    onClick={handleWebViewDemo}
                    variant="outline" 
                    className="border-white/30 text-white hover:bg-white/10"
                  >
                    🖥️ Web View
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* WebXR Status */}
          {xrState.isActive && (
            <div className="p-4 bg-purple-500/20 rounded-lg">
              <div className="flex items-center justify-between">
                <div className="text-purple-200">
                  <strong>AR Session Active</strong>
                  <p className="text-sm">Constructing in AR space with QR pair coordinates</p>
                </div>
                <Button 
                  onClick={() => endXRSession && endXRSession()}
                  variant="outline" 
                  className="border-purple-300 text-purple-200"
                >
                  End AR
                </Button>
              </div>
            </div>
          )}

          {/* Controls */}
          <div className="flex justify-between items-center">
            <Button 
              onClick={handleWebViewDemo}
              variant="outline" 
              className="border-white/30 text-white"
            >
              📱 WebView Preview
            </Button>
            
            <div className="flex space-x-2">
              {xrState.isActive && (
                <Button 
                  onClick={() => endXRSession && endXRSession()}
                  variant="outline" 
                  className="border-red-300 text-red-300"
                >
                  🚪 Exit AR
                </Button>
              )}
            </div>
          </div>
          
          {xrError && (
            <div className="mt-4 p-3 bg-red-900/30 border border-red-400/50 rounded-lg">
              <p className="text-red-300 text-sm">WebXR Error: {xrError}</p>
            </div>
          )}
          
        </CardContent>
      </Card>

      {/* 3D Viewport */}
      <div 
        ref={containerRef}
        className="w-full h-96 bg-black/20 rounded-lg border border-white/20 relative overflow-hidden"
      >
        {!currentQRPair ? (
          <div className="absolute inset-0 flex items-center justify-center text-center">
            <div className="text-white/60">
              <div className="text-4xl mb-4">📱📱</div>
              <p>Scan a QR code pair to begin AR construction</p>
            </div>
          </div>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-center">
            <div className="text-white/60">
              <div className="text-4xl mb-4">🏗️</div>
              <p>3D construction preview will appear here</p>
              <p className="text-sm mt-2">Using QR pair: {qrPairData.referenceDistance}m reference</p>
            </div>
          </div>
        )}
      </div>

      {detectedPairs && (
        <div className="space-y-4">
          <div className="bg-green-900/30 border border-green-400/50 rounded-xl p-4">
            <h4 className="text-white font-semibold mb-3 flex items-center gap-2">
              <span className="status-dot status-active"></span>
              QR Pair Detected
            </h4>
            
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <div className="font-medium text-green-200">Primary QR</div>
                <div className="text-green-300">Position: {detectedPairs.primary ? 'Locked' : 'Scanning...'}</div>
                <div className="text-green-300">Status: {detectedPairs.primary ? '✓ Tracked' : '🔍 Detecting'}</div>
              </div>
              <div>
                <div className="font-medium text-green-200">Secondary QR</div>
                <div className="text-green-300">Position: {detectedPairs.secondary ? 'Locked' : 'Scanning...'}</div>
                <div className="text-green-300">Status: {detectedPairs.secondary ? '✓ Tracked' : '🔍 Detecting'}</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 