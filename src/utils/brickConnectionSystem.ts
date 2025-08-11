import * as THREE from 'three';

export type ConnectionType = 'male' | 'female' | 'neutral';
export type ConnectionAxis = 'x' | 'y' | 'z'; // Which axis the connection faces

export interface ConnectionPoint {
  id: string;
  type: ConnectionType;
  axis: ConnectionAxis;
  localPosition: THREE.Vector3; // Position relative to brick center
  localRotation: THREE.Euler;   // Rotation relative to brick
  strength: number; // Structural strength (0-1)
  isConnected: boolean;
  connectedTo?: string; // ID of connected brick
}

export interface RevolutionaryBrick {
  id: string;
  position: THREE.Vector3;
  rotation: THREE.Euler;
  brickType: string;
  connections: ConnectionPoint[];
  structuralIntegrity: number; // Overall structural strength (0-1)
  loadBearing: boolean; // Can this brick support weight?
}

export interface ConnectionRule {
  sourceType: ConnectionType;
  targetType: ConnectionType;
  sourceAxis: ConnectionAxis;
  targetAxis: ConnectionAxis;
  rotationAlignment: number; // Required rotation difference in radians
  strengthMultiplier: number; // How this connection affects structural strength
}

export interface StructuralAnalysis {
  totalBricks: number;
  connectedBricks: number;
  structuralIntegrity: number;
  loadPaths: LoadPath[];
  weakPoints: THREE.Vector3[];
  recommendations: string[];
}

export interface LoadPath {
  bricks: string[]; // Chain of brick IDs carrying load
  strength: number;
  startPoint: THREE.Vector3;
  endPoint: THREE.Vector3;
}

/**
 * Revolutionary Brick Connection System
 * Each brick has 3 male and 3 female connection points for maximum structural flexibility
 */
export class BrickConnectionSystem {
  private connectionRules: ConnectionRule[];
  private bricks: Map<string, RevolutionaryBrick> = new Map();
  
  // Standard dimensions for revolutionary bricks
  private readonly BRICK_DIMENSIONS = {
    width: 0.4,
    height: 0.2,
    depth: 0.2
  };

  constructor() {
    this.connectionRules = [];
    this.initializeConnectionRules();
    console.log('🔗 Revolutionary Brick Connection System initialized');
  }

