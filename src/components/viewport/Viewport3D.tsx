import { useRef, useEffect, useState, useMemo } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Grid, GizmoHelper, GizmoViewport, useGLTF } from '@react-three/drei';
import * as THREE from 'three';

interface Viewport3DProps {
  onSelectionChange?: (selectedObjects: string[]) => void;
  gridVisible?: boolean;
  snapEnabled?: boolean;
  viewMode?: 'wireframe' | 'solid' | 'textured';
}

// Safe Octa2 Brick Component with proper error handling
function OctaBrick({ 
  position, 
  selected = false, 
  onClick,
  id 
}: { 
  position: [number, number, number]; 
  selected?: boolean;
  onClick?: () => void;
  id: string;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const [error, setError] = useState<string | null>(null);
  
  // Safely load GLTF with error handling
  const gltf = useMemo(() => {
    try {
      return useGLTF('/Octa2.glb');
    } catch (err) {
      console.error('Failed to load GLTF:', err);
      setError('Failed to load model');
      return null;
    }
  }, []);

  // Create materials safely
  const materials = useMemo(() => {
    const defaultMaterial = new THREE.MeshStandardMaterial({
      color: selected ? '#00ff88' : '#8B4513',
      emissive: selected ? '#003322' : '#000000',
      emissiveIntensity: selected ? 0.3 : 0,
      roughness: 0.7,
      metalness: 0.2
    });

    const outlineMaterial = new THREE.MeshBasicMaterial({
      color: '#00ff88',
      transparent: true,
      opacity: 0.2,
      wireframe: true
    });

    return { defaultMaterial, outlineMaterial };
  }, [selected]);

  // No rotation animation - keep bricks stable when selected

  // Cleanup materials on unmount
  useEffect(() => {
    return () => {
      materials.defaultMaterial?.dispose();
      materials.outlineMaterial?.dispose();
    };
  }, [materials]);

  // Fallback if GLTF fails to load
  if (error || !gltf?.scene) {
    return (
      <mesh 
        ref={groupRef}
        position={position} 
        scale={[0.2, 0.2, 0.2]}
        onClick={(e) => {
          e.stopPropagation();
          onClick?.();
        }}
      >
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial {...materials.defaultMaterial} />
        {selected && (
          <mesh scale={[1.1, 1.1, 1.1]}>
            <boxGeometry args={[1, 1, 1]} />
            <primitive object={materials.outlineMaterial} />
          </mesh>
        )}
      </mesh>
    );
  }

  // Clone scene safely and apply materials
  const clonedScene = useMemo(() => {
    if (!gltf?.scene) return null;
    
    try {
      const clone = gltf.scene.clone();
      
      // Safely traverse and apply materials
      clone.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          // Create a new material based on the original
          if (child.material) {
            child.material = materials.defaultMaterial.clone();
          } else {
            child.material = materials.defaultMaterial;
          }
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });
      
      return clone;
    } catch (err) {
      console.error('Failed to clone scene:', err);
      return null;
    }
  }, [gltf?.scene, materials.defaultMaterial]);

  return (
    <group 
      ref={groupRef}
      position={position} 
      scale={[0.2, 0.2, 0.2]}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
    >
      {clonedScene && <primitive object={clonedScene} />}
      
      {/* Selection outline - only if selected */}
      {selected && (
        <mesh scale={[1.1, 1.1, 1.1]} position={[0, 0, 0]}>
          <boxGeometry args={[1, 1, 1]} />
          <primitive object={materials.outlineMaterial} />
        </mesh>
      )}
    </group>
  );
}

// Error Boundary Component for 3D Scene
function SceneErrorBoundary({ children }: { children: React.ReactNode }) {
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      if (event.message.includes('three') || event.message.includes('fiber')) {
        setHasError(true);
        console.error('3D Scene Error:', event.error);
      }
    };

    window.addEventListener('error', handleError);
    return () => window.removeEventListener('error', handleError);
  }, []);

  if (hasError) {
    return (
      <mesh>
        <boxGeometry args={[2, 1, 0.1]} />
        <meshBasicMaterial color="#ff4444" />
      </mesh>
    );
  }

  return <>{children}</>;
}

