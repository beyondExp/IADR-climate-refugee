import { useState, useEffect, useRef } from 'react'
import { Zap, Globe, Monitor, Smartphone, Headset, Eye } from 'lucide-react'
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Sphere, MeshDistortMaterial, useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Hammer, 
  Building2, 
  Cpu,
  Settings
} from 'lucide-react';


interface LandingPageProps {
  onModeSelect: (mode: 'creator' | 'visitor') => void;
}

// Student-Designed Brick Component
function StudentBrick({ scale = [2, 2, 2] as [number, number, number], position = [0, 0, 0] as [number, number, number] }) {
  const { scene } = useGLTF('/Octa2.glb');
  const meshRef = useRef<THREE.Group>(null);
  
  useFrame((state) => {
    if (meshRef.current) {
      // Only rotation animation, no position changes
      meshRef.current.rotation.y = state.clock.elapsedTime * 0.4;
      meshRef.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.2) * 0.1;
    }
  });

  return (
    <group ref={meshRef} scale={scale} position={position}>
      <primitive object={scene.clone()} />
    </group>
  );
}

// Floating AR Elements Component
function FloatingElements() {
  const groupRef = useRef<THREE.Group>(null);
  
  useFrame((state) => {
    if (groupRef.current) {
      groupRef.current.rotation.y = state.clock.elapsedTime * 0.1;
      groupRef.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.2) * 0.1;
    }
  });

  return (
    <group ref={groupRef}>
      {/* Floating Construction Elements */}
      <mesh position={[2, 1, 0]}>
        <boxGeometry args={[0.3, 0.3, 0.3]} />
        <meshStandardMaterial color="#00ff88" transparent opacity={0.8} />
      </mesh>
      <mesh position={[-2, -1, 1]}>
        <cylinderGeometry args={[0.2, 0.2, 0.4]} />
        <meshStandardMaterial color="#0099ff" transparent opacity={0.8} />
      </mesh>
      <mesh position={[0, 2, -1]}>
        <octahedronGeometry args={[0.25]} />
        <meshStandardMaterial color="#ff6b00" transparent opacity={0.8} />
      </mesh>
    </group>
  );
}

// Animated Background Sphere
function BackgroundSphere() {
  const meshRef = useRef<THREE.Mesh>(null);
  
  useFrame((state) => {
    if (meshRef.current) {
      meshRef.current.rotation.x = state.clock.elapsedTime * 0.05;
      meshRef.current.rotation.y = state.clock.elapsedTime * 0.03;
    }
  });

  return (
    <Sphere ref={meshRef} args={[2, 100, 200]} scale={2} position={[0, 0, -8]}>
      <MeshDistortMaterial
        color="#0a0a0a"
        transparent
        opacity={0.2}
        distort={0.3}
        speed={2}
        roughness={0.1}
      />
    </Sphere>
  );
}

