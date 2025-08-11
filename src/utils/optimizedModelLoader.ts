import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { storage } from '../lib/supabase';

export interface LoadProgress {
  stage: string;
  progress: number;
  bytesLoaded?: number;
  bytesTotal?: number;
}

export interface ModelLoadResult {
  success: boolean;
  mesh?: THREE.Mesh;
  metadata?: any;
  error?: string;
}

export class OptimizedModelLoader {
  private gltfLoader: GLTFLoader;

  constructor() {
    this.gltfLoader = new GLTFLoader();
  }

  /**
   * Load optimized model from project (cloud or local storage)
   */
  async loadOptimizedModel(
    project: any,
    onProgress?: (progress: LoadProgress) => void
  ): Promise<ModelLoadResult> {
    
    try {
      let arrayBuffer: ArrayBuffer | null = null;
      let expectedFileSize: number | undefined;
      
      // Try cloud storage first
      if (project.optimized_model_url && project.optimized_model_url.trim()) {
        onProgress?.({ stage: 'Downloading from cloud', progress: 5 });
        
        const { data: cloudBuffer, error: downloadError } = await storage.downloadOptimizedModel(project.optimized_model_url);
        
        if (!downloadError && cloudBuffer) {
          arrayBuffer = cloudBuffer;
          expectedFileSize = project.model_file_size;
          console.log('✅ Loaded optimized model from cloud storage');
        } else {
          console.warn('⚠️ Cloud download failed, trying local storage:', downloadError);
        }
      }
      
      // Fallback to local storage
      if (!arrayBuffer) {
        onProgress?.({ stage: 'Loading from local storage', progress: 15 });
        
        const localStorageKey = `optimized_model_${project.id}`;
        try {
          const localModel = localStorage.getItem(localStorageKey);
          if (localModel) {
            const modelData = JSON.parse(localModel);
            arrayBuffer = new Uint8Array(modelData.data).buffer;
            expectedFileSize = modelData.fileSize;
            console.log('✅ Loaded optimized model from local storage');
          }
        } catch (localError) {
          console.error('❌ Failed to load from local storage:', localError);
        }
      }
      
      if (!arrayBuffer) {
        return { 
          success: false, 
          error: 'No optimized model found in cloud or local storage' 
        };
      }

      onProgress?.({ 
        stage: 'Model downloaded', 
        progress: 50,
        bytesLoaded: arrayBuffer.byteLength,
        bytesTotal: expectedFileSize || arrayBuffer.byteLength
      });

      // Convert ArrayBuffer to Blob for GLTF loader
      const blob = new Blob([arrayBuffer], { type: 'model/gltf-binary' });
      const objectURL = URL.createObjectURL(blob);

      onProgress?.({ stage: 'Parsing GLB', progress: 60 });

      // Load with GLTFLoader
      const gltf = await new Promise<any>((resolve, reject) => {
        this.gltfLoader.load(
          objectURL,
          (result) => {
            URL.revokeObjectURL(objectURL); // Clean up object URL
            resolve(result);
          },
          (progressEvent) => {
            if (progressEvent.lengthComputable) {
              const loadProgress = 60 + ((progressEvent.loaded / progressEvent.total) * 30);
              onProgress?.({ 
                stage: 'Loading GLB', 
                progress: loadProgress,
                bytesLoaded: progressEvent.loaded,
                bytesTotal: progressEvent.total
              });
            }
          },
          (error) => {
            URL.revokeObjectURL(objectURL); // Clean up on error
            reject(error);
          }
        );
      });

      onProgress?.({ stage: 'Processing model', progress: 90 });

      // Extract the optimized mesh from the loaded GLTF
      let optimizedMesh: THREE.Mesh | null = null;
      let metadata: any = {};

      gltf.scene.traverse((child: any) => {
        if (child instanceof THREE.Mesh && !optimizedMesh) {
          optimizedMesh = child;
          metadata = child.userData || {};
        }
      });

      if (!optimizedMesh) {
        return { 
          success: false, 
          error: 'No mesh found in optimized model' 
        };
      }

      onProgress?.({ stage: 'Model ready', progress: 100 });

      console.log('✅ Optimized model loaded successfully:', {
        vertices: optimizedMesh!.geometry.attributes.position.count,
        triangles: optimizedMesh!.geometry.index ? optimizedMesh!.geometry.index.count / 3 : 0,
        fileSize: arrayBuffer.byteLength,
        metadata
      });

      return {
        success: true,
        mesh: optimizedMesh,
        metadata
      };

    } catch (error) {
      console.error('❌ Optimized model load error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown load error'
      };
    }
  }

  /**
   * Check if project has optimized model available (cloud or local)
   */
  hasOptimizedModel(project: any): boolean {
    // Check cloud storage first
    if (project.optimized_model_url && project.optimized_model_url.trim()) {
      return true;
    }
    
    // Check local storage fallback
    const localStorageKey = `optimized_model_${project.id}`;
    try {
      const localModel = localStorage.getItem(localStorageKey);
      if (localModel) {
        const modelData = JSON.parse(localModel);
        return !!(modelData.data && modelData.fileSize);
      }
    } catch (error) {
      console.warn('Failed to check local storage for optimized model:', error);
    }
    
    return false;
  }

  /**
   * Get fallback message for projects without optimized models
   */
  getFallbackMessage(project: any): string {
    const brickCount = project.project_structure?.sceneObjects?.filter((obj: any) => obj.type === 'brick')?.length || 0;
    
    if (brickCount < 5) {
      return `Project has ${brickCount} bricks - will load individual bricks (no optimization needed)`;
    } else {
      return `Project has ${brickCount} bricks but no optimized model - will load individual bricks (may be slow)`;
    }
  }

  /**
   * Estimate memory usage for the optimized model
   */
  estimateMemoryUsage(fileSize: number): string {
    // Rough estimation: GLB file size is typically 1/3 to 1/2 of memory usage
    const estimatedMemory = fileSize * 2;
    
    if (estimatedMemory < 1024 * 1024) {
      return `~${Math.round(estimatedMemory / 1024)}KB`;
    } else {
      return `~${Math.round(estimatedMemory / (1024 * 1024))}MB`;
    }
  }
} 