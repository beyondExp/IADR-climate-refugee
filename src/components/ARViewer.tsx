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
      
      <p className="text-gray-300 text-sm mb-4 line-clamp-2 leading-relaxed">
        {project.description || 'No description available'}
      </p>

      <div className="flex items-center justify-between">
        <div className={`px-3 py-1.5 rounded-full text-xs font-medium ${
          isUser 
            ? 'bg-blue-400/10 text-blue-300 border border-blue-400/20' 
            : 'bg-emerald-400/10 text-emerald-300 border border-emerald-400/20'
        }`}>
          {isUser ? 'Private' : 'Public'}
        </div>
        
        <button className="px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 rounded-lg text-white text-sm font-medium transition-all duration-200 shadow-lg">
          Load in AR
        </button>
      </div>
    </motion.div>
  );
}

export default function ARViewer({ onBack, user }: ARViewerProps) {
  // WebXR and Scene
  const { xrState, error: xrError, startXRSession, endXRSession, clearError } = useWebXR();
  const { 
    sceneState, 
    isAnimating, 
    initializeScene, 
    addBrick, 
    clearAllBricks, 
    startAnimation, 
    stopAnimation, 
    resizeRenderer, 
    resetCameraFor3D, 
    disposeScene 
  } = useThreeScene();
  const { clearAnchors } = useARConstruction();

  // UI State
  const [selectedBrickType] = useState<BrickTypeKey>('clay-sustainable');
  const [error, setError] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [showDebug, setShowDebug] = useState(false);
  const [showDrawer, setShowDrawer] = useState(false);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [isLoadingProject, setIsLoadingProject] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const [arProjects, setArProjects] = useState<{
    userProjects: any[],
    publicProjects: any[]
  }>({
    userProjects: [],
    publicProjects: []
  });
  const [isLoadingArProjects, setIsLoadingArProjects] = useState(false);

  const { loadProjectsForAR, loadProjects, projects, loading } = useDatabaseStore();

  // Refs
  const containerRef = useRef<HTMLDivElement>(null);

  const log = useCallback((message: string) => {
    console.log(message);
  }, []);

  // Load AR projects - Use existing projects from store instead of duplicate query
  const loadArProjects = useCallback(async () => {
    if (!user?.id) {
      log(`🚫 Skipping project load - no user ID`);
      return;
    }
    
    if (isLoadingArProjects) {
      log(`⏳ Already loading projects, skipping duplicate call`);
      return;
    }
    
    log(`🔍 ARViewer: Starting project load for user: ${user.id}`);
    log(`📊 ARViewer: Current store state - projects: ${projects.length}, loading: ${loading}`);
    
    setIsLoadingArProjects(true);
    
    try {
      // First check if we already have projects in the store
      if (projects.length > 0) {
        log(`✅ ARViewer: Found ${projects.length} projects in store, using them directly`);
        
                 // Separate user and public projects
         const userProjects = projects.filter((p: any) => p.user_id === user.id);
         const publicProjects = projects.filter((p: any) => p.is_public && p.user_id !== user.id);
        
        setArProjects({
          userProjects,
          publicProjects
        });
        
        log(`📋 ARViewer: Processed projects - ${userProjects.length} user, ${publicProjects.length} public`);
        
                 // Log detailed project info
         userProjects.forEach((project: any, i: number) => {
           log(`📋 ARViewer User Project ${i + 1}: ${project.name} (${project.id})`);
           console.log(`📐 FULL PROJECT STRUCTURE ${i + 1}:`, project);
           
           if (project.project_parameters) {
             log(`   📐 Has project_parameters: ${JSON.stringify(project.project_parameters, null, 2)}`);
             console.log(`   📐 Project Parameters Details:`, project.project_parameters);
             
             if (project.project_parameters.bricks) {
               log(`   🧱 Found ${project.project_parameters.bricks.length} bricks in project_parameters`);
               project.project_parameters.bricks.forEach((brick: any, brickIndex: number) => {
                 console.log(`   🧱 Brick ${brickIndex + 1}:`, brick);
                 log(`      Type: ${brick.type || 'unknown'}`);
                 log(`      Position: x=${brick.position?.x || 0}, y=${brick.position?.y || 0}, z=${brick.position?.z || 0}`);
               });
             } else {
               log(`   ⚠️ No bricks array found in project_parameters`);
             }
           } else {
             log(`   ⚠️ No project_parameters found`);
           }
           
           // Also check project_structure if it exists
           if (project.project_structure) {
             log(`   🏗️ Has project_structure: ${JSON.stringify(project.project_structure, null, 2)}`);
             console.log(`   🏗️ Project Structure Details:`, project.project_structure);
           }
           
           console.log(`📋 ---- End Project ${i + 1} Structure ----`);
         });
        
        return;
      }
      
      // If no projects in store, try to load them
      log(`🔄 ARViewer: No projects in store, attempting to load via database...`);
      
      // Try using the existing loadProjects function instead of loadProjectsForAR
      log(`🔄 ARViewer: Calling store.loadProjects with force refresh...`);
      await loadProjects(user.id, true); // Force refresh to ensure fresh data
      
      // After loading, check store again
      const storeState = useDatabaseStore.getState();
      log(`📊 ARViewer: After loadProjects - store has ${storeState.projects.length} projects`);
      
             if (storeState.projects.length > 0) {
         const userProjects = storeState.projects.filter((p: any) => p.user_id === user.id);
         const publicProjects = storeState.projects.filter((p: any) => p.is_public && p.user_id !== user.id);
        
        setArProjects({
          userProjects,
          publicProjects
        });
        
        log(`✅ ARViewer: Successfully loaded ${userProjects.length} user + ${publicProjects.length} public projects`);
      } else {
        log(`⚠️ ARViewer: Store still empty after loadProjects call`);
      }
      
    } catch (err) {
      log(`❌ ARViewer Exception: ${err}`);
      console.error('❌ ARViewer loadArProjects error:', err);
    } finally {
      setIsLoadingArProjects(false);
      log('🔄 ARViewer: Project loading completed');
    }
  }, [user?.id, isLoadingArProjects, projects, loading, loadProjects, log]);

  // Handle project selection
  const handleProjectSelect = useCallback(async (project: Project) => {
    log(`🎯 Loading: ${project.name}`);
    console.log(`🎯 SELECTED PROJECT FULL DATA:`, project);
    setSelectedProject(project);
    setShowDrawer(false);
    setIsLoadingProject(true);
    
    try {
      if (sceneState.scene) {
        clearAllBricks();
        clearAnchors(sceneState.scene);
      }

      await new Promise(resolve => setTimeout(resolve, 300));
      
      // Load project structure for brick positions (correct data path!)
      const projectStructure = (project as any).project_structure;
      log(`🏗️ Project structure: ${JSON.stringify(projectStructure, null, 2)}`);
      console.log(`🏗️ RAW PROJECT STRUCTURE:`, projectStructure);
      
      if (projectStructure?.sceneObjects && Array.isArray(projectStructure.sceneObjects)) {
        // Filter for brick objects only
        const brickObjects = projectStructure.sceneObjects.filter((obj: any) => obj.type === 'brick');
        log(`🧱 Found ${brickObjects.length} brick objects out of ${projectStructure.sceneObjects.length} total objects`);
        
        if (brickObjects.length > 0) {
          brickObjects.forEach((brick: any, index: number) => {
            console.log(`🧱 Loading brick ${index + 1}:`, brick);
            log(`   Brick ${index + 1}: name="${brick.name}", pos=(${brick.position?.x || 0}, ${brick.position?.y || 0}, ${brick.position?.z || 0})`);
            
            if (brick.position) {
              // Use project's selected material or fallback to default
              const brickType = projectStructure.selectedMaterial || selectedBrickType;
              addBrick(
                brickType, 
                { 
                  x: brick.position.x || 0, 
                  y: brick.position.y || 0, 
                  z: brick.position.z || 0 
                }
              );
            } else {
              log(`   ⚠️ Brick ${index + 1} has no position data`);
            }
          });
          log(`✅ Loaded ${brickObjects.length} bricks from project using material: ${projectStructure.selectedMaterial || selectedBrickType}`);
        } else {
          log(`⚠️ No brick objects found in sceneObjects`);
          log(`🎲 Falling back to demo creation`);
          createDemo();
        }
      } else {
        log(`⚠️ No valid sceneObjects found in project_structure`);
        log(`   projectStructure: ${JSON.stringify(projectStructure)}`);
        log(`   projectStructure?.sceneObjects: ${JSON.stringify(projectStructure?.sceneObjects)}`);
        log(`   Array.isArray check: ${Array.isArray(projectStructure?.sceneObjects)}`);
        
        // Fallback to demo if no project data
        log(`🎲 Falling back to demo creation`);
        createDemo();
      }
    } catch (err) {
      log(`❌ Project failed: ${err}`);
      console.error(`❌ Project loading error:`, err);
    } finally {
      setIsLoadingProject(false);
    }
  }, [sceneState.scene, clearAllBricks, clearAnchors, addBrick, selectedBrickType, log]);

  // Filter projects
  const filteredUserProjects = arProjects.userProjects.filter((project: any) =>
    project.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (project.description && project.description.toLowerCase().includes(searchTerm.toLowerCase()))
  );
  
  const filteredPublicProjects = arProjects.publicProjects.filter((project: any) =>
    project.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (project.description && project.description.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  // Load projects when drawer opens (now uses store instead of hanging loadProjectsForAR)
  useEffect(() => {
    if (showDrawer && user && arProjects.userProjects.length === 0 && arProjects.publicProjects.length === 0) {
      log('🎯 Drawer opened - loading projects from store...');
      loadArProjects();
    }
  }, [showDrawer, user, arProjects.userProjects.length, arProjects.publicProjects.length, loadArProjects, log]);

  // Initialize once
  useEffect(() => {
    if (!containerRef.current || isReady) return;

    const init = async () => {
      try {
        log('🚀 Starting initialization...');
        
        const result = await initializeScene(containerRef.current!);
        if (!result) {
          log('⚠️ Scene already exists');
          return;
        }

        log('✅ Scene created - waiting for state update...');
        setIsReady(true);
      } catch (err) {
        log(`❌ Failed: ${err}`);
        setError(err instanceof Error ? err.message : 'Initialization failed');
      }
    };

    init();
  }, []); // Only run once - no dependencies that could cause re-runs

  // Create simple demo function
  const createDemo = useCallback(() => {
    if (!sceneState.group) {
      log('❌ No group for demo');
      return;
    }

    log('🏗️ Building demo...');
    
    // Simple 3x3 grid
    for (let x = -1; x <= 1; x++) {
      for (let z = -1; z <= 1; z++) {
        addBrick(selectedBrickType, { x: x * 0.6, y: 0, z: z * 0.6 });
      }
    }
    
    log('✅ Demo created');
  }, [sceneState.group, addBrick, selectedBrickType, log]);

  // Start animation when scene is initialized
  useEffect(() => {
    if (sceneState.isInitialized && !isAnimating && isReady) {
      log('▶️ Starting animation...');
      startAnimation();
    }
  }, [sceneState.isInitialized, isAnimating, isReady, startAnimation, log]);

  // Create demo when animation starts
  useEffect(() => {
    if (sceneState.isInitialized && isAnimating && sceneState.group && isReady) {
      log('🎯 Creating demo...');
      createDemo();
    }
  }, [sceneState.isInitialized, isAnimating, sceneState.group, isReady, createDemo, log]);

  // Window resize
  useEffect(() => {
    const handleResize = () => {
      if (sceneState.renderer) {
        const width = window.innerWidth;
        const height = window.innerHeight;
        resizeRenderer(width, height);
        log(`📐 Resized to ${width}x${height}`);
      }
    };

    // Initial resize
    handleResize();
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [sceneState.renderer, resizeRenderer, log]);

  // Cleanup - only run once on unmount
  useEffect(() => {
    return () => {
      console.log('🧹 ARViewer unmounting - cleaning up');
      stopAnimation();
      disposeScene();
    };
  }, []); // Empty dependency array - only run on unmount

  // WebXR handlers
  const handleStartAR = async () => {
    try {
      log('🎮 Starting AR...');
      clearError();
      const result = await startXRSession();
      
      if (sceneState.renderer && result.session) {
        sceneState.renderer.xr.setSession(result.session);
        log('✅ AR started');
      }
    } catch (err) {
      log(`❌ AR failed: ${err}`);
    }
  };

  const handleStopAR = async () => {
    try {
      log('🚪 Stopping AR...');
      await endXRSession();
      
      // Reset camera after short delay
      setTimeout(() => {
        if (sceneState.camera && sceneState.controls) {
          resetCameraFor3D();
          log('📹 Camera reset');
        }
      }, 100);
    } catch (err) {
      log(`❌ Stop AR failed: ${err}`);
    }
  };

  const handleClear = () => {
    if (sceneState.scene) {
      clearAllBricks();
      clearAnchors(sceneState.scene);
      log('🧹 Cleared');
      
      setTimeout(() => {
        createDemo();
      }, 100);
    }
  };

  return (
    <div className="fixed inset-0 w-screen h-screen bg-gradient-to-br from-slate-900 via-gray-900 to-black flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between h-16 px-6 bg-gradient-to-b from-black/80 to-transparent relative z-50">
        {/* Left: Back Button */}
        <div className="w-24 flex items-center">
          {onBack && (
            <button 
              onClick={onBack} 
              className="flex items-center gap-2 px-4 py-2 bg-white/10 backdrop-blur-md border border-white/20 rounded-lg text-white hover:bg-white/20 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="text-sm font-medium">Back</span>
            </button>
          )}
        </div>

        {/* Center: Title */}
        <div className="flex-1 flex justify-center">
          {selectedProject ? (
            <div className="bg-black/30 backdrop-blur-sm rounded-lg px-4 py-2">
              <p className="text-white font-medium text-sm">{selectedProject.name}</p>
            </div>
          ) : (
            <h1 className="text-white font-bold text-lg">AR Viewer</h1>
          )}
        </div>

        {/* Right: Menu Buttons */}
        <div className="w-24 flex items-center justify-end gap-2">
          <button 
            onClick={() => setShowDebug(!showDebug)} 
            className="w-12 h-12 flex items-center justify-center bg-gradient-to-br from-orange-500/20 to-orange-600/20 backdrop-blur-md border border-orange-500/40 text-orange-200 hover:from-orange-500/30 hover:to-orange-600/30 hover:border-orange-400/60 rounded-xl transition-all duration-200 shadow-lg"
            title="Debug Panel"
          >
            🔧
          </button>
          <button 
            onClick={() => setShowDrawer(true)} 
            className="w-12 h-12 flex items-center justify-center bg-gradient-to-br from-blue-500/20 to-indigo-600/20 backdrop-blur-md border border-blue-500/40 text-blue-200 hover:from-blue-500/30 hover:to-indigo-600/30 hover:border-blue-400/60 rounded-xl transition-all duration-200 shadow-lg"
            title="Open Projects"
          >
            <Menu className="w-6 h-6" />
          </button>
        </div>
      </header>

      {/* Main Content Area - Takes remaining space */}
      <div className="flex-1 relative">
        {/* 3D Scene Container */}
        <div 
          ref={containerRef}
          className="absolute inset-0 w-full h-full"
        >
          {/* Loading State */}
          {(!isReady && !error) || isLoadingProject ? (
            <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-slate-900 via-gray-900 to-black">
              <div className="text-center">
                <div className="relative w-20 h-20 mx-auto mb-6">
                  <div className="absolute inset-0 rounded-full border-4 border-blue-500/30"></div>
                  <div className="absolute inset-0 rounded-full border-4 border-blue-500 border-t-transparent animate-spin"></div>
                </div>
                <h3 className="text-xl font-bold text-white mb-2">
                  {isLoadingProject ? 'Loading Project' : 'Loading AR Experience'}
                </h3>
                <p className="text-gray-300 text-sm">
                  {isLoadingProject 
                    ? (selectedProject ? `Loading ${selectedProject.name}...` : 'Loading project data...') 
                    : 'Initializing 3D scene...'
                  }
                </p>
              </div>
            </div>
          ) : null}

          {/* Error State */}
          {error && (
            <div className="absolute inset-0 flex items-center justify-center bg-red-500/10">
              <div className="text-center p-8">
                <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                  <span className="text-red-400 text-2xl">⚠️</span>
                </div>
                <h3 className="text-xl font-bold text-red-200 mb-2">Error</h3>
                <p className="text-red-300 text-sm mb-4">{error}</p>
                <button 
                  onClick={() => window.location.reload()} 
                  className="px-4 py-2 bg-red-500/20 border border-red-500/30 text-red-200 rounded-lg hover:bg-red-500/30 transition-colors"
                >
                  Reload
                </button>
              </div>
            </div>
          )}

          {/* Info Overlay */}
          {isReady && !xrState.isActive && (
            <div className="absolute top-4 left-4 right-4 z-30">
              <div className="bg-blue-500/10 backdrop-blur-md border border-blue-500/30 rounded-xl p-4">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 bg-blue-500/20 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Monitor className="w-4 h-4 text-blue-400" />
                  </div>
                  <div className="flex-1">
                    <h4 className="text-blue-200 font-semibold text-sm mb-1">3D Preview Mode</h4>
                    <p className="text-blue-300/80 text-xs">Mouse to rotate camera. For AR, use Chrome on Android.</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Debug Panel */}
          {showDebug && (
            <div className="absolute top-4 right-4 w-80 bg-black/80 backdrop-blur-md border border-gray-600 rounded-xl p-4 z-40">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-white font-semibold">Debug Panel</h3>
                <button 
                  onClick={() => setShowDebug(false)}
                  className="text-gray-400 hover:text-white transition-colors"
                >
                  ✕
                </button>
              </div>
              <div className="space-y-2 text-xs">
                <div className="text-gray-300">Scene: {sceneState.isInitialized ? '✅' : '❌'}</div>
                <div className="text-gray-300">Animation: {isAnimating ? '▶️' : '⏸️'}</div>
                <div className="text-gray-300">WebXR: {xrState.isSupported ? '✅' : '❌'}</div>
                <div className="text-gray-300">AR Active: {xrState.isActive ? '✅' : '❌'}</div>
              </div>
              <div className="mt-4 space-y-2">
                <button onClick={handleClear} className="w-full px-3 py-2 bg-red-500/20 border border-red-500/30 text-red-200 rounded-lg text-xs hover:bg-red-500/30 transition-colors">
                  Clear Scene
                </button>
                <button 
                  onClick={async () => {
                    log('🧪 Manual Supabase test...');
                    try {
                      const result = await loadProjectsForAR(user?.id || '96af8e7a-6ee6-42fc-ae91-42ab09248852');
                      log(`🧪 Test result: ${JSON.stringify(result, null, 2)}`);
                    } catch (err) {
                      log(`🧪 Test error: ${err}`);
                    }
                  }}
                  className="w-full px-3 py-2 bg-blue-500/20 border border-blue-500/30 text-blue-200 rounded-lg text-xs hover:bg-blue-500/30 transition-colors"
                >
                  Test Supabase
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bottom Controls */}
      <footer className="flex items-center justify-center h-20 px-6 bg-gradient-to-t from-black/90 via-black/60 to-transparent relative z-50">
        <div className="flex items-center gap-6">
          {xrState.isSupported && !xrState.isActive && (
            <motion.button 
              onClick={handleStartAR} 
              whileHover={{ scale: 1.05 }} 
              whileTap={{ scale: 0.95 }} 
              className="flex items-center gap-3 px-8 py-4 bg-gradient-to-r from-green-500 via-emerald-500 to-green-600 hover:from-green-600 hover:via-emerald-600 hover:to-green-700 rounded-2xl text-white font-bold shadow-2xl shadow-green-500/30 border border-green-400/50 backdrop-blur-sm transition-all duration-300"
            >
              <Smartphone className="w-6 h-6" />
              <span className="text-lg">Enter AR</span>
            </motion.button>
          )}
          
          {xrState.isActive && (
            <motion.button 
              onClick={handleStopAR} 
              whileHover={{ scale: 1.05 }} 
              whileTap={{ scale: 0.95 }} 
              className="flex items-center gap-3 px-8 py-4 bg-gradient-to-r from-red-500 via-rose-500 to-red-600 hover:from-red-600 hover:via-rose-600 hover:to-red-700 rounded-2xl text-white font-bold shadow-2xl shadow-red-500/30 border border-red-400/50 backdrop-blur-sm transition-all duration-300"
            >
              <span className="text-lg">Exit AR</span>
            </motion.button>
          )}

          {!xrState.isSupported && (
            <div className="flex items-center gap-3 px-6 py-3 bg-gradient-to-r from-amber-500/20 to-orange-500/20 backdrop-blur-md border border-amber-400/40 text-amber-200 font-medium rounded-xl shadow-lg">
              <Smartphone className="w-5 h-5" />
              <span>AR Not Available</span>
            </div>
          )}

          {!xrState.isActive && isReady && (
            <div className="flex items-center gap-3 px-6 py-3 bg-gradient-to-r from-blue-500/20 to-indigo-500/20 backdrop-blur-md border border-blue-400/40 text-blue-200 font-medium rounded-xl shadow-lg">
              <Monitor className="w-5 h-5" />
              <span>3D Preview Mode</span>
            </div>
          )}
        </div>
      </footer>

      {/* Project Drawer */}
      <AnimatePresence>
        {showDrawer && (
          <>
            <motion.div 
              className="fixed inset-0 bg-black/70 backdrop-blur-md z-[90]" 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }} 
              onClick={() => setShowDrawer(false)} 
            />
            
            <motion.div 
              className="fixed top-0 right-0 h-full w-full max-w-lg bg-gradient-to-b from-gray-900/98 via-gray-800/95 to-gray-900/98 backdrop-blur-2xl border-l border-white/10 shadow-2xl z-[100]" 
              initial={{ x: '100%' }} 
              animate={{ x: 0 }} 
              exit={{ x: '100%' }} 
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            >
              <div className="p-6 border-b border-white/10">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-bold text-white">AR Projects</h2>
                  <button 
                    onClick={() => setShowDrawer(false)} 
                    className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                  >
                    <X className="w-5 h-5 text-gray-300" />
                  </button>
                </div>
                <div className="flex items-center gap-2 px-2 py-1 bg-gray-800/50 rounded-full border border-gray-700">
                  <Search className="w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search projects..."
                    className="bg-transparent text-white outline-none"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
              </div>

              <div className="p-6 overflow-y-auto max-h-full">
                {isLoadingArProjects ? (
                  <div className="text-center py-16">
                    <div className="relative w-20 h-20 mx-auto mb-6">
                      <div className="absolute inset-0 rounded-full border-4 border-blue-500/30"></div>
                      <div className="absolute inset-0 rounded-full border-4 border-blue-500 border-t-transparent animate-spin"></div>
                    </div>
                    <h3 className="text-xl font-bold text-white mb-3">Loading Projects...</h3>
                    <p className="text-gray-300 text-sm">Fetching projects from database...</p>
                  </div>
                ) : filteredUserProjects.length === 0 && filteredPublicProjects.length === 0 ? (
                  <div className="text-center py-16">
                    <div className="w-20 h-20 mx-auto mb-6 bg-gradient-to-r from-gray-600/20 to-gray-500/20 rounded-full flex items-center justify-center">
                      <span className="text-4xl">🏗️</span>
                    </div>
                    <h3 className="text-xl font-bold text-white mb-3">No Projects Found</h3>
                    <p className="text-gray-300 text-sm">Try searching for a project or create a new one!</p>
                    <button 
                      onClick={() => { handleClear(); setShowDrawer(false); }} 
                      className="w-full px-6 py-3 bg-gradient-to-r from-blue-600 via-blue-500 to-indigo-600 rounded-xl text-white font-semibold hover:from-blue-700 hover:via-blue-600 hover:to-indigo-700 transform hover:scale-105 transition-all duration-200"
                    >
                      ✨ Try AR Demo
                    </button>
                  </div>
                                 ) : (
                   <div className="space-y-6">
                     {filteredUserProjects.length > 0 && (
                       <div>
                         <div className="flex items-center gap-3 mb-4 p-3 bg-gradient-to-r from-blue-500/10 to-indigo-500/10 rounded-xl border border-blue-400/20">
                           <div className="w-8 h-8 bg-gradient-to-r from-blue-500 to-indigo-500 rounded-lg flex items-center justify-center">
                             <span className="text-white text-sm">👤</span>
                           </div>
                           <h3 className="text-lg font-bold text-white">My Projects</h3>
                           <div className="bg-blue-400/20 text-blue-300 px-2 py-1 rounded-full text-xs font-semibold">
                             {filteredUserProjects.length}
                           </div>
                         </div>
                         <div className="space-y-3">
                           {filteredUserProjects.map((project) => (
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
                     
                     {filteredPublicProjects.length > 0 && (
                       <div>
                         <div className="flex items-center gap-3 mb-4 p-3 bg-gradient-to-r from-emerald-500/10 to-green-500/10 rounded-xl border border-emerald-400/20">
                           <div className="w-8 h-8 bg-gradient-to-r from-emerald-500 to-green-500 rounded-lg flex items-center justify-center">
                             <span className="text-white text-sm">🌍</span>
                           </div>
                           <h3 className="text-lg font-bold text-white">Public Gallery</h3>
                           <div className="bg-emerald-400/20 text-emerald-300 px-2 py-1 rounded-full text-xs font-semibold">
                             {filteredPublicProjects.length}
                           </div>
                         </div>
                         <div className="space-y-3">
                           {filteredPublicProjects.map((project) => (
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
            className="fixed bottom-24 left-4 right-4 p-4 bg-red-500/10 backdrop-blur-md border border-red-500/30 rounded-xl z-40"
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
  );
}