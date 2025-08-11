import { useState, useRef, useEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Grid, Box, Sphere, Line, useGLTF, TransformControls } from '@react-three/drei';
import * as THREE from 'three';
import type { 
  ConnectionType, 
  ConnectionAxis, 
  ConnectionPoint 
} from '../../utils/brickConnectionSystem';
import { BrickConnectionSystem } from '../../utils/brickConnectionSystem';
import { BrickConfigurationService } from '../../lib/brickConfigurationService';

// Three.js objects are already extended by @react-three/drei

// Preload the GLTF model
useGLTF.preload('/Octa2.glb');

interface ConnectionPointEditorProps {
  brickId: string;
  onConnectionsUpdated?: (connections: ConnectionPoint[]) => void;
}

interface EditableConnectionPoint extends ConnectionPoint {
  isBeingEdited: boolean;
  temporaryPosition?: THREE.Vector3;
}

export default function ConnectionPointEditor({ brickId, onConnectionsUpdated }: ConnectionPointEditorProps) {
  const [connectionSystem] = useState(() => new BrickConnectionSystem());
  const [connections, setConnections] = useState<EditableConnectionPoint[]>([]);
  const [selectedConnection, setSelectedConnection] = useState<string | null>(null);
  // const [editMode, setEditMode] = useState<'position' | 'type' | 'axis'>('position');
  const [showHelpers, setShowHelpers] = useState(true);
  const [isDragging, setIsDragging] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved');
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [useHttpMethod, setUseHttpMethod] = useState(true);

  // Save configuration to database and localStorage
  const saveConfiguration = async (connectionsToSave: EditableConnectionPoint[]) => {
    console.log('🎨 ConnectionPointEditor.saveConfiguration() - START');
    console.log(`📊 UI Input:`, { brickId, connectionCount: connectionsToSave.length, connectionsToSave });
    
    const startTime = performance.now();
    
    try {
      console.log('🔄 Setting save status to "saving"...');
      setSaveStatus('saving');
      
      console.log('🔄 Converting to plain ConnectionPoint objects...');
      // Convert to plain ConnectionPoint objects (remove editing metadata)
      const plainConnections: ConnectionPoint[] = connectionsToSave.map(conn => ({
        id: conn.id,
        type: conn.type,
        axis: conn.axis,
        localPosition: conn.localPosition,
        localRotation: conn.localRotation,
        strength: conn.strength,
        isConnected: conn.isConnected
      }));
      
      console.log('📝 Plain connections prepared:', plainConnections);
      console.log(`🎯 Save method: ${useHttpMethod ? 'HTTP Direct' : 'Supabase Client'}`);
      
      if (useHttpMethod) {
        console.log('🌐 Using HTTP method (Creator approach), calling direct HTTP API...');
        
        const serviceStart = performance.now();
        
        try {
          // Use HTTP method directly
          await BrickConfigurationService.saveConfigurationViaHTTP(brickId, plainConnections);
          
          const serviceTime = performance.now() - serviceStart;
          console.log(`✅ HTTP save completed in ${serviceTime.toFixed(2)}ms`);
          
        } catch (httpError: any) {
          console.error('❌ HTTP save failed:', httpError);
          
          // Check for specific RLS recursion error
          if (httpError.message?.includes('42P17') || httpError.message?.includes('infinite recursion')) {
            console.error('🚨 RLS Policy infinite recursion detected! Database migration needed.');
            throw new Error('Database RLS policy error - please run the FIX_rls_infinite_recursion.sql migration');
          }
          
          if (httpError.message?.includes('timeout')) {
            console.log('⏰ HTTP save timed out, switching to Supabase client method...');
            setUseHttpMethod(false);
          }
          
          throw httpError;
        }
        
      } else {
        console.log('🚀 Calling BrickConfigurationService.saveConfiguration()...');
        
        const serviceStart = performance.now();
        
        // Create a timeout promise to detect hanging saves
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => {
            reject(new Error('Save operation timed out after 10 seconds'));
          }, 10000); // 10 second timeout
        });
        
        try {
          // Race between the save operation and timeout
          await Promise.race([
            BrickConfigurationService.saveConfiguration(brickId, plainConnections),
            timeoutPromise
          ]);
          
          const serviceTime = performance.now() - serviceStart;
          console.log(`✅ BrickConfigurationService.saveConfiguration() completed in ${serviceTime.toFixed(2)}ms`);
          
        } catch (saveError: any) {
          console.error('❌ Database save failed:', saveError);
          
          if (saveError.message?.includes('timed out')) {
            console.log('⏰ Save operation timed out, switching to HTTP method...');
            setUseHttpMethod(true);
          }
          
          throw saveError;
        }
      }
      
      console.log('🔄 Setting save status to "saved"...');
      setSaveStatus('saved');
      setLastSavedAt(new Date());
      
      const totalTime = performance.now() - startTime;
      console.log(`🎉 ConnectionPointEditor.saveConfiguration() - SUCCESS in ${totalTime.toFixed(2)}ms`);
      
    } catch (error) {
      const totalTime = performance.now() - startTime;
      console.error(`❌ ConnectionPointEditor.saveConfiguration() - FAILED after ${totalTime.toFixed(2)}ms:`, error);
      console.error('📄 Error details:', error);
      
      console.log('🔄 Setting save status to "unsaved" due to error...');
      setSaveStatus('unsaved');
    }
  };

  // Load configuration from database or localStorage
  const loadConfiguration = async (): Promise<EditableConnectionPoint[] | null> => {
    try {
      let connections: ConnectionPoint[] | null = null;
      
      console.log('🌐 Loading from database...');
      connections = await BrickConfigurationService.loadConfiguration(brickId);
      
      if (!connections || connections.length === 0) {
        return null;
      }
      
      return connections.map((conn: ConnectionPoint) => ({
        ...conn,
        isBeingEdited: false
      }));
    } catch (error) {
      console.error('Failed to load connection configuration:', error);
      return null;
    }
  };

  // Initialize with saved configuration or default brick
  useEffect(() => {
    const initializeConnections = async () => {
      try {
        const savedConnections = await loadConfiguration();
        
        if (savedConnections && savedConnections.length > 0) {
          setConnections(savedConnections);
          setLastSavedAt(new Date());
        } else {
          // Create default brick if no saved configuration
          const brick = connectionSystem.createRevolutionaryBrick(
            brickId,
            new THREE.Vector3(0, 0, 0),
            new THREE.Euler(0, 0, 0),
            'clay-sustainable'
          );
          
          const editableConnections: EditableConnectionPoint[] = brick.connections.map(conn => ({
            ...conn,
            isBeingEdited: false
          }));
          
          setConnections(editableConnections);
          // Auto-save the default configuration
          await saveConfiguration(editableConnections);
        }
      } catch (error) {
        console.error('Failed to initialize connections:', error);
        // Fallback to empty connections if everything fails
        setConnections([]);
      }
    };

    initializeConnections();
  }, [brickId, connectionSystem]);

  // Auto-save with debouncing
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  const scheduleAutoSave = (connectionsToSave: EditableConnectionPoint[]) => {
    console.log('⏰ scheduleAutoSave() triggered');
    console.log(`📊 Connections to save:`, { count: connectionsToSave.length, connections: connectionsToSave });
    
    setSaveStatus('saving');
    
    // Clear existing timeout
    if (autoSaveTimeoutRef.current) {
      console.log('🔄 Clearing existing auto-save timeout');
      clearTimeout(autoSaveTimeoutRef.current);
    }
    
    console.log('⏰ Scheduling auto-save in 500ms...');
    // Schedule save after 500ms of no changes
    autoSaveTimeoutRef.current = setTimeout(async () => {
      console.log('🔥 Auto-save timeout triggered, executing save...');
      await saveConfiguration(connectionsToSave);
    }, 500);
  };

  const updateConnection = (connectionId: string, updates: Partial<ConnectionPoint>) => {
    const updatedConnections = connections.map(conn => 
      conn.id === connectionId ? { ...conn, ...updates } : conn
    );
    
    setConnections(updatedConnections);
    
    // Notify parent component
    onConnectionsUpdated?.(updatedConnections);
    
    // Auto-save the changes
    scheduleAutoSave(updatedConnections);
  };

  // Clear selected connection if it no longer exists
  useEffect(() => {
    if (selectedConnection && !connections.find(c => c.id === selectedConnection)) {
      setSelectedConnection(null);
    }
  }, [connections, selectedConnection]);

  const addConnection = (type: ConnectionType) => {
    const newConnection: EditableConnectionPoint = {
      id: `${brickId}_${type}_${Date.now()}`,
      type,
      axis: 'y',
      localPosition: new THREE.Vector3(0, 0, 0),
      localRotation: new THREE.Euler(0, 0, 0),
      strength: type === 'neutral' ? 0.8 : 1.0,
      isConnected: false,
      isBeingEdited: true
    };
    
    const updatedConnections = [...connections, newConnection];
    setConnections(updatedConnections);
    setSelectedConnection(newConnection.id);
    
    // Auto-save the new connection
    scheduleAutoSave(updatedConnections);
  };

  const removeConnection = (connectionId: string) => {
    const updatedConnections = connections.filter(conn => conn.id !== connectionId);
    setConnections(updatedConnections);
    
    if (selectedConnection === connectionId) {
      setSelectedConnection(null);
    }
    
    // Auto-save after removal
    scheduleAutoSave(updatedConnections);
  };

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
    };
  }, []);

  return (
    <div className="connection-point-editor bg-gray-900 text-white min-h-screen">
      {/* Header */}
      <div className="bg-gray-800 p-4 border-b border-gray-700">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-xl font-bold text-green-400">🔧 Brick Connection Point Editor</h1>
            <p className="text-gray-300">Edit connection points for brick: {brickId}</p>
          </div>
          
          {/* Save Status Indicator */}
          <div className="flex flex-col items-end">
            <div className="flex flex-col items-end gap-1">
              <div className={`flex items-center gap-2 px-3 py-1 rounded text-sm font-medium ${
                saveStatus === 'saved' ? 'bg-green-600/20 text-green-400' :
                saveStatus === 'saving' ? 'bg-yellow-600/20 text-yellow-400' :
                'bg-red-600/20 text-red-400'
              }`}>
                {saveStatus === 'saved' && (
                  <>
                    <span className="w-2 h-2 bg-green-400 rounded-full"></span>
                    All changes saved
                  </>
                )}
                {saveStatus === 'saving' && (
                  <>
                    <span className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse"></span>
                    Saving...
                  </>
                )}
                {saveStatus === 'unsaved' && (
                  <>
                    <span className="w-2 h-2 bg-red-400 rounded-full"></span>
                    Unsaved changes
                  </>
                )}
              </div>
              
              {/* Storage Mode Indicator */}
              <div className={`px-2 py-1 rounded text-xs ${
                useHttpMethod ? 'bg-green-600/20 text-green-400' : 'bg-blue-600/20 text-blue-400'
              }`}>
                {useHttpMethod ? '🌐 HTTP DB' : '🔄 Supabase Client'}
              </div>
            </div>
            {lastSavedAt && (
              <div className="text-xs text-gray-500 mt-1">
                Last saved: {lastSavedAt.toLocaleTimeString()}
              </div>
            )}
          </div>
        </div>
        
        {/* Mode Info Banner */}
        {useHttpMethod ? (
          <div className="bg-green-600/20 border-l-4 border-green-500 p-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <span className="text-green-400 text-xl">🌐</span>
              </div>
              <div className="ml-3">
                <p className="text-sm text-green-300">
                  <strong>HTTP Database Mode:</strong> Using the Creator interface method for reliable database saves.
                  Fast and syncs across devices.
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-yellow-600/20 border-l-4 border-yellow-500 p-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <span className="text-yellow-400 text-xl">⚠️</span>
              </div>
              <div className="ml-3">
                <p className="text-sm text-yellow-300">
                  <strong>Supabase Client Mode:</strong> Legacy method that may experience timeouts.
                  Consider switching to HTTP mode for better reliability.
                </p>
                <button 
                  onClick={() => setUseHttpMethod(true)}
                  className="text-xs text-yellow-200 underline hover:text-yellow-100 mt-1"
                >
                  Switch to HTTP mode (recommended)
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="flex h-screen">
        {/* Sidebar Controls */}
        <div className="w-80 bg-gray-800 p-4 overflow-y-auto border-r border-gray-700">
          
          {/* Save Controls */}
          <div className="mb-6">
            <h3 className="text-lg font-semibold text-green-400 mb-3">Configuration</h3>
            <div className="space-y-2">
              <button
                onClick={() => saveConfiguration(connections)}
                disabled={saveStatus === 'saving'}
                className="w-full px-3 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded text-sm font-medium flex items-center justify-center gap-2"
              >
                {saveStatus === 'saving' ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                    Saving...
                  </>
                ) : (
                  <>
                    💾 Save Now
                  </>
                )}
              </button>
              
              <button
                onClick={async () => {
                  console.log('🔍 Manual database connection test triggered');
                  await BrickConfigurationService.testDatabaseConnection();
                }}
                className="w-full px-3 py-2 bg-blue-600 hover:bg-blue-700 rounded text-sm"
              >
                🔍 Test Database
              </button>
              
              <button
                onClick={async () => {
                  console.log('🌐 Testing HTTP save method (Creator approach)...');
                  try {
                    const plainConnections: ConnectionPoint[] = connections.map(conn => ({
                      id: conn.id,
                      type: conn.type,
                      axis: conn.axis,
                      localPosition: conn.localPosition,
                      localRotation: conn.localRotation,
                      strength: conn.strength,
                      isConnected: conn.isConnected
                    }));
                    
                    const result = await BrickConfigurationService.saveConfigurationViaHTTP(brickId, plainConnections);
                    console.log('✅ HTTP save test successful:', result);
                    alert('✅ HTTP save test successful! Check console for details.');
                  } catch (error) {
                    console.error('❌ HTTP save test failed:', error);
                    alert('❌ HTTP save test failed. Check console for details.');
                  }
                }}
                className="w-full px-3 py-2 bg-purple-600 hover:bg-purple-700 rounded text-sm"
              >
                🌐 Test HTTP Save
              </button>
              
              <div className="w-full">
                <label className="block text-sm text-gray-300 mb-2">Database Method</label>
                <button
                  onClick={() => {
                    setUseHttpMethod(!useHttpMethod);
                    console.log(`🔄 Database method changed to: ${!useHttpMethod ? 'HTTP' : 'Supabase Client'}`);
                  }}
                  className={`w-full px-3 py-2 rounded text-sm font-medium transition-colors ${
                    useHttpMethod 
                      ? 'bg-green-600 hover:bg-green-700 text-white' 
                      : 'bg-yellow-600 hover:bg-yellow-700 text-white'
                  }`}
                >
                  {useHttpMethod ? '🌐 HTTP Mode (Recommended)' : '🔄 Supabase Client Mode'}
                </button>
                <div className="text-xs text-gray-500 mt-1">
                  {useHttpMethod 
                    ? '⚡ Fast database saves using Creator method' 
                    : '⚠️ Legacy method, may experience timeouts'
                  }
                </div>
              </div>
              
              <button
                onClick={async () => {
                  if (confirm('This will reset all connection points to default positions and delete your saved configuration. Are you sure?')) {
                    try {
                      // Clear localStorage
                      localStorage.removeItem(`brick-connections-${brickId}`);
                      
                      // Try to delete database configuration
                      const userConfig = await BrickConfigurationService.getUserConfiguration(brickId);
                      if (userConfig) {
                        await BrickConfigurationService.deleteBrickConfiguration(userConfig.id);
                      }
                      
                      // Reload page to reset state
                      window.location.reload();
                    } catch (error) {
                      console.error('Failed to reset configuration:', error);
                      // Still reload even if database delete failed
                      window.location.reload();
                    }
                  }
                }}
                className="w-full px-3 py-2 bg-red-600 hover:bg-red-700 rounded text-sm"
              >
                🔄 Reset to Default
              </button>
            </div>
          </div>

          {/* Add Connection Controls */}
          <div className="mb-6">
            <h3 className="text-lg font-semibold text-green-400 mb-3">Add Connection Point</h3>
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() => addConnection('male')}
                disabled={connections.length >= 6}
                className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed px-3 py-2 rounded text-sm"
              >
                + Male
              </button>
              <button
                onClick={() => addConnection('female')}
                disabled={connections.length >= 6}
                className="bg-pink-600 hover:bg-pink-700 disabled:bg-gray-600 disabled:cursor-not-allowed px-3 py-2 rounded text-sm"
              >
                + Female
              </button>
              <button
                onClick={() => addConnection('neutral')}
                disabled={connections.length >= 6}
                className="bg-yellow-600 hover:bg-yellow-700 disabled:bg-gray-600 disabled:cursor-not-allowed px-3 py-2 rounded text-sm"
              >
                + Neutral
              </button>
            </div>
            {connections.length >= 6 && (
              <p className="text-xs text-yellow-400 mt-2">Maximum 6 connection points reached</p>
            )}
          </div>

          {/* Edit Instructions */}
          <div className="mb-6">
            <h3 className="text-lg font-semibold text-green-400 mb-3">Editing Instructions</h3>
            <div className="text-sm text-gray-300 space-y-2">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 bg-blue-500 rounded"></span>
                <span>Blue = Male connections</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 bg-pink-500 rounded"></span>
                <span>Pink = Female connections</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 bg-yellow-500 rounded"></span>
                <span>Yellow = Neutral connections</span>
              </div>
              <div className="mt-3 p-3 bg-gray-700 rounded">
                <p className="text-xs">
                  <strong>📍 Position:</strong> Click a connection point to select it, then drag the transform gizmo to move it
                </p>
                <p className="text-xs mt-1">
                  <strong>⚙️ Properties:</strong> Use the panel on the right to change type, axis, and strength
                </p>
              </div>
            </div>
          </div>

          {/* Visual Helpers */}
          <div className="mb-6">
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={showHelpers}
                onChange={(e) => setShowHelpers(e.target.checked)}
                className="mr-2"
              />
              Show Connection Helpers
            </label>
          </div>

          {/* Connection List */}
          <div>
            <h3 className="text-lg font-semibold text-green-400 mb-3">
              Connection Points ({connections.length})
            </h3>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {connections.map(conn => (
                <ConnectionPointItem
                  key={conn.id}
                  connection={conn}
                  isSelected={selectedConnection === conn.id}
                  onSelect={() => setSelectedConnection(conn.id)}
                  onUpdate={(updates) => updateConnection(conn.id, updates)}
                  onRemove={() => removeConnection(conn.id)}
                />
              ))}
            </div>
          </div>
        </div>

                    {/* 3D Viewport */}
        <div className="flex-1 relative bg-gray-800 rounded-lg overflow-hidden border border-gray-700">
          <Canvas 
            camera={{ position: [2, 2, 2], fov: 50 }}
            onPointerMissed={() => setSelectedConnection(null)} // Deselect when clicking empty space
          >
            <ambientLight intensity={0.5} />
            <pointLight position={[10, 10, 10]} />
            <directionalLight position={[5, 5, 5]} intensity={0.3} />
            
            {/* Brick Representation */}
            <BrickModel 
              connections={connections} 
              showHelpers={showHelpers}
              selectedConnection={selectedConnection}
              onConnectionSelect={setSelectedConnection}
              onConnectionUpdate={updateConnection}
              isDragging={isDragging}
              setIsDragging={setIsDragging}
            />
            
            {/* Grid and controls */}
            <Grid args={[10, 10]} position={[0, -0.5, 0]} cellColor="#444444" sectionColor="#666666" />
            <OrbitControls 
              enableDamping 
              dampingFactor={0.05} 
              enabled={!isDragging} // Disable orbit when dragging connection points
              minDistance={1}
              maxDistance={10}
            />
          </Canvas>
          
          {/* Viewport Instructions Overlay */}
          <div className="absolute top-4 left-4 bg-black/50 text-white p-3 rounded text-sm">
            <div className="mb-2 font-semibold">🎯 Editing Mode Active</div>
            <div className="text-xs space-y-1">
              <div>• Click connection point to select</div>
              <div>• Drag gizmo to reposition</div>
              <div>• Click empty space to deselect</div>
            </div>
          </div>

          {/* Drag Status Indicator */}
          {isDragging && (
            <div className="absolute top-4 right-4 bg-green-600/80 text-white px-3 py-2 rounded font-medium text-sm">
              🔄 Dragging connection point...
            </div>
          )}

          {/* Selected Connection Indicator */}
          {selectedConnection && !isDragging && (
            <div className="absolute top-4 right-4 bg-blue-600/80 text-white px-3 py-2 rounded text-sm">
              ✨ {connections.find(c => c.id === selectedConnection)?.type.toUpperCase()} connection selected
              <div className="text-xs mt-1 opacity-75">
                {(() => {
                  const conn = connections.find(c => c.id === selectedConnection);
                  if (!conn) return '';
                  const pos = conn.localPosition;
                  return `(${pos.x.toFixed(2)}, ${pos.y.toFixed(2)}, ${pos.z.toFixed(2)})`;
                })()}
              </div>
            </div>
          )}

          {/* Selected Connection Details */}
          {selectedConnection && (() => {
            const selectedConn = connections.find(c => c.id === selectedConnection);
            return selectedConn ? (
              <SelectedConnectionPanel
                connection={selectedConn}
                onUpdate={(updates) => updateConnection(selectedConnection, updates)}
              />
            ) : null;
          })()}
        </div>
      </div>
    </div>
  );
}