  private initializeConnectionRules() {
    // Define how different connection types can connect
    this.connectionRules = [
      // Male to Female connections (standard strong connections)
      { sourceType: 'male', targetType: 'female', sourceAxis: 'y', targetAxis: 'y', rotationAlignment: 0, strengthMultiplier: 1.0 },
      { sourceType: 'male', targetType: 'female', sourceAxis: 'x', targetAxis: 'x', rotationAlignment: Math.PI, strengthMultiplier: 0.8 },
      { sourceType: 'male', targetType: 'female', sourceAxis: 'z', targetAxis: 'z', rotationAlignment: Math.PI, strengthMultiplier: 0.8 },
      
      // Female to Male connections (reverse compatibility)
      { sourceType: 'female', targetType: 'male', sourceAxis: 'y', targetAxis: 'y', rotationAlignment: 0, strengthMultiplier: 1.0 },
      { sourceType: 'female', targetType: 'male', sourceAxis: 'x', targetAxis: 'x', rotationAlignment: Math.PI, strengthMultiplier: 0.8 },
      { sourceType: 'female', targetType: 'male', sourceAxis: 'z', targetAxis: 'z', rotationAlignment: Math.PI, strengthMultiplier: 0.8 },
      
      // Neutral connections (can connect to both male and female with moderate strength)
      { sourceType: 'neutral', targetType: 'male', sourceAxis: 'y', targetAxis: 'y', rotationAlignment: 0, strengthMultiplier: 0.7 },
      { sourceType: 'neutral', targetType: 'female', sourceAxis: 'y', targetAxis: 'y', rotationAlignment: 0, strengthMultiplier: 0.7 },
      { sourceType: 'neutral', targetType: 'male', sourceAxis: 'x', targetAxis: 'x', rotationAlignment: Math.PI, strengthMultiplier: 0.6 },
      { sourceType: 'neutral', targetType: 'female', sourceAxis: 'x', targetAxis: 'x', rotationAlignment: Math.PI, strengthMultiplier: 0.6 },
      { sourceType: 'neutral', targetType: 'male', sourceAxis: 'z', targetAxis: 'z', rotationAlignment: Math.PI, strengthMultiplier: 0.6 },
      { sourceType: 'neutral', targetType: 'female', sourceAxis: 'z', targetAxis: 'z', rotationAlignment: Math.PI, strengthMultiplier: 0.6 },
      
      // Male/Female to Neutral connections (reverse compatibility)
      { sourceType: 'male', targetType: 'neutral', sourceAxis: 'y', targetAxis: 'y', rotationAlignment: 0, strengthMultiplier: 0.7 },
      { sourceType: 'female', targetType: 'neutral', sourceAxis: 'y', targetAxis: 'y', rotationAlignment: 0, strengthMultiplier: 0.7 },
      { sourceType: 'male', targetType: 'neutral', sourceAxis: 'x', targetAxis: 'x', rotationAlignment: Math.PI, strengthMultiplier: 0.6 },
      { sourceType: 'female', targetType: 'neutral', sourceAxis: 'x', targetAxis: 'x', rotationAlignment: Math.PI, strengthMultiplier: 0.6 },
      { sourceType: 'male', targetType: 'neutral', sourceAxis: 'z', targetAxis: 'z', rotationAlignment: Math.PI, strengthMultiplier: 0.6 },
      { sourceType: 'female', targetType: 'neutral', sourceAxis: 'z', targetAxis: 'z', rotationAlignment: Math.PI, strengthMultiplier: 0.6 },
      
      // Neutral to Neutral connections (weakest but most flexible)
      { sourceType: 'neutral', targetType: 'neutral', sourceAxis: 'y', targetAxis: 'y', rotationAlignment: 0, strengthMultiplier: 0.5 },
      { sourceType: 'neutral', targetType: 'neutral', sourceAxis: 'x', targetAxis: 'x', rotationAlignment: Math.PI, strengthMultiplier: 0.4 },
      { sourceType: 'neutral', targetType: 'neutral', sourceAxis: 'z', targetAxis: 'z', rotationAlignment: Math.PI, strengthMultiplier: 0.4 },
      
      // Cross-axis connections for complex geometries
      { sourceType: 'male', targetType: 'female', sourceAxis: 'x', targetAxis: 'y', rotationAlignment: Math.PI/2, strengthMultiplier: 0.5 },
      { sourceType: 'neutral', targetType: 'neutral', sourceAxis: 'x', targetAxis: 'y', rotationAlignment: Math.PI/2, strengthMultiplier: 0.3 },
    ];
  }

  /**
   * Create a revolutionary brick with connection points
   * Default: 2 male, 2 female, 2 neutral connection points for maximum flexibility
   */
  createRevolutionaryBrick(
    id: string, 
    position: THREE.Vector3, 
    rotation: THREE.Euler = new THREE.Euler(0, 0, 0),
    brickType: string = 'clay-sustainable',
    connectionConfig?: {
      male?: number;
      female?: number; 
      neutral?: number;
    }
  ): RevolutionaryBrick {
    
    const connections: ConnectionPoint[] = [];
    
    // Default configuration: 2 male, 2 female, 2 neutral
    const config = {
      male: 2,
      female: 2,
      neutral: 2,
      ...connectionConfig
    };

    // Define all possible connection positions (6 faces of a brick)
    const allConnectionPositions: { axis: ConnectionAxis, offset: THREE.Vector3, label: string }[] = [
      { axis: 'y', offset: new THREE.Vector3(0, this.BRICK_DIMENSIONS.height / 2, 0), label: 'Top' },
      { axis: 'y', offset: new THREE.Vector3(0, -this.BRICK_DIMENSIONS.height / 2, 0), label: 'Bottom' },
      { axis: 'x', offset: new THREE.Vector3(this.BRICK_DIMENSIONS.width / 2, 0, 0), label: 'Right' },
      { axis: 'x', offset: new THREE.Vector3(-this.BRICK_DIMENSIONS.width / 2, 0, 0), label: 'Left' },
      { axis: 'z', offset: new THREE.Vector3(0, 0, this.BRICK_DIMENSIONS.depth / 2), label: 'Front' },
      { axis: 'z', offset: new THREE.Vector3(0, 0, -this.BRICK_DIMENSIONS.depth / 2), label: 'Back' }
    ];

    let positionIndex = 0;

    // Add male connections
    for (let i = 0; i < config.male && positionIndex < allConnectionPositions.length; i++) {
      const pos = allConnectionPositions[positionIndex++];
      connections.push({
        id: `${id}_male_${i}`,
        type: 'male',
        axis: pos.axis,
        localPosition: pos.offset.clone(),
        localRotation: this.getConnectionRotation(pos.axis, 'male'),
        strength: 1.0,
        isConnected: false
      });
    }

    // Add female connections
    for (let i = 0; i < config.female && positionIndex < allConnectionPositions.length; i++) {
      const pos = allConnectionPositions[positionIndex++];
      connections.push({
        id: `${id}_female_${i}`,
        type: 'female',
        axis: pos.axis,
        localPosition: pos.offset.clone(),
        localRotation: this.getConnectionRotation(pos.axis, 'female'),
        strength: 1.0,
        isConnected: false
      });
    }

    // Add neutral connections
    for (let i = 0; i < config.neutral && positionIndex < allConnectionPositions.length; i++) {
      const pos = allConnectionPositions[positionIndex++];
      connections.push({
        id: `${id}_neutral_${i}`,
        type: 'neutral',
        axis: pos.axis,
        localPosition: pos.offset.clone(),
        localRotation: this.getConnectionRotation(pos.axis, 'neutral'),
        strength: 0.8, // Neutral connections are slightly weaker by default
        isConnected: false
      });
    }

    const brick: RevolutionaryBrick = {
      id,
      position: position.clone(),
      rotation: rotation.clone(),
      brickType,
      connections,
      structuralIntegrity: 1.0,
      loadBearing: true
    };

    this.bricks.set(id, brick);
    
    console.log(`🧱 Created revolutionary brick ${id} with ${connections.length} connection points`);
    return brick;
  }

