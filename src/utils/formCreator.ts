import * as THREE from 'three';
import { Brush, Evaluator, SUBTRACTION, ADDITION, INTERSECTION } from 'three-bvh-csg';

export interface FormParameters {
  width?: number;
  height?: number;
  depth?: number;
  radius?: number;
  segments?: number;
  isHollow?: boolean;
  wallThickness?: number; // For hollow forms
  customGeometry?: THREE.BufferGeometry; // For CSG-generated forms
}

export interface FormDefinition {
  id: string;
  name: string;
  description: string;
  category: 'basic';
  createGeometry: (parameters: FormParameters) => THREE.BufferGeometry;
  defaultParameters: FormParameters;
  icon?: string;
}

export interface FormInstance {
  id: string;
  formId: string;
  position: THREE.Vector3;
  rotation: THREE.Euler;
  scale: THREE.Vector3;
  parameters: FormParameters;
  name?: string;
  isHollow: boolean;
}

/**
 * Simple form creator for basic geometric shapes
 * Creates container forms where bricks can later be spawned
 * Uses CSG operations for true hollow geometry
 */
export class FormCreator {
  private forms: Map<string, FormDefinition> = new Map();
  private evaluator: Evaluator;

  constructor() {
    // Initialize CSG evaluator
    this.evaluator = new Evaluator();
    this.evaluator.attributes = ['position', 'normal'];
    this.evaluator.useGroups = false;
    
    this.initializeForms();
    console.log('📐 FormCreator: Initialized with CSG support');
  }

