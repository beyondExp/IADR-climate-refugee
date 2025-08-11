import * as THREE from 'three';
import { Brush } from 'three-bvh-csg';

export interface ShapeParameters {
  width?: number;
  height?: number;
  depth?: number;
  radius?: number;
  segments?: number;
  radiusTop?: number;
  radiusBottom?: number;
  [key: string]: any;
}

export interface ShapeDefinition {
  id: string;
  name: string;
  description: string;
  category: 'basic' | 'architectural' | 'organic';
  createGeometry: (parameters: ShapeParameters) => THREE.BufferGeometry;
  defaultParameters: ShapeParameters;
  icon?: string;
}

export interface ShapeInstance {
  id: string;
  shapeId: string;
  position: THREE.Vector3;
  rotation: THREE.Euler;
  scale: THREE.Vector3;
  parameters: ShapeParameters;
  name?: string;
}

/**
 * Library of geometric primitives for building creation
 * Each shape can be combined via CSG to create complex walls and structures
 */
export class ShapeLibrary {
  private shapes: Map<string, ShapeDefinition> = new Map();

  constructor() {
    this.initializeShapes();
  }

  private initializeShapes() {
    // BASIC SHAPES
    this.registerShape({
      id: 'cube',
      name: 'Cube',
      description: 'Basic rectangular building block',
      category: 'basic',
      defaultParameters: { width: 2, height: 2, depth: 2 },
      createGeometry: (params) => new THREE.BoxGeometry(
        params.width || 2, 
        params.height || 2, 
        params.depth || 2
      )
    });

    this.registerShape({
      id: 'sphere',
      name: 'Sphere',
      description: 'Spherical form for curved walls and domes',
      category: 'basic',
      defaultParameters: { radius: 1, segments: 32 },
      createGeometry: (params) => new THREE.SphereGeometry(
        params.radius || 1,
        params.segments || 32,
        params.segments || 32
      )
    });

    this.registerShape({
      id: 'cylinder',
      name: 'Cylinder',
      description: 'Cylindrical columns and round structures',
      category: 'basic',
      defaultParameters: { radius: 1, height: 2, segments: 32 },
      createGeometry: (params) => new THREE.CylinderGeometry(
        params.radius || 1,
        params.radius || 1,
        params.height || 2,
        params.segments || 32
      )
    });

    // ARCHITECTURAL SHAPES
    this.registerShape({
      id: 'arch',
      name: 'Arch',
      description: 'Classical arch for doorways and windows',
      category: 'architectural',
      defaultParameters: { width: 3, height: 4, depth: 0.5, segments: 16 },
      createGeometry: (params) => this.createArchGeometry(params)
    });

    this.registerShape({
      id: 'cone',
      name: 'Cone',
      description: 'Conical towers and spires',
      category: 'architectural',
      defaultParameters: { radiusBottom: 1, radiusTop: 0, height: 2, segments: 16 },
      createGeometry: (params) => new THREE.ConeGeometry(
        params.radiusBottom || 1,
        params.height || 2,
        params.segments || 16
      )
    });

    this.registerShape({
      id: 'wedge',
      name: 'Wedge',
      description: 'Triangular wedge for roofs and ramps',
      category: 'architectural',
      defaultParameters: { width: 2, height: 1, depth: 2 },
      createGeometry: (params) => this.createWedgeGeometry(params)
    });

    // ORGANIC SHAPES
    this.registerShape({
      id: 'torus',
      name: 'Torus',
      description: 'Ring-shaped structures',
      category: 'organic',
      defaultParameters: { radius: 2, tube: 0.5, segments: 16 },
      createGeometry: (params) => new THREE.TorusGeometry(
        params.radius || 2,
        params.tube || 0.5,
        params.segments || 16,
        params.segments || 16
      )
    });

    console.log(`🏗️ ShapeLibrary initialized with ${this.shapes.size} shapes`);
  }