  /**
   * Get the rotation for a connection point based on its axis and type
   */
  private getConnectionRotation(axis: ConnectionAxis, type: ConnectionType): THREE.Euler {
    const rotations: Record<ConnectionAxis, Record<ConnectionType, THREE.Euler>> = {
      'x': {
        'male': new THREE.Euler(0, 0, Math.PI / 2),
        'female': new THREE.Euler(0, 0, -Math.PI / 2),
        'neutral': new THREE.Euler(0, 0, 0) // Neutral uses default orientation
      },
      'y': {
        'male': new THREE.Euler(0, 0, 0),
        'female': new THREE.Euler(Math.PI, 0, 0),
        'neutral': new THREE.Euler(Math.PI / 2, 0, 0) // Neutral uses 90° rotation
      },
      'z': {
        'male': new THREE.Euler(Math.PI / 2, 0, 0),
        'female': new THREE.Euler(-Math.PI / 2, 0, 0),
        'neutral': new THREE.Euler(0, Math.PI / 2, 0) // Neutral uses Y-axis rotation
      }
    };

    return rotations[axis][type];
  }

  /**
   * Attempt to connect two bricks at specific connection points
   */
  connectBricks(
    brick1Id: string, 
    connection1Id: string, 
    brick2Id: string, 
    connection2Id: string
  ): boolean {
    const brick1 = this.bricks.get(brick1Id);
    const brick2 = this.bricks.get(brick2Id);

    if (!brick1 || !brick2) {
      console.error(`❌ One or both bricks not found: ${brick1Id}, ${brick2Id}`);
      return false;
    }

    const conn1 = brick1.connections.find(c => c.id === connection1Id);
    const conn2 = brick2.connections.find(c => c.id === connection2Id);

    if (!conn1 || !conn2) {
      console.error(`❌ One or both connections not found: ${connection1Id}, ${connection2Id}`);
      return false;
    }

    // Check if connection is valid
    if (!this.isValidConnection(conn1, conn2, brick1, brick2)) {
      console.warn(`⚠️ Invalid connection attempt between ${connection1Id} and ${connection2Id}`);
      return false;
    }

    // Check if connections are already in use
    if (conn1.isConnected || conn2.isConnected) {
      console.warn(`⚠️ One or both connections already in use: ${connection1Id}, ${connection2Id}`);
      return false;
    }

    // Establish connection
    conn1.isConnected = true;
    conn1.connectedTo = brick2Id;
    conn2.isConnected = true;
    conn2.connectedTo = brick1Id;

    // Update structural integrity
    this.updateStructuralIntegrity(brick1Id);
    this.updateStructuralIntegrity(brick2Id);

    console.log(`✅ Connected ${connection1Id} to ${connection2Id}`);
    return true;
  }

