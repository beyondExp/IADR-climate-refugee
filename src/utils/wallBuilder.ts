import * as THREE from 'three';
import { Brush, Evaluator, ADDITION, SUBTRACTION, INTERSECTION } from 'three-bvh-csg';
import { ShapeInstance, ShapeLibrary, shapeLibrary } from './shapeLibrary';

export type CSGOperation = 'union' | 'subtract' | 'intersect';

export interface WallDefinition {
  id: string;
  name: string;
  description: string;
  shapes: WallShape[];
  metadata: {
    category: 'interior' | 'exterior' | 'structural';
    style: 'modern' | 'classical' | 'organic';
    estimatedBricks: number;
  };
}

export interface WallShape {
  shapeInstance: ShapeInstance;
  operation: CSGOperation;
  order: number; // Order of operations
}

export interface WallBounds {
  min: THREE.Vector3;
  max: THREE.Vector3;
  volume: number;
  surfaceArea: number;
}

export interface BrickPlacementPoint {
  position: THREE.Vector3;
  rotation: THREE.Euler;
  connectionType: 'male' | 'female';
  connectionId: number; // 0, 1, or 2 (3 connection points per brick)
  surfaceNormal: THREE.Vector3;
}

/**
 * CSG-based wall builder for creating complex architectural structures
 * Combines simple shapes using Boolean operations to create sophisticated walls
 */
export class WallBuilder {
  private evaluator: Evaluator;
  private shapeLibrary: ShapeLibrary;

  constructor() {
    this.evaluator = new Evaluator();
    this.evaluator.attributes = ['position', 'normal'];
    this.evaluator.useGroups = false;
    this.shapeLibrary = shapeLibrary;
    
    console.log('🏗️ WallBuilder initialized with CSG evaluator');
  }

  /**
   * Create a wall from multiple shapes using CSG operations
   */
  async createWall(definition: WallDefinition): Promise<{
    geometry: THREE.BufferGeometry;
    bounds: WallBounds;
    brickPlacementPoints: BrickPlacementPoint[];
  } | null> {
    try {
      console.log(`🏗️ Creating wall: ${definition.name}`);
      console.log(`📐 Processing ${definition.shapes.length} shapes with CSG operations`);

      if (definition.shapes.length === 0) {
        console.error('❌ No shapes provided for wall creation');
        return null;
      }

      // Sort shapes by operation order
      const sortedShapes = [...definition.shapes].sort((a, b) => a.order - b.order);
      
      let resultBrush: Brush | null = null;

      for (let i = 0; i < sortedShapes.length; i++) {
        const wallShape = sortedShapes[i];
        const { shapeInstance, operation } = wallShape;

        console.log(`🔧 Processing shape ${i + 1}/${sortedShapes.length}: ${shapeInstance.shapeId} (${operation})`);

        // Create brush for current shape
        const shapeBrush = this.createTransformedBrush(shapeInstance);
        if (!shapeBrush) {
          console.warn(`⚠️ Failed to create brush for shape: ${shapeInstance.shapeId}`);
          continue;
        }

        if (!resultBrush) {
          // First shape becomes the base
          resultBrush = shapeBrush;
          console.log(`📦 Base shape set: ${shapeInstance.shapeId}`);
          continue;
        }

        // Apply CSG operation
        try {
          const newResult = await this.performCSGOperation(resultBrush, shapeBrush, operation);
          if (newResult) {
            resultBrush = newResult;
            console.log(`✅ CSG ${operation} completed successfully`);
          } else {
            console.warn(`⚠️ CSG ${operation} failed, keeping previous result`);
          }
        } catch (error) {
          console.error(`❌ CSG operation failed:`, error);
          // Continue with previous result
        }
      }

      if (!resultBrush) {
        console.error('❌ No valid result brush created');
        return null;
      }

      // Calculate wall bounds and properties
      const bounds = this.calculateWallBounds(resultBrush.geometry);
      
      // Generate brick placement points
      const brickPlacementPoints = await this.generateBrickPlacementPoints(resultBrush.geometry, bounds);

      console.log(`✅ Wall created successfully:`, {
        vertices: resultBrush.geometry.attributes.position.count,
        bounds: bounds,
        brickPoints: brickPlacementPoints.length
      });

      return {
        geometry: resultBrush.geometry,
        bounds,
        brickPlacementPoints
      };

    } catch (error) {
      console.error('❌ Wall creation failed:', error);
      return null;
    }
  }