  private createArchGeometry(params: ShapeParameters): THREE.BufferGeometry {
    const width = params.width || 3;
    const height = params.height || 4;
    const depth = params.depth || 0.5;
    const segments = params.segments || 16;

    // Create arch using CSG: Rectangle - Semicircle
    const outerBox = new THREE.BoxGeometry(width, height, depth);
    const innerRadius = width * 0.4;
    const innerSphere = new THREE.SphereGeometry(innerRadius, segments, segments/2, 0, Math.PI * 2, 0, Math.PI);
    
    // Position the sphere to cut the arch opening
    innerSphere.translate(0, -height/2 + innerRadius, 0);
    
    return outerBox; // For now, return box - will enhance with CSG later
  }

  private createWedgeGeometry(params: ShapeParameters): THREE.BufferGeometry {
    const width = params.width || 2;
    const height = params.height || 1;
    const depth = params.depth || 2;

    // Create triangular wedge
    const vertices = new Float32Array([
      // Front face (triangle)
      -width/2, -height/2, depth/2,
      width/2, -height/2, depth/2,
      0, height/2, depth/2,
      
      // Back face (triangle)
      -width/2, -height/2, -depth/2,
      0, height/2, -depth/2,
      width/2, -height/2, -depth/2,
      
      // Bottom face (rectangle)
      -width/2, -height/2, depth/2,
      -width/2, -height/2, -depth/2,
      width/2, -height/2, -depth/2,
      width/2, -height/2, depth/2,
      
      // Left slope
      -width/2, -height/2, depth/2,
      0, height/2, depth/2,
      0, height/2, -depth/2,
      -width/2, -height/2, -depth/2,
      
      // Right slope
      width/2, -height/2, depth/2,
      width/2, -height/2, -depth/2,
      0, height/2, -depth/2,
      0, height/2, depth/2
    ]);

    const indices = new Uint16Array([
      // Front triangle
      0, 1, 2,
      // Back triangle
      3, 4, 5,
      // Bottom rectangle
      6, 7, 8, 6, 8, 9,
      // Left slope
      10, 11, 12, 10, 12, 13,
      // Right slope
      14, 15, 16, 14, 16, 17
    ]);

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    geometry.setIndex(Array.from(indices));
    geometry.computeVertexNormals();
    
    return geometry;
  }

  registerShape(shape: ShapeDefinition) {
    this.shapes.set(shape.id, shape);
  }

  getShape(id: string): ShapeDefinition | undefined {
    return this.shapes.get(id);
  }

  getAllShapes(): ShapeDefinition[] {
    return Array.from(this.shapes.values());
  }

  getShapesByCategory(category: string): ShapeDefinition[] {
    return Array.from(this.shapes.values()).filter(shape => shape.category === category);
  }

  createShapeGeometry(shapeId: string, parameters?: ShapeParameters): THREE.BufferGeometry | null {
    const shape = this.getShape(shapeId);
    if (!shape) {
      console.error(`❌ Shape not found: ${shapeId}`);
      return null;
    }

    const params = { ...shape.defaultParameters, ...parameters };
    return shape.createGeometry(params);
  }

  createShapeBrush(shapeId: string, parameters?: ShapeParameters): Brush | null {
    const geometry = this.createShapeGeometry(shapeId, parameters);
    if (!geometry) return null;

    const brush = new Brush(geometry);
    brush.userData = { shapeId, parameters };
    return brush;
  }

  createShapeInstance(shapeId: string, parameters?: ShapeParameters): ShapeInstance {
    return {
      id: `${shapeId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      shapeId,
      position: new THREE.Vector3(0, 0, 0),
      rotation: new THREE.Euler(0, 0, 0),
      scale: new THREE.Vector3(1, 1, 1),
      parameters: { ...this.getShape(shapeId)?.defaultParameters, ...parameters }
    };
  }
}

// Global shape library instance
export const shapeLibrary = new ShapeLibrary();

// Types already exported above - no need for re-exports since they're exported inline