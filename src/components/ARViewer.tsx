import { useEffect, useRef, useState } from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { useWebXR, useThreeScene, useARConstruction } from '../hooks/useWebXR';
import { brickTypes } from '../utils/brickTypes';
import type { AnchorQRData, BrickTypeKey, Anchor } from '../types';

interface ARViewerProps {
  scannedData?: AnchorQRData | null;
  onBack?: () => void;
}

export default function ARViewer({ scannedData, onBack }: ARViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isWebView, setIsWebView] = useState(false);

  const {
    xrState,
    error: xrError,
    startXRSession,
    endXRSession,
    clearError
  } = useWebXR();

  const {
    sceneState,
    bricks,
    isAnimating,
    initializeScene,
    addBrick,
    clearAllBricks,
    startAnimation,
    stopAnimation,
    resizeRenderer,
    disposeScene
  } = useThreeScene();

  const {
    anchors,
    isConstructing,
    constructionProgress,
    addAnchor,
    constructBetweenAnchors,
    clearAnchors
  } = useARConstruction();

  const [constructionMode, setConstructionMode] = useState<'manual' | 'auto'>('auto');
  const [selectedBrickType, setSelectedBrickType] = useState<BrickTypeKey>('clay-sustainable');

  // Initialize scene when container is available
  useEffect(() => {
    if (containerRef.current && !sceneState.isInitialized) {
      try {
        initializeScene(containerRef.current);
      } catch (error) {
        console.error('Failed to initialize scene:', error);
      }
    }
  }, [containerRef.current, sceneState.isInitialized, initializeScene]);

  // Start animation when scene is ready
  useEffect(() => {
    if (sceneState.isInitialized && !isAnimating) {
      startAnimation();
    }

    return () => {
      if (isAnimating) {
        stopAnimation();
      }
    };
  }, [sceneState.isInitialized, isAnimating, startAnimation, stopAnimation]);

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      if (containerRef.current && sceneState.renderer) {
        const { clientWidth, clientHeight } = containerRef.current;
        resizeRenderer(clientWidth, clientHeight);
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [sceneState.renderer, resizeRenderer]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disposeScene();
    };
  }, [disposeScene]);

  // Add anchor when QR data is scanned
  useEffect(() => {
    if (scannedData && sceneState.scene) {
      addAnchor(scannedData.anchor, sceneState.scene);
    }
  }, [scannedData, sceneState.scene, addAnchor]);

  const handleStartWebXR = async () => {
    try {
      clearError();
      await startXRSession();
      if (sceneState.renderer) {
        sceneState.renderer.xr.setSession(xrState.session);
      }
    } catch (error) {
      console.error('Failed to start WebXR:', error);
    }
  };

  const handleStopWebXR = async () => {
    try {
      await endXRSession();
    } catch (error) {
      console.error('Failed to stop WebXR:', error);
    }
  };

  const handleStartWebView = () => {
    setIsWebView(true);
    // Start simple 3D preview without AR
    if (sceneState.scene) {
      // Add some demo construction
      handleDemoConstruction();
    }
  };

  const handleDemoConstruction = async () => {
    if (!sceneState.scene) return;

    // Clear existing construction
    clearAllBricks();
    clearAnchors(sceneState.scene);

    // Create demo anchors
    const anchor1: Anchor = {
      purpose: 'foundation',
      name: 'Demo Anchor 1',
      position: { x: -1, y: 0, z: 0 },
      constructionType: 'foundation'
    };
    const anchor2: Anchor = {
      purpose: 'foundation', 
      name: 'Demo Anchor 2',
      position: { x: 1, y: 0, z: 0 },
      constructionType: 'foundation'
    };
    const anchor3: Anchor = {
      purpose: 'wall-corner',
      name: 'Demo Anchor 3', 
      position: { x: 0, y: 1, z: 0 },
      constructionType: 'wall'
    };

    addAnchor(anchor1, sceneState.scene);
    addAnchor(anchor2, sceneState.scene);
    addAnchor(anchor3, sceneState.scene);

    // Build between anchors
    await constructBetweenAnchors(anchor1.position, anchor2.position, selectedBrickType, addBrick);
    await new Promise(resolve => setTimeout(resolve, 500));
    await constructBetweenAnchors(anchor1.position, anchor3.position, selectedBrickType, addBrick);
    await new Promise(resolve => setTimeout(resolve, 500));
    await constructBetweenAnchors(anchor2.position, anchor3.position, selectedBrickType, addBrick);
  };

  const handleAddBrick = (x: number, y: number, z: number) => {
    addBrick(selectedBrickType, { x, y, z });
  };

  const handleClearConstruction = () => {
    if (sceneState.scene) {
      clearAllBricks();
      clearAnchors(sceneState.scene);
    }
  };

  return (
    <div className="w-full max-w-6xl mx-auto space-y-4">
      {/* AR Control Panel */}
      <Card className="bg-white/10 backdrop-blur-sm border-white/20">
        <CardHeader>
          <CardTitle className="text-white flex items-center justify-between">
            AR Construction Viewer
            {onBack && (
              <Button onClick={onBack} variant="outline" size="sm" className="border-white/30 text-white">
                ← Back
              </Button>
            )}
          </CardTitle>
          <CardDescription className="text-white/80">
            Experience immersive 3D construction in AR or web view
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          
          {/* WebXR Status */}
          <div className="flex items-center justify-between p-3 bg-white/10 rounded-lg">
            <div className="text-white">
              <div className="font-medium">WebXR Status</div>
              <div className="text-sm text-white/80">
                {xrState.isSupported ? 'Supported' : 'Not Supported'} • 
                {xrState.isActive ? ' Active' : ' Inactive'}
              </div>
            </div>
            <div className={`w-3 h-3 rounded-full ${xrState.isActive ? 'bg-green-400' : xrState.isSupported ? 'bg-yellow-400' : 'bg-red-400'}`}></div>
          </div>

          {/* Scanned Data Info */}
          {scannedData && (
            <div className="p-3 bg-green-500/20 border border-green-500/50 rounded-lg">
              <div className="text-white font-medium mb-2">Active Anchor Point</div>
              <div className="text-sm text-white/90 space-y-1">
                <div>Name: {scannedData.anchor.name}</div>
                <div>Type: {scannedData.anchor.constructionType}</div>
                <div>Brick: {brickTypes[scannedData.brickType].name}</div>
                <div>Position: ({scannedData.anchor.position.x}, {scannedData.anchor.position.y}, {scannedData.anchor.position.z})</div>
              </div>
            </div>
          )}

          {/* Construction Controls */}
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-white mb-2">Brick Type</label>
                <select
                  value={selectedBrickType}
                  onChange={(e) => setSelectedBrickType(e.target.value as BrickTypeKey)}
                  className="w-full px-3 py-2 bg-white/20 border border-white/30 rounded-md text-white"
                >
                  {Object.entries(brickTypes).map(([key, brick]) => (
                    <option key={key} value={key} className="text-gray-900">
                      {brick.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-white mb-2">Construction Mode</label>
                <select
                  value={constructionMode}
                  onChange={(e) => setConstructionMode(e.target.value as 'manual' | 'auto')}
                  className="w-full px-3 py-2 bg-white/20 border border-white/30 rounded-md text-white"
                >
                  <option value="auto" className="text-gray-900">Auto Build</option>
                  <option value="manual" className="text-gray-900">Manual Placement</option>
                </select>
              </div>
            </div>

            <div className="space-y-3">
              <div className="text-white">
                <div className="text-sm">Construction Stats</div>
                <div className="text-xs text-white/80 space-y-1 mt-1">
                  <div>Anchors: {anchors.length}</div>
                  <div>Bricks: {bricks.length}</div>
                  <div>Progress: {Math.round(constructionProgress)}%</div>
                </div>
              </div>
              
              {isConstructing && (
                <div className="space-y-2">
                  <div className="text-sm text-white">Building...</div>
                  <div className="w-full bg-white/20 rounded-full h-2">
                    <div 
                      className="bg-blue-400 h-2 rounded-full transition-all duration-300" 
                      style={{ width: `${constructionProgress}%` }}
                    ></div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 flex-wrap">
            {xrState.isSupported && !xrState.isActive && (
              <Button 
                onClick={handleStartWebXR}
                className="bg-purple-600 hover:bg-purple-700"
              >
                Start AR Mode
              </Button>
            )}
            
            {xrState.isActive && (
              <Button 
                onClick={handleStopWebXR}
                variant="outline"
                className="border-red-400 text-red-400 hover:bg-red-400/20"
              >
                Stop AR
              </Button>
            )}

            {!isWebView && (
              <Button 
                onClick={handleStartWebView}
                className="bg-blue-600 hover:bg-blue-700"
              >
                Start 3D Preview
              </Button>
            )}

            <Button 
              onClick={handleDemoConstruction}
              disabled={isConstructing}
              className="bg-green-600 hover:bg-green-700"
            >
              Demo Construction
            </Button>

            <Button 
              onClick={handleClearConstruction}
              variant="outline"
              className="border-orange-400 text-orange-400 hover:bg-orange-400/20"
            >
              Clear All
            </Button>
          </div>

          {/* Error Display */}
          {xrError && (
            <div className="p-3 bg-red-500/20 border border-red-500/50 rounded-md">
              <p className="text-red-200">{xrError}</p>
              <Button 
                onClick={clearError}
                size="sm"
                variant="outline"
                className="mt-2 border-red-400 text-red-400"
              >
                Dismiss
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 3D Viewer */}
      <Card className="bg-white/10 backdrop-blur-sm border-white/20">
        <CardContent className="p-0">
          <div 
            ref={containerRef}
            className="w-full bg-black rounded-lg overflow-hidden"
            style={{ height: '500px' }}
          >
            {!sceneState.isInitialized && (
              <div className="w-full h-full flex items-center justify-center">
                <div className="text-center text-white">
                  <div className="text-4xl mb-4">🔄</div>
                  <p>Initializing 3D Scene...</p>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Manual Construction Controls */}
      {constructionMode === 'manual' && (
        <Card className="bg-white/10 backdrop-blur-sm border-white/20">
          <CardHeader>
            <CardTitle className="text-white">Manual Brick Placement</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 md:grid-cols-3">
              <Button 
                onClick={() => handleAddBrick(-0.5, 0, 0)}
                className="bg-blue-600 hover:bg-blue-700"
              >
                Add Brick Left
              </Button>
              <Button 
                onClick={() => handleAddBrick(0, 0, 0)}
                className="bg-blue-600 hover:bg-blue-700"
              >
                Add Brick Center
              </Button>
              <Button 
                onClick={() => handleAddBrick(0.5, 0, 0)}
                className="bg-blue-600 hover:bg-blue-700"
              >
                Add Brick Right
              </Button>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <Button 
                onClick={() => handleAddBrick(0, 0.3, 0)}
                className="bg-green-600 hover:bg-green-700"
              >
                Add Brick Up
              </Button>
              <Button 
                onClick={() => handleAddBrick(0, -0.3, 0)}
                className="bg-red-600 hover:bg-red-700"
              >
                Add Brick Down
              </Button>
              <Button 
                onClick={() => handleAddBrick(0, 0, 0.5)}
                className="bg-yellow-600 hover:bg-yellow-700"
              >
                Add Brick Forward
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Instructions */}
      <Card className="bg-white/10 backdrop-blur-sm border-white/20">
        <CardHeader>
          <CardTitle className="text-white">AR Instructions</CardTitle>
        </CardHeader>
        <CardContent className="text-white text-sm space-y-2">
          <p>• <strong>AR Mode:</strong> Requires a WebXR-compatible browser and AR device</p>
          <p>• <strong>3D Preview:</strong> Works in any modern browser for construction preview</p>
          <p>• <strong>Demo Mode:</strong> Shows automatic construction between anchor points</p>
          <p>• <strong>Manual Mode:</strong> Place bricks individually using the controls</p>
          <p>• <strong>Brick Selection:</strong> Choose different sustainable brick types for construction</p>
        </CardContent>
      </Card>
    </div>
  );
} 