  /**
   * Create and transform a brush from a shape instance
   */
  private createTransformedBrush(shapeInstance: ShapeInstance): Brush | null {
    const brush = this.shapeLibrary.createShapeBrush(shapeInstance.shapeId, shapeInstance.parameters);
    if (!brush) return null;

    // Apply transformations
    const matrix = new THREE.Matrix4();
    matrix.compose(shapeInstance.position, new THREE.Quaternion().setFromEuler(shapeInstance.rotation), shapeInstance.scale);
    
    brush.geometry.applyMatrix4(matrix);
    brush.geometry.computeVertexNormals();
    brush.geometry.computeBoundingBox();

    return brush;
  }

  /**
   * Perform CSG operation between two brushes
   */
  private async performCSGOperation(brushA: Brush, brushB: Brush, operation: CSGOperation): Promise<Brush | null> {
    try {
      let csgOperation;
      switch (operation) {
        case 'union':
          csgOperation = ADDITION;
          break;
        case 'subtract':
          csgOperation = SUBTRACTION;
          break;
        case 'intersect':
          csgOperation = INTERSECTION;
          break;
        default:
          console.error(`❌ Unknown CSG operation: ${operation}`);
          return null;
      }

      console.log(`🔧 Performing CSG ${operation} operation...`);
      const result = this.evaluator.evaluate(brushA, brushB, csgOperation);
      
      if (result && result.geometry && result.geometry.attributes.position.count > 0) {
        console.log(`✅ CSG ${operation} successful: ${result.geometry.attributes.position.count} vertices`);
        return result;
      } else {
        console.warn(`⚠️ CSG ${operation} returned empty result`);
        return null;
      }
    } catch (error) {
      console.error(`❌ CSG ${operation} operation failed:`, error);
      return null;
    }
  }

  /**
   * Calculate wall bounds and properties
   */
  private calculateWallBounds(geometry: THREE.BufferGeometry): WallBounds {
    geometry.computeBoundingBox();
    const box = geometry.boundingBox!;
    
    const min = box.min.clone();
    const max = box.max.clone();
    const size = new THREE.Vector3().subVectors(max, min);
    const volume = size.x * size.y * size.z;
    
    // Approximate surface area (simplified)
    const surfaceArea = 2 * (size.x * size.y + size.y * size.z + size.x * size.z);

    return { min, max, volume, surfaceArea };
  }

  /**
   * Generate brick placement points throughout the wall volume
   */
  private async generateBrickPlacementPoints(geometry: THREE.BufferGeometry, bounds: WallBounds): Promise<BrickPlacementPoint[]> {
    const points: BrickPlacementPoint[] = [];
    
    // Standard brick dimensions (adjust based on your revolutionary brick design)
    const brickSize = { width: 0.4, height: 0.2, depth: 0.2 };
    const connectionSpacing = 0.1; // Space between connection points
    
    // Calculate grid dimensions
    const gridSize = new THREE.Vector3().subVectors(bounds.max, bounds.min);
    const gridSteps = {
      x: Math.floor(gridSize.x / (brickSize.width + connectionSpacing)),
      y: Math.floor(gridSize.y / (brickSize.height + connectionSpacing)),
      z: Math.floor(gridSize.z / (brickSize.depth + connectionSpacing))
    };

    console.log(`🧱 Generating brick placement grid: ${gridSteps.x}×${gridSteps.y}×${gridSteps.z}`);

    // Create raycaster for surface detection
    const raycaster = new THREE.Raycaster();
    const tempGeometry = geometry.clone();
    tempGeometry.computeVertexNormals();

    for (let x = 0; x < gridSteps.x; x++) {
      for (let y = 0; y < gridSteps.y; y++) {
        for (let z = 0; z < gridSteps.z; z++) {
          const position = new THREE.Vector3(
            bounds.min.x + (x + 0.5) * (brickSize.width + connectionSpacing),
            bounds.min.y + (y + 0.5) * (brickSize.height + connectionSpacing),
            bounds.min.z + (z + 0.5) * (brickSize.depth + connectionSpacing)
          );

          // Check if this position is inside the wall volume
          if (this.isPointInsideGeometry(position, tempGeometry)) {
            // Generate connection points for this brick
            for (let connectionId = 0; connectionId < 3; connectionId++) {
              const connectionOffset = this.getConnectionOffset(connectionId, brickSize);
              const connectionPos = position.clone().add(connectionOffset);
              
              // Determine connection type based on position pattern
              const connectionType: 'male' | 'female' = (x + y + z + connectionId) % 2 === 0 ? 'male' : 'female';
              
              // Calculate surface normal (simplified)
              const surfaceNormal = this.calculateSurfaceNormal(connectionPos, tempGeometry);

              points.push({
                position: connectionPos,
                rotation: new THREE.Euler(0, 0, 0), // Will be calculated based on connections
                connectionType,
                connectionId,
                surfaceNormal
              });
            }
          }
        }
      }
    }

    console.log(`🧱 Generated ${points.length} brick placement points`);
    return points;
  }