export default function LandingPage({ onModeSelect }: LandingPageProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [currentFeature, setCurrentFeature] = useState(0);

  const features = [
    {
      icon: <Building2 className="w-8 h-8" />,
      title: "Smart Construction",
      description: "AI-powered building algorithms with climate analysis"
    },
    {
      icon: <Zap className="w-8 h-8" />,
      title: "Real-time Physics",
      description: "Advanced structural simulation and material properties"
    },
    {
      icon: <Globe className="w-8 h-8" />,
      title: "AR Integration",
      description: "Seamless WebXR experience across all devices"
    },
    {
      icon: <Cpu className="w-8 h-8" />,
      title: "Performance Optimized",
      description: "60fps rendering with industrial-grade precision"
    }
  ];

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentFeature((prev) => (prev + 1) % features.length);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  const handleModeSelect = (mode: 'creator' | 'visitor') => {
    setIsLoading(true);
    
    // Simulate loading delay for better UX
    setTimeout(() => {
      onModeSelect(mode);
      setIsLoading(false);
    }, 1000);
  };

  const modeCards = [
    {
      id: 'creator' as const,
      title: 'Student Creator',
      subtitle: 'Design sustainable shelters',
      icon: '🏗️',
      description: 'Create modular construction projects with AR anchor points for climate refugee housing solutions.',
      features: ['Design with sustainable materials', 'Create QR anchor points', 'Save and share projects'],
      gradient: 'from-emerald-400 to-cyan-400',
      glowColor: '#10b981'
    },
    {
      id: 'visitor' as const,
      title: 'AR Visitor',
      subtitle: 'Experience constructions in AR',
      icon: '🥽',
      description: 'Scan QR codes to visualize sustainable constructions in augmented reality.',
      features: ['Scan QR codes', 'View in 3D/AR', 'Explore construction details'],
      gradient: 'from-purple-400 to-pink-400',
      glowColor: '#a855f7'
    }
  ];

  return (
    <div className="landing-container">
      {/* 3D Background */}
      <div className="absolute inset-0 z-0 w-full h-full">
        <Canvas 
          camera={{ position: [0, 2, 6], fov: 75 }}
          style={{ width: '100%', height: '100%' }}
          dpr={[1, 2]}
        >
          <ambientLight intensity={0.5} />
          <directionalLight position={[10, 10, 10]} intensity={1} color="#ffffff" />
          <spotLight 
            position={[3, 5, 3]} 
            intensity={2} 
            color="#00ff88" 
            angle={0.4}
            penumbra={0.3}
            target-position={[0, 1, -2]}
          />
          <spotLight 
            position={[-3, 5, 3]} 
            intensity={1.5} 
            color="#0099ff" 
            angle={0.4}
            penumbra={0.3}
            target-position={[0, 1, -2]}
          />
          <pointLight position={[0, 3, 0]} intensity={1.2} color="#ffffff" />
          
          <StudentBrick scale={[2, 2, 2]} position={[0, 1, -2]} />
          <BackgroundSphere />
          <FloatingElements />
          
          <OrbitControls 
            enableZoom={false} 
            enablePan={false}
            autoRotate={false}
            target={[0, 1, 0]}
          />
        </Canvas>
      </div>

      {/* Main Content */}
      <div className="relative z-10 min-h-screen flex flex-col">
        
        {/* Header */}
        <header className="flex justify-between items-center p-8 backdrop-blur-sm">
          <motion.div 
            className="flex items-center space-x-3"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
          >
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-400 to-blue-600 flex items-center justify-center">
              <Building2 className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-2xl font-bold bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent">
              Climate Refuge AR
            </h1>
          </motion.div>

          <motion.div 
            className="flex space-x-2"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.4 }}
          >
            <button className="icon-button">
              <Settings className="w-5 h-5" />
            </button>
          </motion.div>
        </header>

        {/* Logo Section */}
        <section className="py-8 px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="text-center"
          >
            <div className="flex justify-center mb-8">
              <img 
                src="/general_header.svg" 
                alt="Climate Refuge AR Logo" 
                className="h-24 md:h-32 w-auto opacity-90 hover:opacity-100 transition-opacity duration-300"
                style={{
                  filter: 'drop-shadow(0 8px 16px rgba(0, 255, 136, 0.3))'
                }}
              />
            </div>
            
            <p className="text-gray-300 max-w-2xl mx-auto leading-relaxed">
              Watch the revolutionary octagonal brick floating behind this interface - designed by our students for maximum thermal efficiency and structural integrity. 
              This sustainable building block represents the future of climate-resilient construction.
            </p>
          </motion.div>
        </section>

        {/* Hero Section */}
        <main className="flex-1 flex items-center justify-center px-8 py-16">
          <div className="max-w-6xl mx-auto text-center">
            
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6 }}
              className="mb-12"
            >
              <h1 className="text-6xl md:text-8xl font-black mb-6 leading-tight">
                <span className="bg-gradient-to-r from-white via-cyan-200 to-blue-300 bg-clip-text text-transparent">
                  Build the
                </span>
                <br />
                <span className="bg-gradient-to-r from-cyan-400 via-blue-400 to-purple-400 bg-clip-text text-transparent">
                  Future
                </span>
              </h1>
              
              <p className="text-xl md:text-2xl text-gray-300 max-w-3xl mx-auto leading-relaxed">
                Revolutionary AR construction platform for sustainable climate refuge shelters.
                Experience immersive 3D building with cutting-edge WebXR technology.
              </p>
            </motion.div>

            {/* Mode Selection Cards */}
            <motion.div 
              className="grid md:grid-cols-2 gap-12 max-w-5xl mx-auto mb-16 px-4"
              initial={{ opacity: 0, y: 50 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.8 }}
            >
              
              {/* Creator Mode */}
              <motion.div
                className="mode-card"
                whileHover={{ scale: 1.02, y: -5 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => handleModeSelect('creator')}
              >
                <div className="mode-card-content">
                  <div className="mode-icon creator-mode">
                    <Hammer className="w-8 h-8" />
                  </div>
                  
                  <h3 className="text-2xl font-bold text-white mb-4">
                    Creator Studio
                  </h3>
                  
                  <p className="text-gray-300 mb-6 leading-relaxed">
                    Professional construction design environment with advanced 3D tools,
                    material libraries, and intelligent building algorithms.
                  </p>
                  
                  <div className="feature-list">
                    <div className="feature-item">
                      <div className="feature-dot" />
                      <span>Industry-Standard Editor</span>
                    </div>
                    <div className="feature-item">
                      <div className="feature-dot" />
                      <span>Smart Material System</span>
                    </div>
                    <div className="feature-item">
                      <div className="feature-dot" />
                      <span>Real-time Collaboration</span>
                    </div>
                    <div className="feature-item">
                      <div className="feature-dot" />
                      <span>Climate Analysis Engine</span>
                    </div>
                  </div>
                  
                  <button
                    className="mode-button creator-button"
                    onClick={() => handleModeSelect('creator')}
                    disabled={isLoading}
                    style={{
                      width: '100%',
                      padding: '1.25rem 2rem',
                      borderRadius: '1rem',
                      border: 'none',
                      background: `linear-gradient(135deg, ${modeCards[0].gradient.split(' ')[1]}, ${modeCards[0].gradient.split(' ')[3]})`,
                      color: 'white',
                      fontSize: '1.1rem',
                      fontWeight: '600',
                      cursor: isLoading ? 'not-allowed' : 'pointer',
                      transition: 'all 0.3s ease',
                      opacity: isLoading ? 0.7 : 1,
                      transform: isLoading ? 'scale(0.98)' : 'scale(1)'
                    }}
                    onMouseEnter={(e) => {
                      if (!isLoading) {
                        e.currentTarget.style.transform = 'scale(1.05)';
                        e.currentTarget.style.boxShadow = `0 20px 40px ${modeCards[0].glowColor}40`;
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isLoading) {
                        e.currentTarget.style.transform = 'scale(1)';
                        e.currentTarget.style.boxShadow = 'none';
                      }
                    }}
                  >
                    {isLoading ? '⏳ Loading...' : `🚀 Start ${modeCards[0].title}`}
                  </button>
                </div>
              </motion.div>

              {/* Viewer Mode */}
              <motion.div
                className="mode-card"
                whileHover={{ scale: 1.02, y: -5 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => handleModeSelect('visitor')}
              >
                <div className="mode-card-content">
                  <div className="mode-icon viewer-mode">
                    <Eye className="w-8 h-8" />
                  </div>
                  
                  <h3 className="text-2xl font-bold text-white mb-4">
                    AR Viewer
                  </h3>
                  
                  <p className="text-gray-300 mb-6 leading-relaxed">
                    Immersive augmented reality experience for exploring and
                    visualizing sustainable construction projects in 3D space.
                  </p>
                  
                  <div className="feature-list">
                    <div className="feature-item">
                      <div className="feature-dot" />
                      <span>WebXR Integration</span>
                    </div>
                    <div className="feature-item">
                      <div className="feature-dot" />
                      <span>QR Code Scanning</span>
                    </div>
                    <div className="feature-item">
                      <div className="feature-dot" />
                      <span>Real-time Physics</span>
                    </div>
                    <div className="feature-item">
                      <div className="feature-dot" />
                      <span>Cross-platform Support</span>
                    </div>
                  </div>
                  
                  <button
                    className="mode-button viewer-button"
                    onClick={() => handleModeSelect('visitor')}
                    disabled={isLoading}
                    style={{
                      width: '100%',
                      padding: '1.25rem 2rem',
                      borderRadius: '1rem',
                      border: 'none',
                      background: `linear-gradient(135deg, ${modeCards[1].gradient.split(' ')[1]}, ${modeCards[1].gradient.split(' ')[3]})`,
                      color: 'white',
                      fontSize: '1.1rem',
                      fontWeight: '600',
                      cursor: isLoading ? 'not-allowed' : 'pointer',
                      transition: 'all 0.3s ease',
                      opacity: isLoading ? 0.7 : 1,
                      transform: isLoading ? 'scale(0.98)' : 'scale(1)'
                    }}
                    onMouseEnter={(e) => {
                      if (!isLoading) {
                        e.currentTarget.style.transform = 'scale(1.05)';
                        e.currentTarget.style.boxShadow = `0 20px 40px ${modeCards[1].glowColor}40`;
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isLoading) {
                        e.currentTarget.style.transform = 'scale(1)';
                        e.currentTarget.style.boxShadow = 'none';
                      }
                    }}
                  >
                    {isLoading ? '⏳ Loading...' : `🚀 Start ${modeCards[1].title}`}
                  </button>
                </div>
              </motion.div>
            </motion.div>

            {/* Platform Support */}
            <motion.div
              className="flex justify-center items-center space-x-12 mb-16 px-4"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.2 }}
            >
              <div className="platform-item">
                <Monitor className="w-6 h-6 text-gray-400" />
                <span className="text-sm text-gray-400 ml-2">Desktop</span>
              </div>
              <div className="platform-item">
                <Smartphone className="w-6 h-6 text-gray-400" />
                <span className="text-sm text-gray-400 ml-2">Mobile</span>
              </div>
              <div className="platform-item">
                <Headset className="w-6 h-6 text-gray-400" />
                <span className="text-sm text-gray-400 ml-2">AR/VR</span>
              </div>
            </motion.div>

            {/* Rotating Features */}
            <motion.div
              className="feature-showcase max-w-3xl mx-auto"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.4 }}
            >
              <AnimatePresence mode="wait">
                <motion.div
                  key={currentFeature}
                  className="feature-highlight"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.5 }}
                >
                  <div className="feature-icon">
                    {features[currentFeature].icon}
                  </div>
                  <div className="feature-text">
                    <h4 className="text-lg font-semibold text-white mb-1">
                      {features[currentFeature].title}
                    </h4>
                    <p className="text-gray-400 text-sm">
                      {features[currentFeature].description}
                    </p>
                  </div>
                </motion.div>
              </AnimatePresence>
            </motion.div>
          </div>
        </main>

        {/* Footer */}
        <footer className="p-8 text-center backdrop-blur-sm">
          <p className="text-gray-500 text-sm">
            Powered by React • Three.js • WebXR • Sustainable Innovation
          </p>
        </footer>
      </div>

      {/* Loading Overlay */}
      <AnimatePresence>
        {isLoading && (
          <motion.div
            className="loading-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="loading-content">
              <div className="loading-spinner" />
              <p className="text-white text-lg font-medium mt-4">
                Initializing...
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Preload the student brick model for better performance
useGLTF.preload('/Octa2.glb'); 