  /**
   * Check if two connection points can be connected
   */
  private isValidConnection(
    conn1: ConnectionPoint, 
    conn2: ConnectionPoint, 
    brick1: RevolutionaryBrick, 
    brick2: RevolutionaryBrick
  ): boolean {
    // For male-female connections, they must be opposite types
    // For neutral connections, they can connect to any type
    if (conn1.type === conn2.type && 
        conn1.type !== 'neutral' && 
        conn2.type !== 'neutral') {
      return false;
    }

    // Check if there's a valid connection rule
    const rule = this.connectionRules.find(r => 
      (r.sourceType === conn1.type && r.targetType === conn2.type && 
       r.sourceAxis === conn1.axis && r.targetAxis === conn2.axis) ||
      (r.sourceType === conn2.type && r.targetType === conn1.type && 
       r.sourceAxis === conn2.axis && r.targetAxis === conn1.axis)
    );

    if (!rule) {
      return false;
    }

    // Check spatial alignment (simplified)
    const worldPos1 = this.getWorldConnectionPosition(conn1, brick1);
    const worldPos2 = this.getWorldConnectionPosition(conn2, brick2);
    const distance = worldPos1.distanceTo(worldPos2);

    // Connections must be very close to each other
    const tolerance = 0.05; // 5cm tolerance
    return distance <= tolerance;
  }

  /**
   * Get the world position of a connection point
   */
  private getWorldConnectionPosition(connection: ConnectionPoint, brick: RevolutionaryBrick): THREE.Vector3 {
    const localPos = connection.localPosition.clone();
    
    // Apply brick rotation
    localPos.applyEuler(brick.rotation);
    
    // Add brick position
    localPos.add(brick.position);
    
    return localPos;
  }

  /**
   * Update structural integrity for a brick based on its connections
   */
  private updateStructuralIntegrity(brickId: string) {
    const brick = this.bricks.get(brickId);
    if (!brick) return;

    const connectedCount = brick.connections.filter(c => c.isConnected).length;
    const totalConnections = brick.connections.length;
    
    // Base integrity increases with number of connections
    const connectionRatio = connectedCount / totalConnections;
    
    // Calculate weighted integrity based on connection types
    let weightedIntegrity = 0;
    let totalWeight = 0;

    brick.connections.forEach(conn => {
      if (conn.isConnected) {
        const rule = this.connectionRules.find(r => 
          (r.sourceType === conn.type && r.sourceAxis === conn.axis) ||
          (r.targetType === conn.type && r.targetAxis === conn.axis)
        );
        const weight = rule ? rule.strengthMultiplier : 0.5;
        weightedIntegrity += weight;
        totalWeight += weight;
      }
    });

    if (totalWeight > 0) {
      brick.structuralIntegrity = Math.min(1.0, (weightedIntegrity / totalWeight) * (0.5 + connectionRatio * 0.5));
    } else {
      brick.structuralIntegrity = 0.1; // Minimum integrity for unconnected brick
    }

    // Update load bearing capacity
    brick.loadBearing = brick.structuralIntegrity > 0.6;
  }

  /**
   * Auto-connect bricks within a specified area
   */
  autoConnectBricks(center: THREE.Vector3, radius: number): number {
    const bricksInArea = Array.from(this.bricks.values()).filter(brick => 
      brick.position.distanceTo(center) <= radius
    );

    let connectionsCreated = 0;

    for (let i = 0; i < bricksInArea.length; i++) {
      for (let j = i + 1; j < bricksInArea.length; j++) {
        const brick1 = bricksInArea[i];
        const brick2 = bricksInArea[j];

        // Try to connect available connection points
        for (const conn1 of brick1.connections) {
          if (conn1.isConnected) continue;
          
          for (const conn2 of brick2.connections) {
            if (conn2.isConnected) continue;
            
            if (this.connectBricks(brick1.id, conn1.id, brick2.id, conn2.id)) {
              connectionsCreated++;
              break; // Only make one connection per brick pair in this pass
            }
          }
        }
      }
    }

    console.log(`🔗 Auto-connected ${connectionsCreated} brick pairs in area`);
    return connectionsCreated;
  }