  /**
   * Get offset for each of the 3 connection points on a revolutionary brick
   */
  private getConnectionOffset(connectionId: number, brickSize: { width: number, height: number, depth: number }): THREE.Vector3 {
    switch (connectionId) {
      case 0: // Top connection
        return new THREE.Vector3(0, brickSize.height / 2, 0);
      case 1: // Front connection  
        return new THREE.Vector3(0, 0, brickSize.depth / 2);
      case 2: // Side connection
        return new THREE.Vector3(brickSize.width / 2, 0, 0);
      default:
        return new THREE.Vector3(0, 0, 0);
    }
  }

  /**
   * Check if a point is inside the geometry volume (simplified)
   */
  private isPointInsideGeometry(point: THREE.Vector3, geometry: THREE.BufferGeometry): boolean {
    // Simplified implementation - could be enhanced with proper point-in-mesh testing
    geometry.computeBoundingBox();
    const box = geometry.boundingBox!;
    
    return point.x >= box.min.x && point.x <= box.max.x &&
           point.y >= box.min.y && point.y <= box.max.y &&
           point.z >= box.min.z && point.z <= box.max.z;
  }

  /**
   * Calculate surface normal at a point (simplified)
   */
  private calculateSurfaceNormal(point: THREE.Vector3, geometry: THREE.BufferGeometry): THREE.Vector3 {
    // Simplified implementation - return up vector for now
    // Could be enhanced with proper surface normal calculation
    return new THREE.Vector3(0, 1, 0);
  }

  /**
   * Create predefined wall templates for common architectural patterns
   */
  createWallTemplate(type: 'straight' | 'curved' | 'corner' | 'arch' | 'tower'): WallDefinition {
    const templates: Record<string, WallDefinition> = {
      straight: {
        id: 'wall_straight',
        name: 'Straight Wall',
        description: 'Simple rectangular wall',
        shapes: [{
          shapeInstance: this.shapeLibrary.createShapeInstance('cube', { width: 4, height: 3, depth: 0.3 }),
          operation: 'union',
          order: 0
        }],
        metadata: {
          category: 'structural',
          style: 'modern',
          estimatedBricks: 48
        }
      },
      
      curved: {
        id: 'wall_curved',
        name: 'Curved Wall',
        description: 'Cylindrical curved wall section',
        shapes: [{
          shapeInstance: this.shapeLibrary.createShapeInstance('cylinder', { radius: 2, height: 3 }),
          operation: 'union',
          order: 0
        }],
        metadata: {
          category: 'structural',
          style: 'organic',
          estimatedBricks: 72
        }
      },

      arch: {
        id: 'wall_arch',
        name: 'Arch Wall',
        description: 'Wall with arched opening',
        shapes: [
          {
            shapeInstance: this.shapeLibrary.createShapeInstance('cube', { width: 4, height: 3, depth: 0.3 }),
            operation: 'union',
            order: 0
          },
          {
            shapeInstance: (() => {
              const instance = this.shapeLibrary.createShapeInstance('cylinder', { radius: 0.8, height: 0.4 });
              instance.position.set(0, -0.5, 0);
              instance.rotation.set(0, 0, Math.PI / 2);
              return instance;
            })(),
            operation: 'subtract',
            order: 1
          }
        ],
        metadata: {
          category: 'structural',
          style: 'classical',
          estimatedBricks: 36
        }
      }
    };

    return templates[type] || templates.straight;
  }
}

// Global wall builder instance
export const wallBuilder = new WallBuilder();