// Scene content component with error handling
function SceneContent({ 
  onSelectionChange, 
  gridVisible, 
  viewMode 
}: {
  onSelectionChange?: (selectedObjects: string[]) => void;
  gridVisible?: boolean;
  viewMode?: string;
}) {
  const [selectedBrick, setSelectedBrick] = useState<number | null>(null);
  const { scene } = useThree();

  const handleBrickClick = (index: number) => {
    const newSelection = selectedBrick === index ? null : index;
    setSelectedBrick(newSelection);
    onSelectionChange?.(newSelection !== null ? [`brick-${index}`] : []);
  };

  const handleBackgroundClick = () => {
    setSelectedBrick(null);
    onSelectionChange?.([]);
  };

  // Demo bricks in a sustainable shelter foundation pattern
  const bricks = useMemo(() => [
    // Foundation layer
    { pos: [0, 0, 0] as [number, number, number], id: 'foundation-1' },
    { pos: [1, 0, 0] as [number, number, number], id: 'foundation-2' },
    { pos: [2, 0, 0] as [number, number, number], id: 'foundation-3' },
    { pos: [-1, 0, 0] as [number, number, number], id: 'foundation-4' },
    { pos: [-2, 0, 0] as [number, number, number], id: 'foundation-5' },
    
    // Second layer - offset pattern
    { pos: [0.5, 0.3, 0] as [number, number, number], id: 'wall-1' },
    { pos: [1.5, 0.3, 0] as [number, number, number], id: 'wall-2' },
    { pos: [-0.5, 0.3, 0] as [number, number, number], id: 'wall-3' },
    { pos: [-1.5, 0.3, 0] as [number, number, number], id: 'wall-4' },
    
    // Third layer
    { pos: [0, 0.6, 0] as [number, number, number], id: 'wall-5' },
    { pos: [1, 0.6, 0] as [number, number, number], id: 'wall-6' },
    { pos: [-1, 0.6, 0] as [number, number, number], id: 'wall-7' },
    
    // Cap layer
    { pos: [0.5, 0.9, 0] as [number, number, number], id: 'cap-1' },
    { pos: [-0.5, 0.9, 0] as [number, number, number], id: 'cap-2' },
  ], []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Cleanup any remaining objects
      if (scene) {
        const objectsToRemove: THREE.Object3D[] = [];
        scene.traverse((child) => {
          if (child.userData.shouldCleanup) {
            objectsToRemove.push(child);
          }
        });
        
        objectsToRemove.forEach((obj) => {
          scene.remove(obj);
          if (obj instanceof THREE.Mesh) {
            obj.geometry?.dispose();
            if (Array.isArray(obj.material)) {
              obj.material.forEach(mat => mat?.dispose());
            } else {
              obj.material?.dispose();
            }
          }
        });
      }
    };
  }, [scene]);

  return (
    <SceneErrorBoundary>
      {/* Enhanced Lighting Setup */}
      <ambientLight intensity={0.3} />
      <directionalLight 
        position={[10, 10, 5]} 
        intensity={1.2} 
        castShadow 
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-near={0.5}
        shadow-camera-far={50}
        shadow-camera-left={-10}
        shadow-camera-right={10}
        shadow-camera-top={10}
        shadow-camera-bottom={-10}
      />
      <pointLight position={[-10, 5, -10]} intensity={0.4} color="#0099ff" />
      <pointLight position={[10, 5, 10]} intensity={0.4} color="#00ff88" />
      <spotLight 
        position={[0, 8, 0]} 
        intensity={1} 
        angle={0.6}
        penumbra={0.3}
        target-position={[0, 0, 0]}
        castShadow
      />

      {/* Enhanced Grid */}
      {gridVisible && (
        <Grid 
          args={[30, 30]} 
          cellSize={1} 
          cellThickness={0.6} 
          cellColor="#444" 
          sectionSize={5} 
          sectionThickness={1.2} 
          sectionColor="#666"
          fadeDistance={50}
          fadeStrength={1}
          followCamera={false}
          infiniteGrid={true}
        />
      )}

      {/* Interactive Background for deselection */}
      <mesh 
        position={[0, -0.5, 0]} 
        rotation={[-Math.PI / 2, 0, 0]} 
        onClick={handleBackgroundClick}
        visible={false}
      >
        <planeGeometry args={[100, 100]} />
        <meshBasicMaterial transparent opacity={0} />
      </mesh>

      {/* Demo Octa2 bricks with error handling */}
      {bricks.map((brick, index) => (
        <OctaBrick
          key={brick.id}
          id={brick.id}
          position={brick.pos}
          selected={selectedBrick === index}
          onClick={() => handleBrickClick(index)}
        />
      ))}

      {/* Enhanced Ground plane */}
      <mesh 
        rotation={[-Math.PI / 2, 0, 0]} 
        position={[0, -0.15, 0]} 
        receiveShadow
      >
        <planeGeometry args={[40, 40]} />
        <meshStandardMaterial 
          color="#1a1a2e" 
          roughness={0.8}
          metalness={0.1}
        />
      </mesh>

      {/* Construction site markers */}
      <mesh position={[-5, 0.1, -5]}>
        <cylinderGeometry args={[0.05, 0.05, 1]} />
        <meshStandardMaterial color="#ff6b00" emissive="#ff6b00" emissiveIntensity={0.2} />
      </mesh>
      <mesh position={[5, 0.1, -5]}>
        <cylinderGeometry args={[0.05, 0.05, 1]} />
        <meshStandardMaterial color="#ff6b00" emissive="#ff6b00" emissiveIntensity={0.2} />
      </mesh>
      <mesh position={[-5, 0.1, 5]}>
        <cylinderGeometry args={[0.05, 0.05, 1]} />
        <meshStandardMaterial color="#ff6b00" emissive="#ff6b00" emissiveIntensity={0.2} />
      </mesh>
      <mesh position={[5, 0.1, 5]}>
        <cylinderGeometry args={[0.05, 0.05, 1]} />
        <meshStandardMaterial color="#ff6b00" emissive="#ff6b00" emissiveIntensity={0.2} />
      </mesh>
    </SceneErrorBoundary>
  );
}