// Connection Point List Item Component
function ConnectionPointItem({
  connection,
  isSelected,
  onSelect,
  onUpdate: _onUpdate,
  onRemove
}: {
  connection: EditableConnectionPoint;
  isSelected: boolean;
  onSelect: () => void;
  onUpdate: (updates: Partial<ConnectionPoint>) => void;
  onRemove: () => void;
}) {
  const getTypeColor = (type: ConnectionType) => {
    switch (type) {
      case 'male': return 'text-blue-400';
      case 'female': return 'text-pink-400';
      case 'neutral': return 'text-yellow-400';
    }
  };

  return (
    <div 
      className={`p-3 rounded border cursor-pointer transition-colors ${
        isSelected 
          ? 'border-green-500 bg-green-900/30' 
          : 'border-gray-600 bg-gray-700 hover:bg-gray-600'
      }`}
      onClick={onSelect}
    >
      <div className="flex justify-between items-start">
        <div>
          <div className={`font-medium ${getTypeColor(connection.type)}`}>
            {connection.type.toUpperCase()}
          </div>
          <div className="text-sm text-gray-400">
            Axis: {connection.axis.toUpperCase()}
          </div>
          <div className="text-xs text-gray-500">
            Strength: {connection.strength.toFixed(1)}
          </div>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="text-red-400 hover:text-red-300 text-sm"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

// 3D Brick Model Component using Octa2.glb
function BrickModel({ 
  connections, 
  showHelpers,
  selectedConnection,
  onConnectionSelect,
  onConnectionUpdate,
  isDragging,
  setIsDragging
}: { 
  connections: EditableConnectionPoint[]; 
  showHelpers: boolean;
  selectedConnection: string | null;
  onConnectionSelect: (id: string | null) => void;
  onConnectionUpdate: (connectionId: string, updates: Partial<ConnectionPoint>) => void;
  isDragging: boolean;
  setIsDragging: (dragging: boolean) => void;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const [loadingError, setLoadingError] = useState<string | null>(null);
  
  // Load the same GLTF model used in creator mode
  const gltf = useGLTF('/Octa2.glb');
  
  // Validate GLTF loading
  useEffect(() => {
    if (!gltf) {
      setLoadingError('GLTF not loaded');
    } else if (!gltf.scene) {
      setLoadingError('GLTF scene not available');
    } else {
      setLoadingError(null);
    }
  }, [gltf]);

  // Create materials for the brick
  const brickMaterial = new THREE.MeshStandardMaterial({
    color: '#8B4513', // Brown brick color
    roughness: 0.7,
    metalness: 0.2
  });

  return (
    <group ref={groupRef}>
      {/* Main Brick from GLTF */}
      {!loadingError && gltf?.scene ? (
        <primitive 
          object={gltf.scene.clone()} 
          scale={[1, 1, 1]}
          position={[0, 0, 0]}
        />
      ) : (
        // Fallback to basic box if GLTF fails to load
        <>
          <Box args={[0.4, 0.2, 0.2]} position={[0, 0, 0]}>
            <primitive object={brickMaterial} />
          </Box>
          {loadingError && (
            <mesh position={[0, 0.3, 0]}>
              <planeGeometry args={[1, 0.2]} />
              <meshBasicMaterial color="red" opacity={0.7} transparent />
            </mesh>
          )}
        </>
      )}

      {/* Connection Points */}
      {connections.map(conn => (
        <InteractiveConnectionPoint
          key={conn.id}
          connection={conn}
          showHelpers={showHelpers}
          isSelected={selectedConnection === conn.id}
          onSelect={() => onConnectionSelect(conn.id)}
          onUpdate={(updates) => onConnectionUpdate(conn.id, updates)}
          isDragging={isDragging}
          setIsDragging={setIsDragging}
        />
      ))}
    </group>
  );
}

// Interactive Connection Point with Transform Controls
function InteractiveConnectionPoint({
  connection,
  showHelpers,
  isSelected,
  onSelect,
  onUpdate,
  isDragging: _isDragging,
  setIsDragging
}: {
  connection: EditableConnectionPoint;
  showHelpers: boolean;
  isSelected: boolean;
  onSelect: () => void;
  onUpdate: (updates: Partial<ConnectionPoint>) => void;
  isDragging: boolean;
  setIsDragging: (dragging: boolean) => void;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  // const { scene, camera } = useThree(); // Unused for now
  
  const getConnectionColor = (type: ConnectionType) => {
    switch (type) {
      case 'male': return '#3b82f6'; // Blue
      case 'female': return '#ec4899'; // Pink
      case 'neutral': return '#eab308'; // Yellow
    }
  };

  const position = connection.temporaryPosition || connection.localPosition;

  // Handle position updates from transform controls
  const handleTransform = () => {
    if (meshRef.current) {
      const newPosition = meshRef.current.position.clone();
      
      // Constrain position to reasonable bounds around the brick
      const maxDistance = 0.3; // Max distance from brick center
      newPosition.x = Math.max(-maxDistance, Math.min(maxDistance, newPosition.x));
      newPosition.y = Math.max(-maxDistance, Math.min(maxDistance, newPosition.y));
      newPosition.z = Math.max(-maxDistance, Math.min(maxDistance, newPosition.z));
      
      // Update the mesh position to constrained position
      meshRef.current.position.copy(newPosition);
      
      onUpdate({ localPosition: newPosition });
    }
  };

  return (
    <group position={[position.x, position.y, position.z]}>
      {/* Connection Point Sphere */}
      <Sphere 
        ref={meshRef}
        args={[isSelected ? 0.03 : 0.02]} 
        onClick={(e) => {
          e.stopPropagation();
          onSelect();
        }}
      >
        <meshStandardMaterial 
          color={getConnectionColor(connection.type)}
          emissive={isSelected ? '#ffffff' : getConnectionColor(connection.type)}
          emissiveIntensity={isSelected ? 0.5 : 0.3}
          transparent
          opacity={isSelected ? 1.0 : 0.8}
        />
      </Sphere>

      {/* Transform Controls for Selected Connection */}
      {isSelected && meshRef.current && (
        <TransformControls
          object={meshRef.current}
          mode="translate"
          size={0.8}
          onMouseDown={() => setIsDragging(true)}
          onMouseUp={() => setIsDragging(false)}
          onChange={handleTransform}
        />
      )}

      {/* Axis Direction Helper */}
      {showHelpers && (
        <group>
          {/* Direction line */}
          <Line
            points={[
              [0, 0, 0],
              connection.axis === 'x' ? [0.1, 0, 0] :
              connection.axis === 'y' ? [0, 0.1, 0] :
              [0, 0, 0.1]
            ]}
            color={getConnectionColor(connection.type)}
            lineWidth={isSelected ? 3 : 2}
          />
          
          {/* Type indicator */}
          <mesh position={[0, 0.05, 0]}>
            <boxGeometry args={[0.01, 0.01, 0.01]} />
            <meshBasicMaterial color={getConnectionColor(connection.type)} />
          </mesh>
          
          {/* Selection indicator */}
          {isSelected && (
            <Sphere args={[0.04]} position={[0, 0, 0]}>
              <meshBasicMaterial 
                color="#ffffff" 
                transparent 
                opacity={0.2} 
                wireframe 
              />
            </Sphere>
          )}
        </group>
      )}
    </group>
  );
}

// Selected Connection Details Panel
function SelectedConnectionPanel({
  connection,
  onUpdate
}: {
  connection: EditableConnectionPoint;
  onUpdate: (updates: Partial<ConnectionPoint>) => void;
}) {
  // Defensive check to prevent undefined errors
  if (!connection || !connection.type || !connection.localPosition) {
    return null;
  }
  return (
    <div className="absolute top-4 right-4 bg-gray-800 border border-gray-600 rounded-lg p-4 w-64">
      <h4 className="text-green-400 font-semibold mb-3">Connection Details</h4>
      
      {/* Connection Type */}
      <div className="mb-3">
        <label className="block text-sm text-gray-300 mb-1">Type</label>
        <select
          value={connection.type}
          onChange={(e) => onUpdate({ type: e.target.value as ConnectionType })}
          className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1"
        >
          <option value="male">Male</option>
          <option value="female">Female</option>
          <option value="neutral">Neutral</option>
        </select>
      </div>

      {/* Connection Axis */}
      <div className="mb-3">
        <label className="block text-sm text-gray-300 mb-1">Axis</label>
        <select
          value={connection.axis}
          onChange={(e) => onUpdate({ axis: e.target.value as ConnectionAxis })}
          className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1"
        >
          <option value="x">X-Axis</option>
          <option value="y">Y-Axis</option>
          <option value="z">Z-Axis</option>
        </select>
      </div>

      {/* Position Controls */}
      <div className="mb-3">
        <label className="block text-sm text-gray-300 mb-1">Position</label>
        <div className="grid grid-cols-3 gap-1">
          {['x', 'y', 'z'].map(axis => (
            <div key={axis} className="flex flex-col">
              <label className="text-xs text-gray-400">{axis.toUpperCase()}</label>
              <input
                type="number"
                step="0.01"
                min="-0.3"
                max="0.3"
                value={connection.localPosition[axis as 'x' | 'y' | 'z'].toFixed(3)}
                onChange={(e) => {
                  const newPos = connection.localPosition.clone();
                  const value = Math.max(-0.3, Math.min(0.3, parseFloat(e.target.value) || 0));
                  newPos[axis as 'x' | 'y' | 'z'] = value;
                  onUpdate({ localPosition: newPos });
                }}
                className="bg-gray-700 border border-gray-600 rounded px-1 py-1 text-xs"
              />
            </div>
          ))}
        </div>
        <div className="text-xs text-gray-500 mt-1">
          Position relative to brick center (-0.3 to 0.3)
        </div>
      </div>

      {/* Strength */}
      <div className="mb-3">
        <label className="block text-sm text-gray-300 mb-1">
          Strength: {connection.strength.toFixed(1)}
        </label>
        <input
          type="range"
          min="0"
          max="1"
          step="0.1"
          value={connection.strength}
          onChange={(e) => onUpdate({ strength: parseFloat(e.target.value) })}
          className="w-full"
        />
      </div>
    </div>
  );
}