  private prepareGeometryForCSG(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
    const prepared = geometry.clone();
    
    // Ensure position attribute exists and is Float32Array
    if (!prepared.attributes.position) {
      throw new Error('Geometry missing position attribute');
    }
    if (prepared.attributes.position.array.constructor !== Float32Array) {
      const positions = prepared.attributes.position.array;
      prepared.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
    }
    
    // Ensure normal attribute exists and is Float32Array
    if (!prepared.attributes.normal) {
      prepared.computeVertexNormals();
    }
    if (prepared.attributes.normal.array.constructor !== Float32Array) {
      const normals = prepared.attributes.normal.array;
      prepared.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(normals), 3));
    }
    
    // Remove UV attribute if present (CSG compatibility)
    if (prepared.attributes.uv) {
      prepared.deleteAttribute('uv');
    }
    
    // Ensure proper index format
    if (prepared.index && prepared.index.array.constructor !== Uint32Array && prepared.index.array.constructor !== Uint16Array) {
      const indices = prepared.index.array;
      prepared.setIndex(new THREE.BufferAttribute(new Uint32Array(indices), 1));
    }
    
    // Force geometry update
    prepared.attributes.position.needsUpdate = true;
    prepared.attributes.normal.needsUpdate = true;
    if (prepared.index) prepared.index.needsUpdate = true;
    
    // Compute required properties
    prepared.computeBoundingBox();
    prepared.computeBoundingSphere();
    prepared.computeVertexNormals();
    
    return prepared;
  }

  private initializeForms(): void {
    // Cube form
    this.registerForm({
      id: 'cube',
      name: 'Cube',
      description: 'Basic rectangular cube form',
      category: 'basic',
      icon: '🧊',
      defaultParameters: {
        width: 2,
        height: 2,
        depth: 2,
        isHollow: false,
        wallThickness: 0.3
      },
      createGeometry: this.createCubeGeometry.bind(this)
    });

    // Sphere form
    this.registerForm({
      id: 'sphere',
      name: 'Sphere',
      description: 'Basic spherical form',
      category: 'basic',
      icon: '⚫',
      defaultParameters: {
        radius: 1.5,
        segments: 16,
        isHollow: false,
        wallThickness: 0.3
      },
      createGeometry: this.createSphereGeometry.bind(this)
    });

    // Cylinder form
    this.registerForm({
      id: 'cylinder',
      name: 'Cylinder',
      description: 'Basic cylindrical form',
      category: 'basic',
      icon: '🥫',
      defaultParameters: {
        radius: 1,
        height: 3,
        segments: 16,
        isHollow: false,
        wallThickness: 0.3
      },
      createGeometry: this.createCylinderGeometry.bind(this)
    });

    console.log('📐 FormCreator: Initialized with', this.forms.size, 'basic forms');
  }

  private createCubeGeometry(params: FormParameters): THREE.BufferGeometry {
    const { width = 2, height = 2, depth = 2, isHollow = false, wallThickness = 0.3 } = params;
    
    if (!isHollow) {
      // Solid cube
      return new THREE.BoxGeometry(width, height, depth);
    } else {
      // Hollow cube using CSG subtraction
      console.log('🧊 Creating hollow cube with CSG subtraction');
      
      // Create outer cube
      const outerGeometry = new THREE.BoxGeometry(width, height, depth);
      const preparedOuterGeometry = this.prepareGeometryForCSG(outerGeometry);
      const outerBrush = new Brush(preparedOuterGeometry);
      
      // Create inner cube (smaller)
      const innerWidth = Math.max(0.1, width - wallThickness * 2);
      const innerHeight = Math.max(0.1, height - wallThickness * 2);
      const innerDepth = Math.max(0.1, depth - wallThickness * 2);
      const innerGeometry = new THREE.BoxGeometry(innerWidth, innerHeight, innerDepth);
      const preparedInnerGeometry = this.prepareGeometryForCSG(innerGeometry);
      const innerBrush = new Brush(preparedInnerGeometry);
      
      try {
        // Perform CSG subtraction: outer - inner = hollow
        const resultBrush = this.evaluator.evaluate(outerBrush, innerBrush, SUBTRACTION);
        console.log('✅ CSG subtraction completed for hollow cube');
        
        // Clean up
        outerGeometry.dispose();
        innerGeometry.dispose();
        preparedOuterGeometry.dispose();
        preparedInnerGeometry.dispose();
        
        return resultBrush.geometry;
      } catch (error) {
        console.error('❌ CSG subtraction failed for cube:', error);
        // Fallback to outer geometry
        innerGeometry.dispose();
        preparedOuterGeometry.dispose();
        preparedInnerGeometry.dispose();
        return outerGeometry;
      }
    }
  }

  private createSphereGeometry(params: FormParameters): THREE.BufferGeometry {
    const { radius = 1.5, segments = 16, isHollow = false, wallThickness = 0.3 } = params;
    
    if (!isHollow) {
      // Solid sphere
      return new THREE.SphereGeometry(radius, segments, segments);
    } else {
      // Hollow sphere using CSG subtraction
      console.log('⚫ Creating hollow sphere with CSG subtraction');
      
      // Create outer sphere
      const outerGeometry = new THREE.SphereGeometry(radius, segments, segments);
      const preparedOuterGeometry = this.prepareGeometryForCSG(outerGeometry);
      const outerBrush = new Brush(preparedOuterGeometry);
      
      // Create inner sphere (smaller)
      const innerRadius = Math.max(0.1, radius - wallThickness);
      const innerGeometry = new THREE.SphereGeometry(innerRadius, segments, segments);
      const preparedInnerGeometry = this.prepareGeometryForCSG(innerGeometry);
      const innerBrush = new Brush(preparedInnerGeometry);
      
      try {
        // Perform CSG subtraction: outer - inner = hollow
        const resultBrush = this.evaluator.evaluate(outerBrush, innerBrush, SUBTRACTION);
        console.log('✅ CSG subtraction completed for hollow sphere');
        
        // Clean up
        outerGeometry.dispose();
        innerGeometry.dispose();
        preparedOuterGeometry.dispose();
        preparedInnerGeometry.dispose();
        
        return resultBrush.geometry;
      } catch (error) {
        console.error('❌ CSG subtraction failed for sphere:', error);
        // Fallback to outer geometry
        innerGeometry.dispose();
        preparedOuterGeometry.dispose();
        preparedInnerGeometry.dispose();
        return outerGeometry;
      }
    }
  }

  private createCylinderGeometry(params: FormParameters): THREE.BufferGeometry {
    const { radius = 1, height = 3, segments = 16, isHollow = false, wallThickness = 0.3 } = params;
    
    if (!isHollow) {
      // Solid cylinder
      return new THREE.CylinderGeometry(radius, radius, height, segments);
    } else {
      // Hollow cylinder using CSG subtraction
      console.log('🥫 Creating hollow cylinder with CSG subtraction');
      
      // Create outer cylinder
      const outerGeometry = new THREE.CylinderGeometry(radius, radius, height, segments);
      const preparedOuterGeometry = this.prepareGeometryForCSG(outerGeometry);
      const outerBrush = new Brush(preparedOuterGeometry);
      
      // Create inner cylinder (smaller radius, slightly taller to ensure complete subtraction)
      const innerRadius = Math.max(0.1, radius - wallThickness);
      const innerHeight = height + 0.1; // Slightly taller to ensure clean subtraction
      const innerGeometry = new THREE.CylinderGeometry(innerRadius, innerRadius, innerHeight, segments);
      const preparedInnerGeometry = this.prepareGeometryForCSG(innerGeometry);
      const innerBrush = new Brush(preparedInnerGeometry);
      
      try {
        // Perform CSG subtraction: outer - inner = hollow
        const resultBrush = this.evaluator.evaluate(outerBrush, innerBrush, SUBTRACTION);
        console.log('✅ CSG subtraction completed for hollow cylinder');
        
        // Clean up
        outerGeometry.dispose();
        innerGeometry.dispose();
        preparedOuterGeometry.dispose();
        preparedInnerGeometry.dispose();
        
        return resultBrush.geometry;
      } catch (error) {
        console.error('❌ CSG subtraction failed for cylinder:', error);
        // Fallback to outer geometry
        innerGeometry.dispose();
        preparedOuterGeometry.dispose();
        preparedInnerGeometry.dispose();
        return outerGeometry;
      }
    }
  }

  registerForm(form: FormDefinition): void {
    this.forms.set(form.id, form);
    console.log(`📐 FormCreator: Registered form "${form.name}" (${form.id})`);
  }

  /**
   * Perform CSG operations between two forms
   * @param formA First form geometry 
   * @param formB Second form geometry
   * @param operation CSG operation type
   * @returns Combined geometry or null if operation fails
   */
  performCSGOperation(
    formA: THREE.BufferGeometry, 
    formB: THREE.BufferGeometry, 
    operation: 'union' | 'subtract' | 'intersect'
  ): THREE.BufferGeometry | null {
    console.log(`🔧 Performing CSG ${operation} operation`);
    
    try {
      // Prepare geometries for CSG
      const preparedA = this.prepareGeometryForCSG(formA);
      const preparedB = this.prepareGeometryForCSG(formB);
      
      // Create brushes
      const brushA = new Brush(preparedA);
      const brushB = new Brush(preparedB);
      
      // Perform operation
      let resultBrush: Brush;
      switch (operation) {
        case 'union':
          resultBrush = this.evaluator.evaluate(brushA, brushB, ADDITION);
          break;
        case 'subtract':
          resultBrush = this.evaluator.evaluate(brushA, brushB, SUBTRACTION);
          break;
        case 'intersect':
          resultBrush = this.evaluator.evaluate(brushA, brushB, INTERSECTION);
          break;
        default:
          throw new Error(`Unknown CSG operation: ${operation}`);
      }
      
      console.log(`✅ CSG ${operation} operation completed successfully`);
      
      // Clean up
      preparedA.dispose();
      preparedB.dispose();
      
      return resultBrush.geometry;
    } catch (error) {
      console.error(`❌ CSG ${operation} operation failed:`, error);
      return null;
    }
  }

  getForm(id: string): FormDefinition | undefined {
    return this.forms.get(id);
  }

  getAllForms(): FormDefinition[] {
    return Array.from(this.forms.values());
  }

  getFormsByCategory(category: string): FormDefinition[] {
    return Array.from(this.forms.values()).filter(form => form.category === category);
  }

  createFormGeometry(formId: string, parameters: Partial<FormParameters> = {}): THREE.BufferGeometry | null {
    // Handle custom CSG geometries
    if (formId === 'custom-csg' && parameters.customGeometry) {
      console.log('🔧 FormCreator: Using custom CSG geometry');
      return parameters.customGeometry;
    }

    const form = this.getForm(formId);
    if (!form) {
      console.error(`❌ FormCreator: Form "${formId}" not found`);
      return null;
    }

    const finalParams = { ...form.defaultParameters, ...parameters };
    console.log(`🏗️ FormCreator: Creating ${form.name} geometry with params:`, finalParams);
    
    try {
      return form.createGeometry(finalParams);
    } catch (error) {
      console.error(`❌ FormCreator: Failed to create geometry for ${form.name}:`, error);
      return null;
    }
  }

  createFormInstance(
    formId: string, 
    position: THREE.Vector3 = new THREE.Vector3(0, 0, 0),
    rotation: THREE.Euler = new THREE.Euler(0, 0, 0),
    scale: THREE.Vector3 = new THREE.Vector3(1, 1, 1),
    parameters: Partial<FormParameters> = {}
  ): FormInstance | null {
    const form = this.getForm(formId);
    if (!form) {
      console.error(`❌ FormCreator: Cannot create instance of unknown form "${formId}"`);
      return null;
    }

    const finalParams = { ...form.defaultParameters, ...parameters };
    
    return {
      id: `form_${formId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      formId,
      position: position.clone(),
      rotation: rotation.clone(),
      scale: scale.clone(),
      parameters: finalParams,
      name: `${form.name} ${Date.now()}`,
      isHollow: finalParams.isHollow || false
    };
  }
}

// Global form creator instance
export const formCreator = new FormCreator();