export default function Viewport3D({ 
  onSelectionChange, 
  gridVisible = true, 
  snapEnabled = true,
  viewMode = 'solid' 
}: Viewport3DProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [sceneError, setSceneError] = useState<string | null>(null);

  // Global error handler for the viewport
  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      if (event.message.includes('three') || event.message.includes('fiber')) {
        setSceneError(event.message);
        console.error('Viewport Error:', event.error);
      }
    };

    window.addEventListener('error', handleError);
    return () => window.removeEventListener('error', handleError);
  }, []);

  if (sceneError) {
    return (
      <div style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(to bottom, #0a0a0a, #1a1a2e)',
        color: 'white',
        flexDirection: 'column',
        gap: '1rem'
      }}>
        <div style={{ fontSize: '2rem' }}>⚠️</div>
        <div>3D Viewport Error</div>
        <div style={{ fontSize: '0.875rem', opacity: 0.7 }}>
          Scene failed to load. Please refresh the page.
        </div>
        <button 
          onClick={() => {
            setSceneError(null);
            window.location.reload();
          }}
          style={{
            padding: '0.5rem 1rem',
            background: '#00ff88',
            color: '#000',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          Reload
        </button>
      </div>
    );
  }

  return (
    <div 
      ref={mountRef}
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
        overflow: 'hidden',
        background: 'linear-gradient(to bottom, #0a0a0a, #1a1a2e)'
      }}
    >
      <Canvas
        camera={{ 
          position: [8, 6, 8], 
          fov: 60,
          near: 0.1,
          far: 1000
        }}
        shadows
        style={{ 
          width: '100%', 
          height: '100%',
          background: 'transparent'
        }}
        dpr={[1, 2]}
        onError={(error) => {
          console.error('Canvas Error:', error);
          setSceneError('3D Canvas initialization failed');
        }}
      >
        {/* Scene Content with Error Boundary */}
        <SceneContent 
          onSelectionChange={onSelectionChange}
          gridVisible={gridVisible}
          viewMode={viewMode}
        />

        {/* Enhanced Controls */}
        <OrbitControls
          enablePan={true}
          enableZoom={true}
          enableRotate={true}
          minDistance={3}
          maxDistance={50}
          target={[0, 0.5, 0]}
          minPolarAngle={0}
          maxPolarAngle={Math.PI / 2.2}
          dampingFactor={0.05}
          enableDamping={true}
        />

        {/* Professional Gizmo Helper */}
        <GizmoHelper
          alignment="bottom-right"
          margin={[100, 100]}
        >
          <GizmoViewport 
            axisColors={['#ff6b6b', '#4ecdc4', '#45b7d1']} 
            labelColor="white"
            axisHeadScale={1.2}
          />
        </GizmoHelper>
      </Canvas>

      {/* Enhanced Viewport Overlay UI */}
      <div style={{
        position: 'absolute',
        top: '1rem',
        left: '1rem',
        background: 'rgba(0, 0, 0, 0.7)',
        backdropFilter: 'blur(10px)',
        borderRadius: '8px',
        padding: '0.75rem',
        color: 'white',
        fontSize: '0.875rem',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        zIndex: 10
      }}>
        <div style={{ marginBottom: '0.5rem', color: '#00ff88', fontWeight: '600' }}>
          Viewport Controls
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.75rem' }}>
          <div>View: Perspective</div>
          <div>Mode: {viewMode}</div>
          <div>Grid: {gridVisible ? '✓ On' : '✗ Off'}</div>
          <div>Snap: {snapEnabled ? '✓ On' : '✗ Off'}</div>
        </div>
      </div>

      {/* Performance & Scene Info */}
      <div style={{
        position: 'absolute',
        top: '1rem',
        right: '1rem',
        background: 'rgba(0, 0, 0, 0.7)',
        backdropFilter: 'blur(10px)',
        borderRadius: '8px',
        padding: '0.75rem',
        color: 'white',
        fontSize: '0.75rem',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        zIndex: 10
      }}>
        <div style={{ marginBottom: '0.5rem', color: '#0099ff', fontWeight: '600' }}>
          Performance
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          <div>FPS: 60</div>
          <div>Objects: 14</div>
          <div>Bricks: 14</div>
          <div>Tris: 12.8K</div>
        </div>
      </div>

      {/* Construction Progress Info */}
      <div style={{
        position: 'absolute',
        bottom: '1rem',
        left: '1rem',
        background: 'rgba(0, 0, 0, 0.7)',
        backdropFilter: 'blur(10px)',
        borderRadius: '8px',
        padding: '0.75rem',
        color: 'white',
        fontSize: '0.875rem',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        zIndex: 10
      }}>
        <div style={{ marginBottom: '0.5rem', color: '#00ff88', fontWeight: '600' }}>
          Climate Refuge Demo
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.75rem' }}>
          <div>Material: Sustainable Octa-Brick</div>
          <div>Progress: Foundation + Walls</div>
          <div>Efficiency: 98% • Sustainable: ✓</div>
          <div style={{ color: '#00ff88' }}>Click bricks to select</div>
        </div>
      </div>

      {/* Camera Controls Help */}
      <div style={{
        position: 'absolute',
        bottom: '1rem',
        right: '1rem',
        background: 'rgba(0, 0, 0, 0.7)',
        backdropFilter: 'blur(10px)',
        borderRadius: '8px',
        padding: '0.75rem',
        color: 'white',
        fontSize: '0.75rem',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        zIndex: 10
      }}>
        <div style={{ marginBottom: '0.5rem', color: '#0099ff', fontWeight: '600' }}>
          Controls
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          <div>🖱️ Left: Rotate</div>
          <div>🖱️ Right: Pan</div>
          <div>🎯 Wheel: Zoom</div>
          <div>🎯 Click: Select</div>
        </div>
      </div>
    </div>
  );
}

// Preload the GLTF model for better performance
try {
  useGLTF.preload('/Octa2.glb');
} catch (error) {
  console.warn('Failed to preload GLTF model:', error);
} 