  /**
   * Analyze the structural integrity of the entire brick system
   */
  analyzeStructure(): StructuralAnalysis {
    const allBricks = Array.from(this.bricks.values());
    const connectedBricks = allBricks.filter(brick => 
      brick.connections.some(conn => conn.isConnected)
    );

    // Calculate overall structural integrity
    const averageIntegrity = allBricks.reduce((sum, brick) => 
      sum + brick.structuralIntegrity, 0) / allBricks.length;

    // Find weak points (bricks with low integrity)
    const weakPoints = allBricks
      .filter(brick => brick.structuralIntegrity < 0.3)
      .map(brick => brick.position);

    // Analyze load paths (simplified)
    const loadPaths = this.calculateLoadPaths();

    // Generate recommendations
    const recommendations = this.generateStructuralRecommendations(allBricks, weakPoints);

    return {
      totalBricks: allBricks.length,
      connectedBricks: connectedBricks.length,
      structuralIntegrity: averageIntegrity,
      loadPaths,
      weakPoints,
      recommendations
    };
  }

  /**
   * Calculate load bearing paths through the structure
   */
  private calculateLoadPaths(): LoadPath[] {
    const paths: LoadPath[] = [];
    const loadBearingBricks = Array.from(this.bricks.values()).filter(b => b.loadBearing);

    // Simplified load path calculation
    // In a real implementation, this would trace actual structural connections
    for (const brick of loadBearingBricks) {
      const connectedBricks = brick.connections
        .filter(conn => conn.isConnected && conn.connectedTo)
        .map(conn => conn.connectedTo!)
        .filter(id => this.bricks.get(id)?.loadBearing);

      if (connectedBricks.length > 0) {
        paths.push({
          bricks: [brick.id, ...connectedBricks],
          strength: brick.structuralIntegrity,
          startPoint: brick.position.clone(),
          endPoint: this.bricks.get(connectedBricks[0])!.position.clone()
        });
      }
    }

    return paths;
  }

  /**
   * Generate structural recommendations
   */
  private generateStructuralRecommendations(bricks: RevolutionaryBrick[], weakPoints: THREE.Vector3[]): string[] {
    const recommendations: string[] = [];

    if (weakPoints.length > 0) {
      recommendations.push(`⚠️ ${weakPoints.length} weak structural points detected. Consider adding supporting bricks.`);
    }

    const unconnectedBricks = bricks.filter(brick => 
      !brick.connections.some(conn => conn.isConnected)
    );

    if (unconnectedBricks.length > 0) {
      recommendations.push(`🔗 ${unconnectedBricks.length} unconnected bricks. Improve structural integrity by connecting them.`);
    }

    const averageConnections = bricks.reduce((sum, brick) => 
      sum + brick.connections.filter(c => c.isConnected).length, 0) / bricks.length;

    if (averageConnections < 2) {
      recommendations.push(`📈 Low average connections per brick (${averageConnections.toFixed(1)}). Aim for 3+ connections per brick.`);
    }

    if (recommendations.length === 0) {
      recommendations.push(`✅ Structure appears stable with good connection integrity.`);
    }

    return recommendations;
  }

  /**
   * Get all bricks in the system
   */
  getAllBricks(): RevolutionaryBrick[] {
    return Array.from(this.bricks.values());
  }

  /**
   * Get a specific brick by ID
   */
  getBrick(id: string): RevolutionaryBrick | undefined {
    return this.bricks.get(id);
  }

  /**
   * Remove a brick and disconnect all its connections
   */
  removeBrick(id: string): boolean {
    const brick = this.bricks.get(id);
    if (!brick) return false;

    // Disconnect all connections
    brick.connections.forEach(conn => {
      if (conn.isConnected && conn.connectedTo) {
        const connectedBrick = this.bricks.get(conn.connectedTo);
        if (connectedBrick) {
          // Find and disconnect the corresponding connection
          const correspondingConn = connectedBrick.connections.find(c => c.connectedTo === id);
          if (correspondingConn) {
            correspondingConn.isConnected = false;
            correspondingConn.connectedTo = undefined;
          }
          this.updateStructuralIntegrity(connectedBrick.id);
        }
      }
    });

    this.bricks.delete(id);
    console.log(`🗑️ Removed brick ${id} and disconnected all connections`);
    return true;
  }
}

// Global brick connection system instance
export const brickConnectionSystem = new BrickConnectionSystem();

// Types already exported above - no need for re-exports since they're exported inline