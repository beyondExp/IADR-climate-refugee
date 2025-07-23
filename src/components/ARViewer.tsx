import { useEffect, useRef, useState, useCallback } from 'react';
import { useWebXR, useThreeScene, useARConstruction } from '../hooks/useWebXR';
import { useDatabaseStore } from '../stores/database';
import type { Project, BrickTypeKey } from '../types';
import { motion, AnimatePresence } from 'framer-motion';
import { Menu, ArrowLeft, Smartphone, Monitor, Search, X } from 'lucide-react';

interface ARViewerProps {
  onBack?: () => void;
  user?: any;
}

interface ProjectCardProps {
  project: any;
  onSelect: (project: any) => void;
  type: 'user' | 'public';
}

function ProjectCard({ project, onSelect, type }: ProjectCardProps) {
  const isUser = type === 'user';
  
  return (
    <motion.div
      className="group bg-gradient-to-br from-white/5 to-white/[0.02] hover:from-white/10 hover:to-white/5 border border-white/10 hover:border-white/20 rounded-xl p-5 cursor-pointer transition-all duration-300 backdrop-blur-sm"
      onClick={() => onSelect(project)}
      whileHover={{ scale: 1.02, y: -2 }}
      whileTap={{ scale: 0.98 }}
    >
      <div className="flex items-start gap-4 mb-4">
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-lg font-semibold ${
          isUser 
            ? 'bg-gradient-to-r from-blue-500/20 to-indigo-500/20 border border-blue-400/30 text-blue-300' 
            : 'bg-gradient-to-r from-emerald-500/20 to-green-500/20 border border-emerald-400/30 text-emerald-300'
        }`}>
          {isUser ? '👤' : '🌍'}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-white text-base truncate group-hover:text-blue-200 transition-colors">
            {project.name}
          </h3>
          <p className="text-xs text-gray-400 mt-1">
            {project.created_at ? new Date(project.created_at).toLocaleDateString() : 'No date'} 
            {isUser ? ' • Your project' : ' • Public'}
          </p>
        </div>
      </div>
      
      <p className="text-gray-300 text-sm mb-5 line-clamp-2 leading-relaxed">
        {project.description || 'No description available'}
      </p>
      
      <div className="flex items-center justify-between">
        <div className={`px-3 py-1 rounded-lg text-xs font-medium ${
          isUser 
            ? 'bg-blue-400/10 text-blue-300 border border-blue-400/20' 
            : 'bg-emerald-400/10 text-emerald-300 border border-emerald-400/20'
        }`}>
          {isUser ? 'Personal' : 'Community'}
        </div>
        <button className="px-5 py-2.5 bg-gradient-to-r from-blue-600 via-blue-500 to-indigo-600 hover:from-blue-700 hover:via-blue-600 hover:to-indigo-700 rounded-lg text-sm text-white font-semibold transform group-hover:scale-105 transition-all duration-200 shadow-lg shadow-blue-500/20">
          Launch AR
        </button>
      </div>
    </motion.div>
  );
}

export default function ARViewer({ onBack, user }: ARViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [showDrawer, setShowDrawer] = useState(false);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [isLoadingProject, setIsLoadingProject] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [arProjects, setArProjects] = useState<{
    userProjects: any[],
    publicProjects: any[],
    totalCount: number
  }>({ userProjects: [], publicProjects: [], totalCount: 0 });
  const [isLoadingArProjects, setIsLoadingArProjects] = useState(false);
  
  // Mobile debugging state
  const [debugInfo, setDebugInfo] = useState<string[]>([]);
  const [showDebug, setShowDebug] = useState(true);
  const [initError, setInitError] = useState<string | null>(null);
  
  // Ref to track demo creation state to prevent infinite loops
  const demoCreatedRef = useRef(false);
  const isCreatingDemoRef = useRef(false);

  const { loadProjectsForAR } = useDatabaseStore();

  const {
    xrState,
    error: xrError,
    startXRSession,
    endXRSession,
    clearError
  } = useWebXR();

  // Mobile debug logging function
  const addDebugLog = useCallback((message: string) => {
    console.log(message);
    setDebugInfo(prev => {
      const newLogs = [...prev, `${new Date().toLocaleTimeString()}: ${message}`];
      return newLogs.slice(-10); // Keep only last 10 logs
    });
  }, []);

  // Component mount and device check
  useEffect(() => {
    addDebugLog('🚀 ARViewer component mounted');
    
    const isMobile = /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    const hasWebGL = (() => {
      try {
        const canvas = document.createElement('canvas');
        return !!(canvas.getContext('webgl') || canvas.getContext('experimental-webgl'));
      } catch (e) {
        return false;
      }
    })();

    addDebugLog(`📱 Device: ${isMobile ? 'Mobile' : 'Desktop'}`);
    addDebugLog(`🎨 WebGL: ${hasWebGL ? 'Supported' : 'Not supported'}`);
    addDebugLog(`🌐 UserAgent: ${navigator.userAgent.substring(0, 50)}...`);
    addDebugLog(`📏 Screen: ${window.innerWidth}x${window.innerHeight}`);
    
    if (!hasWebGL) {
      setInitError('WebGL not supported on this device');
    }
  }, [addDebugLog]);

  // Add debugging for WebXR support
  useEffect(() => {
    addDebugLog(`🔍 WebXR Support: ${xrState.isSupported ? 'Yes' : 'No'}`);
    addDebugLog(`🔍 WebXR Active: ${xrState.isActive ? 'Yes' : 'No'}`);
    addDebugLog(`🔍 Has Navigator.xr: ${!!navigator.xr ? 'Yes' : 'No'}`);
  }, [xrState, addDebugLog]);

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
    clearAnchors
  } = useARConstruction();

  const selectedBrickType: BrickTypeKey = 'clay-sustainable';

  // Define createSimpleDemo before the useEffects that use it
  const createSimpleDemo = useCallback(async () => {
    addDebugLog('🎯 createSimpleDemo called');
    
    if (!sceneState.scene) {
      addDebugLog('❌ No scene available for demo');
      return;
    }
    
    if (demoCreatedRef.current) {
      addDebugLog('⚠️ Demo already created');
      return;
    }
    
    if (isCreatingDemoRef.current) {
      addDebugLog('⚠️ Demo creation already in progress');
      return;
    }

    addDebugLog('🚀 Starting demo creation process...');
    isCreatingDemoRef.current = true;
    
    try {
      addDebugLog('📦 Scene objects check:');
      addDebugLog(`  - Scene: ${!!sceneState.scene}`);
      addDebugLog(`  - Camera: ${!!sceneState.camera}`);
      addDebugLog(`  - Renderer: ${!!sceneState.renderer}`);
      addDebugLog(`  - Group: ${!!sceneState.group}`);
      
      let brickCount = 0;
      // Create a simple 3x3 foundation demo
      for (let x = -1; x <= 1; x++) {
        for (let z = -1; z <= 1; z++) {
          brickCount++;
          addDebugLog(`🧱 Creating brick ${brickCount}/9 at (${x}, 0, ${z})`);
          
          try {
            const brick = addBrick(selectedBrickType, {
              x: x * 0.6,
              y: 0,
              z: z * 0.6
            });
            
            if (brick) {
              addDebugLog(`✅ Brick ${brickCount} created successfully`);
            } else {
              addDebugLog(`❌ Brick ${brickCount} creation failed`);
            }
          } catch (brickError) {
            addDebugLog(`❌ Error creating brick ${brickCount}: ${brickError}`);
          }
          
          await new Promise(resolve => setTimeout(resolve, 50)); // Fast demo creation
        }
      }
      
      addDebugLog(`🎉 Demo creation completed! Total bricks: ${brickCount}`);
      addDebugLog(`📊 Final brick count in state: ${bricks.length}`);
      demoCreatedRef.current = true;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      addDebugLog(`❌ Demo creation failed: ${errorMsg}`);
      console.error('Error creating demo:', error);
    } finally {
      isCreatingDemoRef.current = false;
      addDebugLog('🏁 Demo creation process finished');
    }
  }, [sceneState.scene, sceneState.camera, sceneState.renderer, sceneState.group, addBrick, selectedBrickType, addDebugLog, bricks.length]);

  // Load AR projects when drawer is opened
  const loadArProjects = useCallback(async () => {
    if (!user || isLoadingArProjects) return;
    
    console.log('🔍 ARViewer: Loading AR projects for drawer...');
    setIsLoadingArProjects(true);
    
    try {
      const result = await loadProjectsForAR(user.id);
      setArProjects(result);
      console.log('✅ ARViewer: AR projects loaded successfully:', result);
    } catch (error) {
      console.error('❌ ARViewer: Failed to load AR projects:', error);
    } finally {
      setIsLoadingArProjects(false);
    }
  }, [user, isLoadingArProjects, loadProjectsForAR]);

  // Load projects when drawer opens
  useEffect(() => {
    if (showDrawer && user && arProjects.totalCount === 0) {
      loadArProjects();
    }
  }, [showDrawer, user, arProjects.totalCount, loadArProjects]);

  // Initialize scene when container is available
  useEffect(() => {
    if (containerRef.current && !sceneState.isInitialized) {
      try {
        addDebugLog('🎬 Starting scene initialization...');
        addDebugLog(`📦 Container size: ${containerRef.current.clientWidth}x${containerRef.current.clientHeight}`);
        addDebugLog(`📱 Window size: ${window.innerWidth}x${window.innerHeight}`);
        addDebugLog(`🎯 Container element exists: ${!!containerRef.current}`);
        
        addDebugLog('🔄 Calling initializeScene...');
        const sceneResult = initializeScene(containerRef.current);
        addDebugLog(`🔍 InitializeScene result: ${!!sceneResult}`);
        
        // Wait a bit and check if scene was actually created
        setTimeout(() => {
          addDebugLog('🔍 Post-init scene check:');
          addDebugLog(`  - Scene: ${!!sceneState.scene}`);
          addDebugLog(`  - Camera: ${!!sceneState.camera}`);
          addDebugLog(`  - Renderer: ${!!sceneState.renderer}`);
          addDebugLog(`  - IsInitialized: ${sceneState.isInitialized}`);
          
          if (sceneState.renderer) {
            addDebugLog(`📺 Renderer canvas: ${!!sceneState.renderer.domElement}`);
            addDebugLog(`📺 Canvas parent: ${!!sceneState.renderer.domElement.parentNode}`);
          }
        }, 100);
        
        addDebugLog('✅ Scene initialization completed');
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        addDebugLog(`❌ Scene initialization failed: ${errorMsg}`);
        setInitError(`Scene initialization failed: ${errorMsg}`);
        console.error('Failed to initialize AR scene:', error);
      }
    } else if (!containerRef.current) {
      addDebugLog('⚠️ No container ref available');
    } else if (sceneState.isInitialized) {
      addDebugLog('⚠️ Scene already initialized');
    }
  }, [containerRef.current, sceneState.isInitialized, sceneState.scene, sceneState.camera, sceneState.renderer, initializeScene, addDebugLog]);

  // Track scene state changes for debugging
  useEffect(() => {
    addDebugLog(`🎬 Scene State: init=${sceneState.isInitialized}, anim=${isAnimating}`);
    addDebugLog(`📦 Scene Objects: renderer=${!!sceneState.renderer}, camera=${!!sceneState.camera}, scene=${!!sceneState.scene}`);
  }, [sceneState.isInitialized, sceneState.renderer, sceneState.camera, sceneState.scene, isAnimating, addDebugLog]);

  // Periodic status updates every 5 seconds
  useEffect(() => {
    const statusInterval = setInterval(() => {
      addDebugLog(`📊 Status update: init=${sceneState.isInitialized}, anim=${isAnimating}, bricks=${bricks.length}, creating=${isCreatingDemoRef.current}`);
    }, 5000);
    
    return () => clearInterval(statusInterval);
  }, [sceneState.isInitialized, isAnimating, bricks.length, addDebugLog]);

  // Auto-start 3D preview when scene is ready
  useEffect(() => {
    addDebugLog(`🎬 Animation check: init=${sceneState.isInitialized}, animating=${isAnimating}`);
    
    if (sceneState.isInitialized && !isAnimating) {
      addDebugLog('▶️ Starting animation...');
      try {
        startAnimation();
        addDebugLog('✅ Animation started successfully');
      } catch (error) {
        addDebugLog(`❌ Animation start failed: ${error}`);
      }
    } else if (!sceneState.isInitialized) {
      addDebugLog('⚠️ Scene not initialized yet');
    } else if (isAnimating) {
      addDebugLog('⚠️ Animation already running');
    }
  }, [sceneState.isInitialized, isAnimating, startAnimation, addDebugLog]);

  // Create demo immediately when scene is ready and animation starts
  useEffect(() => {
    addDebugLog(`🎯 Demo trigger check: init=${sceneState.isInitialized}, anim=${isAnimating}, bricks=${bricks.length}, created=${demoCreatedRef.current}, creating=${isCreatingDemoRef.current}`);
    
    if (sceneState.isInitialized && isAnimating && bricks.length === 0 && !demoCreatedRef.current) {
      addDebugLog('🎯 Scene ready - creating demo immediately...');
      if (!isCreatingDemoRef.current) {
        addDebugLog('🏗️ Triggering demo creation...');
        createSimpleDemo().then(() => {
          addDebugLog('🎉 Demo creation promise resolved');
        }).catch((error) => {
          addDebugLog(`❌ Demo creation promise rejected: ${error}`);
        });
      } else {
        addDebugLog('⚠️ Demo creation already in progress, skipping');
      }
    } else {
      if (!sceneState.isInitialized) addDebugLog('⚠️ Scene not initialized');
      if (!isAnimating) addDebugLog('⚠️ Animation not running');
      if (bricks.length > 0) addDebugLog(`⚠️ Bricks already exist: ${bricks.length}`);
      if (demoCreatedRef.current) addDebugLog('⚠️ Demo already created');
    }
  }, [sceneState.isInitialized, isAnimating, bricks.length, addDebugLog, createSimpleDemo]);

  // Cleanup animation on unmount
  useEffect(() => {
    return () => {
      if (isAnimating) {
        stopAnimation();
      }
    };
  }, [isAnimating, stopAnimation]);

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

  // Filter projects based on search term
  const filteredUserProjects = arProjects.userProjects.filter((project: any) =>
    project.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    project.description.toLowerCase().includes(searchTerm.toLowerCase())
  );
  
  const filteredPublicProjects = arProjects.publicProjects.filter((project: any) =>
    project.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    project.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

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

  const handleProjectSelect = useCallback(async (project: Project) => {
    console.log('🎯 ARViewer: Project selected for AR loading:', {
      projectId: project.id,
      projectName: project.name,
      hasScene: !!sceneState.scene
    });
    
    setIsLoadingProject(true);
    setSelectedProject(project);
    setShowDrawer(false);
    
    try {
      // Clear existing construction
      if (sceneState.scene) {
        console.log('🧹 ARViewer: Clearing existing scene');
        clearAllBricks();
        clearAnchors(sceneState.scene);
      }

      // Reset demo state when loading a project
      demoCreatedRef.current = false;
      isCreatingDemoRef.current = false;

      console.log('⏳ ARViewer: Loading project structure...');
      await new Promise(resolve => setTimeout(resolve, 1000));
      await loadProjectInAR(project);
      console.log('✅ ARViewer: Project loaded successfully in AR');
      
    } catch (error) {
      console.error('❌ ARViewer: Failed to load project in AR:', error);
    } finally {
      setIsLoadingProject(false);
    }
  }, [sceneState.scene, clearAllBricks, clearAnchors]);

  const loadProjectInAR = async (project: Project) => {
    if (!sceneState.scene) {
      console.log('⚠️ ARViewer: No scene available for project loading');
      return;
    }

    const projectStructure = (project as any).project_structure;
    
    console.log('📋 ARViewer: Project structure analysis:', {
      hasStructure: !!projectStructure,
      hasSceneObjects: !!(projectStructure && projectStructure.sceneObjects),
      objectCount: projectStructure?.sceneObjects?.length || 0
    });
    
    if (projectStructure && projectStructure.sceneObjects) {
      console.log('🏗️ ARViewer: Creating bricks from project data...');
      let brickCount = 0;
      
      projectStructure.sceneObjects.forEach((obj: any) => {
        if (obj.type === 'brick') {
          const groundPosition = {
            x: obj.position.x,
            y: 0,
            z: obj.position.z
          };
          
          addBrick(selectedBrickType, groundPosition);
          brickCount++;
        }
      });
      
      console.log(`✅ ARViewer: Created ${brickCount} bricks from project data`);
    } else {
      console.log('🎯 ARViewer: No project structure found, creating demo instead');
      await createSimpleDemo();
    }
  };

  const handleClearConstruction = useCallback(() => {
    if (sceneState.scene) {
      clearAllBricks();
      clearAnchors(sceneState.scene);
    }
    setSelectedProject(null);
    
    // Reset demo state - let the useEffect handle recreation
    demoCreatedRef.current = false;
    isCreatingDemoRef.current = false;
  }, [sceneState.scene, clearAllBricks, clearAnchors]);

  return (
    <>
      {/* Force full screen layout */}
      <style>{`
        html, body {
          margin: 0 !important;
          padding: 0 !important;
          width: 100% !important;
          height: 100% !important;
          overflow: hidden !important;
        }
        #root {
          margin: 0 !important;
          padding: 0 !important;
          width: 100% !important;
          height: 100% !important;
        }
      `}</style>
      
      <div 
        className="fixed inset-0 bg-gradient-to-br from-slate-900 via-gray-900 to-black"
        style={{ 
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          width: '100vw',
          height: '100vh',
          margin: 0,
          padding: 0,
          zIndex: 1000
        }}
      >
      {/* Simple Header Bar */}
      <div 
        className="fixed top-0 left-0 right-0 h-16 bg-gradient-to-b from-black/70 to-transparent z-50 flex items-center justify-between px-4"
        style={{ 
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          width: '100%',
          margin: 0,
          padding: '0 1rem',
          pointerEvents: 'auto'
        }}
      >
        {/* Back Button */}
        <div className="w-24">
          {onBack && (
            <button
              onClick={onBack}
              className="btn-secondary flex items-center gap-2 text-white bg-white/10 backdrop-blur-md border border-white/20 hover:bg-white/20"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="text-sm font-medium">Back</span>
            </button>
          )}
        </div>

        {/* Center Title */}
        <div className="flex-1 text-center">
          {selectedProject ? (
            <div className="bg-black/30 backdrop-blur-sm rounded-lg px-4 py-2 inline-block">
              <p className="text-white font-medium text-sm">{selectedProject.name}</p>
            </div>
          ) : (
            <h1 className="text-white font-bold text-lg">AR Viewer</h1>
          )}
        </div>

        {/* Menu Button */}
        <div className="w-24 flex justify-end gap-2">
          <button
            onClick={() => setShowDebug(!showDebug)}
            className="icon-button bg-orange-500/20 backdrop-blur-md border border-orange-500/30 text-orange-300 hover:bg-orange-500/30 text-xs"
            title="Toggle Debug"
          >
            🔧
          </button>
          <button
            onClick={() => setShowDrawer(true)}
            className="icon-button bg-white/10 backdrop-blur-md border border-white/20 text-white hover:bg-white/20"
          >
            <Menu className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Camera/3D Scene - True Full Screen */}
      <div 
        ref={containerRef}
        className="fixed inset-0"
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          width: '100vw',
          height: '100vh',
          margin: 0,
          padding: 0,
          zIndex: 10
        }}
      >
        {/* Loading Screen */}
        {!sceneState.isInitialized && !initError && (
          <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-slate-900 via-gray-900 to-black">
            <div className="text-center">
              <div className="relative w-20 h-20 mx-auto mb-6">
                <div className="absolute inset-0 rounded-full border-4 border-blue-500/30"></div>
                <div className="absolute inset-0 rounded-full border-4 border-t-blue-500 animate-spin"></div>
              </div>
              <h3 className="text-xl font-semibold text-white mb-2">Initializing 3D Scene</h3>
              <p className="text-gray-400">Setting up virtual environment...</p>
              <p className="text-gray-500 text-sm mt-2">
                Click "Enter AR" for device camera access
              </p>
            </div>
          </div>
        )}

        {/* Mobile Error Screen */}
        {initError && (
          <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-red-900 via-gray-900 to-black p-4">
            <div className="text-center max-w-md">
              <div className="w-16 h-16 mx-auto mb-4 bg-red-500/20 rounded-full flex items-center justify-center">
                <span className="text-2xl">⚠️</span>
              </div>
              <h3 className="text-xl font-semibold text-white mb-2">Initialization Failed</h3>
              <p className="text-red-300 text-sm mb-4">{initError}</p>
              <div className="text-left bg-black/30 rounded-lg p-3 text-xs text-gray-300 space-y-1">
                <p><strong>Try:</strong></p>
                <p>• Use Chrome browser</p>
                <p>• Enable hardware acceleration</p>
                <p>• Check device compatibility</p>
                <p>• Restart browser</p>
              </div>
              <button 
                onClick={() => window.location.reload()} 
                className="mt-4 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-colors"
              >
                Reload Page
              </button>
            </div>
          </div>
        )}
        
        {/* Project Loading Overlay */}
        {isLoadingProject && (
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-30">
            <div className="text-center">
              <div className="relative w-16 h-16 mx-auto mb-4">
                <div className="absolute inset-0 rounded-full border-4 border-green-500/30"></div>
                <div className="absolute inset-0 rounded-full border-4 border-t-green-500 animate-spin"></div>
              </div>
              <h3 className="text-lg font-semibold text-white mb-1">Loading Project</h3>
              <p className="text-gray-300">{selectedProject?.name}</p>
            </div>
          </div>
        )}

        {/* WebXR Info Overlay - Show when scene loaded but WebXR not supported */}
        {sceneState.isInitialized && !xrState.isSupported && !selectedProject && !showDebug && (
          <div className="fixed top-20 left-4 right-4 z-40" style={{ pointerEvents: 'auto' }}>
            <div className="bg-blue-500/10 backdrop-blur-md border border-blue-500/30 rounded-xl p-4 max-w-md mx-auto">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 bg-blue-500/20 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Monitor className="w-4 h-4 text-blue-300" />
                </div>
                <div className="flex-1">
                  <h4 className="text-blue-200 font-semibold text-sm mb-1">3D Preview Mode</h4>
                  <p className="text-blue-300/80 text-xs leading-relaxed">
                    You're viewing a 3D construction preview. For AR camera access, use Chrome on Android.
                  </p>
                  <p className="text-blue-300/60 text-xs mt-2">
                    Select a project from the menu (☰) to get started!
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Mobile Debug Panel */}
        {showDebug && debugInfo.length > 0 && (
          <div className="fixed top-4 left-4 right-4 z-[9999]" style={{ pointerEvents: 'auto' }}>
            <div className="bg-black/90 backdrop-blur-md border border-white/30 rounded-lg p-3 max-h-48 overflow-y-auto shadow-lg">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-white text-xs font-semibold">🔧 Debug Info</h4>
                <button 
                  onClick={() => setShowDebug(false)}
                  className="text-gray-400 hover:text-white text-xs"
                >
                  ✕
                </button>
              </div>
              <div className="space-y-1">
                {debugInfo.map((log, index) => (
                  <div key={index} className="text-xs text-gray-300 font-mono break-all">
                    {log}
                  </div>
                ))}
              </div>
              <div className="mt-2 flex gap-2">
                <button 
                  onClick={() => setDebugInfo([])}
                  className="text-xs bg-gray-600 hover:bg-gray-500 text-white px-2 py-1 rounded"
                >
                  Clear
                </button>
                <button 
                  onClick={() => {
                    addDebugLog(`🔄 Scene Status: init=${sceneState.isInitialized}, anim=${isAnimating}, bricks=${bricks.length}`);
                    addDebugLog(`📊 Container: ${containerRef.current?.clientWidth}x${containerRef.current?.clientHeight}`);
                    addDebugLog(`📱 Viewport: ${window.innerWidth}x${window.innerHeight}`);
                    addDebugLog(`🎨 WebXR: supported=${xrState.isSupported}, active=${xrState.isActive}`);
                  }}
                  className="text-xs bg-blue-600 hover:bg-blue-500 text-white px-2 py-1 rounded"
                >
                  Refresh
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Status Indicator */}
        {xrState.isActive && (
          <div className="absolute top-20 right-4 z-30">
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              className="bg-green-500/20 backdrop-blur-sm border border-green-500/50 rounded-lg px-3 py-2"
            >
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                <span className="text-green-300 text-xs font-medium">AR Active</span>
              </div>
            </motion.div>
          </div>
        )}

        {/* Simple Bottom Bar */}
        <div 
          className="fixed bottom-0 left-0 right-0 h-20 bg-gradient-to-t from-black/70 to-transparent z-50 flex items-center justify-center"
          style={{
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            width: '100%',
            margin: 0,
            padding: 0,
            pointerEvents: 'auto'
          }}
        >
          <div className="flex items-center gap-3">
            {/* AR Mode Button - WebXR Supported */}
            {xrState.isSupported && !xrState.isActive && (
              <motion.button
                onClick={handleStartWebXR}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="btn-primary flex items-center gap-3 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 shadow-lg hover:shadow-xl"
                style={{ borderRadius: '16px' }}
              >
                <Smartphone className="w-5 h-5" />
                <span className="font-semibold">Enter AR</span>
              </motion.button>
            )}
            
            {/* Active AR Session */}
            {xrState.isActive && (
              <motion.button
                onClick={handleStopWebXR}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="btn-primary flex items-center gap-3 bg-gradient-to-r from-red-500 to-rose-600 hover:from-red-600 hover:to-rose-700 shadow-lg hover:shadow-xl"
                style={{ borderRadius: '16px' }}
              >
                <span className="font-semibold">Exit AR</span>
              </motion.button>
            )}

            {/* WebXR Not Supported - Show helpful message */}
            {!xrState.isSupported && (
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 px-4 py-3 bg-amber-500/20 backdrop-blur-md border border-amber-500/30 text-amber-200 text-sm font-medium" style={{ borderRadius: '16px' }}>
                  <Smartphone className="w-4 h-4" />
                  <span>AR Not Available</span>
                </div>
                <div className="text-xs text-gray-400 max-w-xs">
                  Try Chrome on Android for AR support
                </div>
              </div>
            )}

            {/* 3D Mode Indicator */}
            {!xrState.isActive && (
              <div className="flex items-center gap-2 px-4 py-3 bg-white/10 backdrop-blur-md border border-white/20 text-white text-sm font-medium" style={{ borderRadius: '16px' }}>
                <Monitor className="w-4 h-4" />
                <span>3D Preview</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Project Drawer */}
      <AnimatePresence>
        {showDrawer && (
          <>
            {/* Backdrop */}
            <motion.div
              className="fixed inset-0 bg-black/70 backdrop-blur-md z-[9998]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowDrawer(false)}
            />
            
            {/* Drawer */}
            <motion.div
              className="fixed top-0 right-0 h-full w-full max-w-lg bg-gradient-to-b from-gray-900/98 via-gray-800/95 to-gray-900/98 backdrop-blur-2xl border-l border-white/10 shadow-2xl z-[9999]"
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            >
              {/* Drawer Header */}
              <div className="bg-gradient-to-r from-gray-900/95 via-blue-900/20 to-gray-900/95 p-8 border-b border-white/10 backdrop-blur-sm">
                <div className="flex items-start justify-between mb-6">
                  <div className="flex-1">
                    <h2 className="text-2xl font-bold bg-gradient-to-r from-white via-blue-100 to-white bg-clip-text text-transparent">
                      AR Projects
                    </h2>
                    <p className="text-gray-300 text-sm mt-2 leading-relaxed">
                      Choose a project to experience in augmented reality
                    </p>
                  </div>
                  <button
                    onClick={() => setShowDrawer(false)}
                    className="p-3 hover:bg-white/10 rounded-xl transition-all duration-200 group"
                  >
                    <X className="w-5 h-5 text-gray-300 group-hover:text-white transition-colors" />
                  </button>
                </div>

                {/* Search Bar */}
                <div className="relative">
                  <div className="absolute left-4 top-1/2 transform -translate-y-1/2 pointer-events-none">
                    <Search className="w-5 h-5 text-gray-400" />
                  </div>
                  <input
                    type="text"
                    placeholder="Search projects by name or description..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-12 pr-6 py-4 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:border-blue-400/50 focus:bg-white/10 focus:ring-2 focus:ring-blue-400/20 transition-all duration-200"
                  />
                </div>
              </div>

              {/* Drawer Content */}
              <div className="flex-1 overflow-y-auto p-6 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
                {isLoadingArProjects ? (
                  <div className="text-center py-16">
                    <div className="relative w-16 h-16 mx-auto mb-6">
                      <div className="absolute inset-0 rounded-full border-4 border-blue-400/20"></div>
                      <div className="absolute inset-0 rounded-full border-4 border-t-blue-400 animate-spin"></div>
                    </div>
                    <h3 className="text-lg font-semibold text-white mb-2">Loading Projects</h3>
                    <p className="text-gray-300">Fetching available AR projects...</p>
                  </div>
                ) : (
                  <div className="space-y-8">
                    {/* User Projects Section */}
                    {filteredUserProjects.length > 0 && (
                      <div>
                        <div className="flex items-center gap-3 mb-5 p-4 bg-gradient-to-r from-blue-500/10 to-indigo-500/10 rounded-xl border border-blue-400/20">
                          <div className="w-10 h-10 bg-gradient-to-r from-blue-500 to-indigo-500 rounded-lg flex items-center justify-center">
                            <span className="text-white text-lg">👤</span>
                          </div>
                          <div className="flex-1">
                            <h3 className="text-lg font-bold text-white">My Projects</h3>
                            <p className="text-blue-200 text-sm">Your personal AR creations</p>
                          </div>
                          <div className="bg-blue-400/20 text-blue-300 px-3 py-1.5 rounded-full text-sm font-semibold">
                            {filteredUserProjects.length}
                          </div>
                        </div>
                        <div className="space-y-4">
                          {filteredUserProjects.map((project: any) => (
                            <ProjectCard 
                              key={project.id} 
                              project={project} 
                              onSelect={handleProjectSelect}
                              type="user"
                            />
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Public Projects Section */}
                    {filteredPublicProjects.length > 0 && (
                      <div>
                        <div className="flex items-center gap-3 mb-5 p-4 bg-gradient-to-r from-emerald-500/10 to-green-500/10 rounded-xl border border-emerald-400/20">
                          <div className="w-10 h-10 bg-gradient-to-r from-emerald-500 to-green-500 rounded-lg flex items-center justify-center">
                            <span className="text-white text-lg">🌍</span>
                          </div>
                          <div className="flex-1">
                            <h3 className="text-lg font-bold text-white">Public Gallery</h3>
                            <p className="text-emerald-200 text-sm">Community AR projects to explore</p>
                          </div>
                          <div className="bg-emerald-400/20 text-emerald-300 px-3 py-1.5 rounded-full text-sm font-semibold">
                            {filteredPublicProjects.length}
                          </div>
                        </div>
                        <div className="space-y-4">
                          {filteredPublicProjects.map((project: any) => (
                            <ProjectCard 
                              key={project.id} 
                              project={project} 
                              onSelect={handleProjectSelect}
                              type="public"
                            />
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Empty State */}
                    {filteredUserProjects.length === 0 && filteredPublicProjects.length === 0 && (
                      <div className="text-center py-16">
                        <div className="w-20 h-20 mx-auto mb-6 bg-gradient-to-r from-gray-600/20 to-gray-500/20 rounded-full flex items-center justify-center">
                          <span className="text-4xl">🏗️</span>
                        </div>
                        <h3 className="text-xl font-bold text-white mb-3">No Projects Found</h3>
                        <p className="text-gray-300 mb-8 max-w-sm mx-auto leading-relaxed">
                          {searchTerm 
                            ? 'Try adjusting your search terms or browse all projects' 
                            : 'No AR projects are currently available. Try the demo to get started.'}
                        </p>
                        <div className="space-y-3">
                          <button
                            onClick={() => {
                              handleClearConstruction();
                              setShowDrawer(false);
                            }}
                            className="w-full px-6 py-3 bg-gradient-to-r from-blue-600 via-blue-500 to-indigo-600 rounded-xl text-white font-semibold hover:from-blue-700 hover:via-blue-600 hover:to-indigo-700 transform hover:scale-105 transition-all duration-200 shadow-lg shadow-blue-500/25"
                          >
                            ✨ Try AR Demo
                          </button>
                          {searchTerm && (
                            <button
                              onClick={() => setSearchTerm('')}
                              className="w-full px-6 py-3 bg-white/5 border border-white/10 rounded-xl text-gray-300 font-medium hover:bg-white/10 hover:text-white transition-all duration-200"
                            >
                              Clear Search
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Error Notification */}
      <AnimatePresence>
        {xrError && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-24 left-4 right-4 p-4 bg-red-500/10 backdrop-blur-md border border-red-500/30 rounded-xl z-30"
          >
            <div className="flex items-start gap-3">
              <div className="w-2 h-2 bg-red-400 rounded-full mt-2 flex-shrink-0"></div>
              <div className="flex-1">
                <p className="text-red-200 text-sm font-medium">{xrError}</p>
                <button 
                  onClick={clearError}
                  className="mt-2 text-xs text-red-300 hover:text-red-100 transition-colors"
                >
                  Dismiss
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      </div>
    </>
  );
} 