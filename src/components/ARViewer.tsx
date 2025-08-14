import { useState, useEffect, useRef, useCallback } from 'react';
import { useWebXR, useThreeScene, useARConstruction } from '../hooks/useWebXR';
import { useDatabaseStore } from '../stores/database';
import { OptimizedModelLoader, type LoadProgress } from '../utils/optimizedModelLoader';
import type { BrickTypeKey } from '../types';
import type { Project } from '../lib/supabase';
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

// FPS Counter removed

export default function ARViewer({ onBack, user }: ARViewerProps) {
  // WebXR and Scene
  const { xrState, error: xrError, startXRSession, endXRSession, clearError } = useWebXR();
  const { 
    sceneState, 
    bricks,
    isAnimating, 
    brickGLTF, // Add GLTF loading state for demo creation timing
    isOptimizing,
    optimizedMeshes,
    initializeScene, 
    addBrick, 
    clearAllBricks, 
    startAnimation, 
    stopAnimation, 
    resizeRenderer, 
    resetCameraFor3D, 
    disposeScene,
    optimizeGeometry,
    autoOptimizeIfBeneficial,
    clearOptimizedGeometry
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

  // Optimized model loading state
  const [loadProgress, setLoadProgress] = useState<LoadProgress | null>(null);
  const optimizedModelLoaderRef = useRef<OptimizedModelLoader | null>(null);

  const { loadProjectsForAR, loadProjects, projects, loading } = useDatabaseStore();

  // Refs
  const containerRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  const log = useCallback((message: string) => {
    console.log(message);
  }, []);

  // Helper function to load individual bricks (fallback method)
  const loadIndividualBricks = useCallback(async (project: Project) => {
    const projectStructure = (project as any).project_structure;
    log(`🏗️ Loading individual bricks from project structure`);
    console.log(`🏗️ RAW PROJECT STRUCTURE:`, projectStructure);
    
    if (projectStructure?.sceneObjects && Array.isArray(projectStructure.sceneObjects)) {
      // Filter for brick objects only
      const brickObjects = projectStructure.sceneObjects.filter((obj: any) => obj.type === 'brick');
      log(`🧱 Found ${brickObjects.length} brick objects out of ${projectStructure.sceneObjects.length} total objects`);
      
      if (brickObjects.length > 0) {
        // Only place a single brick in AR viewer – take the first one (or selected)
        const firstBrick = brickObjects[0];
        if (firstBrick) {
          console.log(`🧱 Loading brick ${index + 1}:`, brick);
          log(`   Brick 1: name="${firstBrick.name}", pos=(${firstBrick.position?.x || 0}, ${firstBrick.position?.y || 0}, ${firstBrick.position?.z || 0})`);
          if (firstBrick.position) {
            const brickType = projectStructure.selectedMaterial || selectedBrickType;
            addBrick(brickType, { x: firstBrick.position.x || 0, y: firstBrick.position.y || 0, z: firstBrick.position.z || 0 });
          } else {
            log(`   ⚠️ First brick has no position data`);
          }
        }
        log(`✅ Loaded 1 brick from project using material: ${projectStructure.selectedMaterial || selectedBrickType}`);
        
        // Auto-optimize geometry if we have enough bricks
        if (brickObjects.length >= 5) {
          log(`🔧 Auto-optimizing geometry for ${brickObjects.length} bricks...`);
          setTimeout(() => {
            autoOptimizeIfBeneficial();
          }, 500); // Small delay to ensure all bricks are rendered
        }
      } else {
        log(`⚠️ No brick objects found in sceneObjects`);
        log(`🎲 Falling back to demo creation`);
        createDemo();
      }
    } else {
      log(`⚠️ No valid sceneObjects found in project_structure`);
      log(`🎲 Falling back to demo creation`);
      createDemo();
    }
  }, [log, selectedBrickType, addBrick, autoOptimizeIfBeneficial]); // createDemo added later

  // Load AR projects - Load public projects for everyone, user projects for logged-in users
  const loadArProjects = useCallback(async () => {
    if (isLoadingArProjects) {
      log(`⏳ Already loading projects, skipping duplicate call`);
      return;
    }
    
    const userId = user?.id;
    log(`🔍 ARViewer: Starting project load for ${userId ? `user: ${userId}` : 'anonymous user (public only)'}`);
    log(`📊 ARViewer: Current store state - projects: ${projects.length}, loading: ${loading}`);
    
    setIsLoadingArProjects(true);
    
        try {
      // First check if we already have projects in the store
      if (projects.length > 0) {
        log(`✅ ARViewer: Found ${projects.length} projects in store, using them directly`);
        
        // Separate user and public projects
        const userProjects = userId ? projects.filter((p: any) => p.user_id === userId) : [];
        const publicProjects = projects.filter((p: any) => p.is_public === true);
        
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
      
      if (userId) {
        // For logged-in users: load their projects + public projects
        log(`🔄 ARViewer: Calling store.loadProjects for logged-in user...`);
        await loadProjects(userId, true); // Force refresh to ensure fresh data
      } else {
        // For anonymous users: load only public projects directly
        log(`🔄 ARViewer: Loading public projects for anonymous user...`);
        try {
          const result = await loadProjectsForAR('anonymous');
          const publicProjects = result.publicProjects || [];
          
          setArProjects({
            userProjects: [],
            publicProjects
          });
          
          log(`✅ ARViewer: Loaded ${publicProjects.length} public projects for anonymous user`);
          return;
        } catch (err) {
          log(`❌ ARViewer: Failed to load public projects: ${err}`);
        }
      }
      
      // After loading, check store again (for logged-in users)
      const storeState = useDatabaseStore.getState();
      log(`📊 ARViewer: After loadProjects - store has ${storeState.projects.length} projects`);
      
      if (storeState.projects.length > 0) {
        const userProjects = userId ? storeState.projects.filter((p: any) => p.user_id === userId) : [];
        const publicProjects = storeState.projects.filter((p: any) => p.is_public === true);
        
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
  }, [user?.id, isLoadingArProjects, projects, loading, loadProjects, loadProjectsForAR, log]);

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
        
        // Clear any existing optimized models from the scene
        if (sceneState.group) {
          const toRemove: any[] = [];
          sceneState.group.traverse((child: any) => {
            if (child.isOptimizedModel || child.userData?.isOptimizedModel) {
              toRemove.push(child);
            }
          });
          toRemove.forEach(mesh => sceneState.group!.remove(mesh));
          console.log(`🧹 Cleared ${toRemove.length} existing optimized models`);
        }
        
        demoCreated.current = false; // Reset demo flag when loading project
      }

      await new Promise(resolve => setTimeout(resolve, 300));
      
      // Check for optimized model first
      const hasOptimizedModel = optimizedModelLoaderRef.current?.hasOptimizedModel(project);
      
      if (hasOptimizedModel && project.optimized_model_url) {
        log(`🚀 Loading optimized model: ${project.optimized_model_url}`);
        console.log(`📊 Model size: ${project.model_file_size ? Math.round(project.model_file_size / 1024) + 'KB' : 'unknown'}`);
        
        try {
          // Load optimized model from Supabase storage
          const result = await optimizedModelLoaderRef.current!.loadOptimizedModel(
            project,
            (progress) => {
              setLoadProgress(progress);
              log(`📊 Load progress: ${progress.stage} (${progress.progress}%)`);
            }
          );
          
          if (result.success && result.mesh && sceneState.group) {
            // Add the optimized mesh to the scene
            sceneState.group.add(result.mesh);
            
            // Set flags to indicate we're using an optimized model (for performance monitoring)
            (result.mesh as any).isOptimizedModel = true;
            result.mesh.userData = {
              ...result.mesh.userData,
              isOptimizedModel: true,
              projectId: project.id,
              originalBrickCount: result.metadata?.originalBrickCount,
              optimizationRatio: result.metadata?.optimizationRatio
            };
            
            // Optimize rendering settings for complex optimized models
            if (result.mesh.geometry.attributes.position.count > 50000) {
              console.log('🔧 Applying optimizations for high-poly optimized model...');
              
              // Disable shadows initially for very complex models
              if (sceneState.renderer?.shadowMap) {
                sceneState.renderer.shadowMap.enabled = false;
                console.log('🔧 Disabled shadows for complex optimized model');
              }
              
              // Set reasonable pixel ratio
              if (sceneState.renderer) {
                sceneState.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
                console.log('🔧 Set pixel ratio to', sceneState.renderer.getPixelRatio());
              }
            }
            
            log(`✅ Optimized model loaded successfully! (CSG Boolean operations)`);
            console.log('📐 Model details:', {
              vertices: result.mesh.geometry.attributes.position.count,
              triangles: result.mesh.geometry.index ? result.mesh.geometry.index.count / 3 : 0,
              originalBrickCount: result.metadata?.originalBrickCount || 'unknown',
              optimizationRatio: result.metadata?.optimizationRatio || 'unknown',
              optimizationMethod: 'Boolean union (CSG operations)'
            });
          } else {
            throw new Error(result.error || 'Failed to load optimized model');
          }
        } catch (optimizedError) {
          log(`❌ Optimized model loading failed: ${optimizedError}`);
          console.warn('⚠️ Falling back to individual brick loading:', optimizedError);
          
          // Fall back to individual brick loading
          await loadIndividualBricks(project);
        } finally {
          setLoadProgress(null);
        }
      } else {
        // No optimized model available - load individual bricks
        const fallbackMessage = optimizedModelLoaderRef.current?.getFallbackMessage(project) || 'Loading individual bricks';
        log(`ℹ️ ${fallbackMessage}`);
        await loadIndividualBricks(project);
      }
    } catch (err) {
      log(`❌ Project failed: ${err}`);
      console.error(`❌ Project loading error:`, err);
    } finally {
      setIsLoadingProject(false);
    }
  }, [sceneState.scene, clearAllBricks, clearAnchors, addBrick, selectedBrickType, log]);

  // Filter projects - ONLY show projects with optimized models for AR viewer
  const filteredUserProjects = arProjects.userProjects.filter((project: any) => {
    // Must have optimized model to show in AR viewer
    const hasOptimizedModel = project.optimized_model_url && project.model_file_size;
    if (!hasOptimizedModel) return false;
    
    // Then apply search filter
    return project.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
           (project.description && project.description.toLowerCase().includes(searchTerm.toLowerCase()));
  });
  
  const filteredPublicProjects = arProjects.publicProjects.filter((project: any) => {
    // Must have optimized model to show in AR viewer
    const hasOptimizedModel = project.optimized_model_url && project.model_file_size;
    if (!hasOptimizedModel) return false;
    
    // Then apply search filter
    return project.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
           (project.description && project.description.toLowerCase().includes(searchTerm.toLowerCase()));
  });

  // Load projects when drawer opens - for everyone (logged-in gets user+public, anonymous gets public)
  useEffect(() => {
    if (showDrawer && arProjects.userProjects.length === 0 && arProjects.publicProjects.length === 0 && !isLoadingArProjects) {
      log('🎯 Drawer opened - loading projects...');
      loadArProjects();
    }
  }, [showDrawer, arProjects.userProjects.length, arProjects.publicProjects.length, isLoadingArProjects]); // Removed loadArProjects and log from dependencies

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

  // Initialize OptimizedModelLoader
  useEffect(() => {
    optimizedModelLoaderRef.current = new OptimizedModelLoader();
    
    return () => {
      optimizedModelLoaderRef.current = null;
    };
  }, []);

  // Create empty demo function
  const createDemo = useCallback(() => {
    if (!sceneState.group) {
      log('❌ No group for demo');
      return;
    }

    log('🏗️ Creating empty demo scene...');
    
    // Empty demo scene - no bricks added
    // This allows users to start with a clean slate in AR mode
    
    log('✅ Empty demo scene created');
    
    // No auto-optimization needed for empty scene
  }, [sceneState.group, log]);

  // Start animation when scene is initialized
  useEffect(() => {
    if (sceneState.isInitialized && !isAnimating && isReady) {
      log('▶️ Starting animation...');
      startAnimation();
    }
  }, [sceneState.isInitialized, isAnimating, isReady, startAnimation, log]);

  // Auto-start AR mode on mobile devices
  useEffect(() => {
    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    if (!isMobile) return;
    // Only attempt once when ready and not already active
    if (sceneState.isInitialized && isReady && !xrState.isActive && xrState.isSupported && brickGLTF) {
      handleStartAR();
    }
  }, [sceneState.isInitialized, isReady, xrState.isActive, xrState.isSupported, brickGLTF]);

  // Force transparent page background during AR to avoid white overlay
  useEffect(() => {
    if (!xrState.isActive) return;
    const html = document.documentElement;
    const bodyEl = document.body;
    const prevHtmlBg = html.style.backgroundColor;
    const prevBodyBg = bodyEl.style.backgroundColor;
    html.style.backgroundColor = 'transparent';
    bodyEl.style.backgroundColor = 'transparent';
    return () => {
      html.style.backgroundColor = prevHtmlBg;
      bodyEl.style.backgroundColor = prevBodyBg;
    };
  }, [xrState.isActive]);

  // Create demo when animation starts - FIXED: Remove dependencies that cause infinite loops
  const demoCreated = useRef<boolean>(false);
  
  useEffect(() => {
    // Check if GLTF is loaded before creating demo to prevent failed attempts
    const isGLTFReady = brickGLTF !== null;
    
    if (sceneState.isInitialized && isAnimating && sceneState.group && isReady && !demoCreated.current && !selectedProject && !isLoadingArProjects && isGLTFReady) {
      log('🎯 Creating demo (GLTF ready)...');
      createDemo();
      demoCreated.current = true; // Prevent multiple demo creation
    } else if (sceneState.isInitialized && isAnimating && sceneState.group && isReady && !demoCreated.current && !selectedProject && !isLoadingArProjects && !isGLTFReady) {
      log('⏳ Demo creation waiting for GLTF model to load...');
    }
  }, [sceneState.isInitialized, isAnimating, sceneState.group, isReady, selectedProject, isLoadingArProjects, brickGLTF]); // Added brickGLTF dependency

  // Window resize with debouncing to prevent excessive calls
  useEffect(() => {
    let resizeTimeout: NodeJS.Timeout;
    
    const handleResize = () => {
      // Debounce resize calls to prevent excessive processing
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        if (sceneState.renderer && !sceneState.renderer.xr.isPresenting) {
          const width = window.innerWidth;
          const height = window.innerHeight;
          resizeRenderer(width, height);
          log(`📐 Resized to ${width}x${height}`);
        }
      }, 150); // 150ms debounce delay
    };

    // Initial resize (immediate, no debounce)
    if (sceneState.renderer && !sceneState.renderer.xr.isPresenting) {
      const width = window.innerWidth;
      const height = window.innerHeight;
      resizeRenderer(width, height);
    }
    
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      clearTimeout(resizeTimeout); // Clean up timeout on unmount
    };
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
      const result = await startXRSession(overlayRef.current || document.body);
      
      if (sceneState.renderer && result.session) {
        // Ensure renderer reference space type matches our session
        try { (sceneState.renderer.xr as any).setReferenceSpaceType && sceneState.renderer.xr.setReferenceSpaceType('local'); } catch {}
        // Attach hitTestSource to session so our animation loop can access it
        (result.session as any).hitTestSource = result.hitTestSource || null;
        sceneState.renderer.xr.setSession(result.session);
        log('✅ AR started');
        // Do not spawn until a plane is detected; handled in hit-test loop
        
        // Keep existing demo in AR mode - no need to recreate
        log('✅ AR mode started - existing bricks will be repositioned automatically by AR anchoring system');
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
      
      // Keep existing demo in 3D mode - no need to recreate
      log('✅ Exited AR mode - existing bricks remain in 3D preview');
    } catch (err) {
      log(`❌ Stop AR failed: ${err}`);
    }
  };

  const handleClear = () => {
    if (sceneState.scene) {
      clearAllBricks();
      clearAnchors(sceneState.scene);
      demoCreated.current = false; // Reset demo flag so it can be recreated
      setSelectedProject(null); // Clear selected project to allow demo recreation
      log('🧹 Cleared - demo will be recreated by main useEffect');
    }
  };

  const isXR = xrState.isActive;
  return (
    <div className={isXR ? "fixed inset-0 w-screen h-screen overflow-hidden" : "fixed inset-0 w-screen h-screen viewer-glass overflow-hidden"} style={{ overscrollBehavior: 'none' }}>
      {/* DOM Overlay root for AR debugging/UI */}
      <div ref={overlayRef} style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 2147483647 }}>
        {/* Always-on HUD container to ensure overlay root has content */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0 }}>
          <div className="mx-auto mt-2 w-[95%] max-w-3xl text-xs font-mono text-white/90">
            <div className="glass-chip px-3 py-2" style={{ background: 'rgba(0,0,0,0.65)' }}>
              <div>AR Overlay active. Move phone to detect a plane.</div>
            </div>
          </div>
        </div>
      </div>
      {/* Header - Fixed position */}
      {/* Keep header visible but non-interactive during XR for guidance */}
      <header className="fixed top-0 left-0 right-0 w-full h-16 px-6 viewer-header z-[2147483645]" style={{ pointerEvents: 'auto', opacity: isXR ? 0.9 : 1 }}>
        <div className="flex items-center justify-between h-full">
          {/* Left: Back Button */}
          <div className="w-24 flex items-center">
            {onBack && (
              <button 
                onClick={onBack} 
                className="btn-secondary"
              >
                <ArrowLeft className="w-4 h-4" />
                <span className="text-sm font-medium">Back</span>
              </button>
            )}
          </div>

          {/* Center: Mode Toggle Buttons */}
          <div className="flex-1 flex justify-center">
            <div className="flex items-center gap-2 glass-chip p-1">
              <button 
                onClick={handleStartAR}
                disabled={!xrState.isSupported || xrState.isActive}
                className={`btn-ghost ${
                  xrState.isActive 
                    ? 'btn-success' 
                    : xrState.isSupported 
                    ? '' 
                    : 'btn-disabled'
                }`}
              >
                📱 AR Mode
              </button>
              <button 
                onClick={() => !xrState.isActive && resetCameraFor3D()}
                className={`btn-primary ${
                  !xrState.isActive 
                    ? '' 
                    : 'btn-ghost'
                }`}
              >
                🖥️ 3D Preview
              </button>
            </div>
          </div>

          {/* Right: Menu Buttons */}
          <div className="w-24 flex items-center justify-end gap-2">
            <button onClick={() => setShowDebug(!showDebug)} className="btn-icon" title="Debug Panel">🔧</button>
            <button 
              onClick={() => setShowDrawer(true)} 
              className="btn-icon"
              title="Open Projects"
            >
              <Menu className="w-6 h-6" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area - Full screen with padding for header/footer */}
      <div className="absolute inset-0" style={{ overflow: 'hidden', paddingTop: isXR ? 0 : '4rem', paddingBottom: isXR ? 0 : '4rem' }}>
        {/* 3D Scene Container */}
        <div 
          ref={containerRef}
          className="w-full h-full"
        >
          {/* Loading State */}
            {(!isReady && !error) || isLoadingProject ? (
              <div className="absolute inset-0 flex items-center justify-center viewer-backdrop">
              <div className="text-center">
                <div className="relative w-20 h-20 mx-auto mb-6">
                    <div className="absolute inset-0 rounded-full border-4 border-white/10"></div>
                    <div className="absolute inset-0 rounded-full border-4 border-white/50 border-t-transparent animate-spin"></div>
                </div>
                <h3 className="text-xl font-bold text-white mb-2">
                  {isLoadingProject ? 'Loading Project' : 'Loading AR Experience'}
                </h3>
                  <p className="text-white/80 text-sm">
                  {loadProgress 
                    ? `${loadProgress.stage}... ${loadProgress.progress}%`
                    : isLoadingProject 
                      ? (selectedProject ? `Loading ${selectedProject.name}...` : 'Loading project data...') 
                      : 'Initializing 3D scene...'
                  }
                </p>
                  {loadProgress && (
                    <div className="progress">
                      <div className="progress-bar" style={{ width: `${loadProgress.progress}%` }} />
                    </div>
                  )}
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
              <div className="glass-card p-4">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-white/10">
                    <Monitor className="w-4 h-4 text-white/70" />
                  </div>
                  <div className="flex-1">
                    <h4 className="text-white/90 font-semibold text-sm mb-1">3D Preview Mode</h4>
                    <p className="text-white/70 text-xs">Mouse to rotate camera. For AR, use Chrome on Android.</p>
                  </div>
                </div>
              </div>
            </div>
          )}
          {xrState.isActive && (
            <div className="absolute top-16 left-0 right-0 z-[2147483646]" style={{ pointerEvents: 'none' }}>
              <div className="mx-auto mt-2 w-[95%] max-w-3xl text-xs font-mono text-white/90">
                <div className="glass-chip px-3 py-2" style={{ background: 'rgba(0,0,0,0.65)', transition: 'opacity 0.3s ease', opacity: bricks.length > 0 ? 0 : 1 }}>
                  <div>Move your phone slowly over a flat surface to detect a plane. Keep it steady for 1–2 seconds.</div>
                  <div>When a plane is detected, the brick will appear fixed in the world.</div>
                </div>
              </div>
            </div>
          )}
          {/* AR Debug HUD */}
          <div className="fixed top-0 left-0 right-0 z-[2147483646]" style={{ pointerEvents: 'none' }}>
            <div className="mx-auto mt-2 w-[95%] max-w-3xl text-xs font-mono text-white/90">
              <div className="glass-chip px-3 py-2" style={{ background: 'rgba(0,0,0,0.35)' }}>
                <div>XR: {String(xrState.isActive)} | Supported: {String(xrState.isSupported)}</div>
                <div>Session: {xrState.session ? 'yes' : 'no'} | RefSpace: {xrState.referenceSpace ? 'yes' : 'no'} | HitTest: {xrState.hitTestSource ? 'yes' : 'no'}</div>
                <div>Scene initialized: {String(sceneState.isInitialized)} | Renderer: {sceneState.renderer ? 'yes' : 'no'} | Camera: {sceneState.camera ? 'yes' : 'no'}</div>
                {xrError && <div style={{ color: '#ffb4b4' }}>XR Error: {xrError}</div>}
                {error && <div style={{ color: '#ffb4b4' }}>Viewer Error: {error}</div>}
              </div>
            </div>
          </div>

          {/* Debug Panel */}
          {showDebug && (
            <div className="absolute top-4 right-4 w-80 glass-panel p-4 z-40">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-white font-semibold">Debug Panel</h3>
                <button onClick={() => setShowDebug(false)} className="btn-ghost">✕</button>
              </div>
              <div className="space-y-2 text-xs">
                <div className="text-gray-300">Scene: {sceneState.isInitialized ? '✅' : '❌'}</div>
                <div className="text-gray-300">Animation: {isAnimating ? '▶️' : '⏸️'}</div>
                <div className="text-gray-300">WebXR: {xrState.isSupported ? '✅' : '❌'}</div>
                <div className="text-gray-300">AR Active: {xrState.isActive ? '✅' : '❌'}</div>
                <div className="text-gray-300">Optimized: {optimizedMeshes.size > 0 ? '✅' : '❌'}</div>
                <div className="text-gray-300">Optimizing: {isOptimizing ? '🔄' : '❌'}</div>
              </div>
              <div className="mt-4 space-y-2">
                <button 
                  onClick={async () => {
                    log('🔧 Manual geometry optimization...');
                    const success = await optimizeGeometry((progress, stage) => {
                      log(`📊 Optimization: ${progress.toFixed(1)}% - ${stage}`);
                    });
                    if (success) {
                      log('✅ Manual optimization completed');
                    } else {
                      log('❌ Manual optimization failed');
                    }
                  }}
                  disabled={isOptimizing || optimizedMeshes.size > 0}
                  className="w-full px-3 py-2 bg-green-500/20 border border-green-500/30 text-green-200 rounded-lg text-xs hover:bg-green-500/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isOptimizing ? 'Optimizing...' : 'Optimize Geometry'}
                </button>
                <button 
                  onClick={() => {
                    log('🧹 Clearing optimized geometry...');
                    clearOptimizedGeometry();
                    log('✅ Optimization cleared');
                  }}
                  disabled={optimizedMeshes.size === 0}
                  className="w-full px-3 py-2 bg-yellow-500/20 border border-yellow-500/30 text-yellow-200 rounded-lg text-xs hover:bg-yellow-500/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Clear Optimization
                </button>
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

      {/* Bottom Status Bar - Fixed position */}
          {/* Keep footer hints visible but non-interactive in XR */}
          <footer className="fixed bottom-0 left-0 right-0 h-16 px-6 viewer-footer z-[2147483645] flex items-center justify-center" style={{ pointerEvents: 'auto', opacity: isXR ? 0.9 : 1 }}>
              <div className="flex items-center gap-4">
                {xrState.isActive && (
                  <motion.button 
                    onClick={handleStopAR} 
                    whileHover={{ scale: 1.05 }} 
                    whileTap={{ scale: 0.95 }} 
                    className="btn-danger"
                  >
                    <span className="text-sm">Exit AR</span>
                  </motion.button>
                )}

                {selectedProject && (
                  <div className="bg-black/30 backdrop-blur-sm rounded-lg px-4 py-2 border border-white/10">
                    <p className="text-white font-medium text-sm">{selectedProject.name}</p>
                  </div>
                )}

                {!xrState.isSupported && (
                  <div className="notice">
                    <Smartphone className="w-4 h-4" />
                    <span>AR Not Available</span>
                  </div>
                )}
              </div>
            </footer>

      {/* FPS Counter removed in production to avoid overlay clutter */}

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
                className="btn-ghost"
                  >
                    <X className="w-5 h-5 text-gray-300" />
                  </button>
                </div>
            <div className="flex items-center gap-2 glass-chip px-3 py-1.5">
              <Search className="w-4 h-4 text-white/70" />
              <input
                type="text"
                placeholder="Search projects..."
                className="bg-transparent text-white outline-none placeholder-white/50"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
              </div>

              <div className="p-6 overflow-y-auto max-h-full">
                {isLoadingArProjects ? (
                  <div className="text-center py-16">
                    <div className="relative w-20 h-20 mx-auto mb-6">
                      <div className="absolute inset-0 rounded-full border-4 border-white/10"></div>
                      <div className="absolute inset-0 rounded-full border-4 border-white/50 border-t-transparent animate-spin"></div>
                    </div>
                    <h3 className="text-xl font-bold text-white mb-3">Loading Projects...</h3>
                    <p className="text-white/80 text-sm">Fetching projects from database...</p>
                  </div>
                ) : filteredUserProjects.length === 0 && filteredPublicProjects.length === 0 ? (
                  <div className="text-center py-16">
                    <div className="w-20 h-20 mx-auto mb-6 glass-card rounded-full flex items-center justify-center">
                      <span className="text-4xl">🏗️</span>
                    </div>
                    <h3 className="text-xl font-bold text-white mb-3">No Optimized Projects Found</h3>
                    <p className="text-white/80 text-sm">Only projects with optimized 3D models are shown here. Create a project with 3+ bricks to generate an optimized model for AR viewing!</p>
                    <button onClick={() => { handleClear(); setShowDrawer(false); }} className="btn-primary w-full mt-4">
                      ✨ Try AR Demo
                    </button>
                  </div>
                                                 ) : (
                  <div className="space-y-6">
                    {/* Anonymous User Notice */}
                    {!user && (
                      <div className="p-4 bg-gradient-to-r from-amber-500/10 to-orange-500/10 rounded-xl border border-amber-400/20 mb-6">
                        <div className="flex items-center gap-3 mb-2">
                          <div className="w-8 h-8 bg-gradient-to-r from-amber-500 to-orange-500 rounded-lg flex items-center justify-center">
                            <span className="text-white text-sm">👁️</span>
                          </div>
                          <h3 className="text-lg font-bold text-white">Public Viewer Mode</h3>
                        </div>
                        <p className="text-amber-200 text-sm">
                          You can view public projects from the community. <strong>Sign in</strong> to access your own projects and create new ones.
                        </p>
                      </div>
                    )}

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

                    {/* No Projects Message */}
                    {filteredUserProjects.length === 0 && filteredPublicProjects.length === 0 && (
                      <div className="text-center py-8">
                        <div className="text-6xl mb-4">🏗️</div>
                        <h3 className="text-lg font-semibold text-white mb-2">No Projects Available</h3>
                        <p className="text-gray-400 text-sm">
                          {user 
                            ? "Create your first project in the editor or wait for public projects to be shared!"
                            : "No public projects are available yet. Check back soon!"
                          }
                        </p>
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