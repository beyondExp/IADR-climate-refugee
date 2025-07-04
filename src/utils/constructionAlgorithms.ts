import type { Position3D, BrickTypeKey, Anchor, ConstructionType } from '../types';
import { brickTypes } from './brickTypes';

export interface ConstructionPath {
  start: Position3D;
  end: Position3D;
  brickPositions: Position3D[];
  brickRotations: Position3D[];
  totalBricks: number;
  constructionType: ConstructionType;
}

export interface StructuralNode {
  position: Position3D;
  anchor: Anchor;
  connections: StructuralNode[];
  supportCapacity: number;
  isFoundation: boolean;
}

export interface ConstructionRule {
  minDistance: number;
  maxDistance: number;
  requiredSupport: boolean;
  allowedTypes: ConstructionType[];
  brickPattern: 'linear' | 'staggered' | 'arch' | 'column';
}

// Construction rules based on structural engineering principles
export const constructionRules: Record<ConstructionType, ConstructionRule> = {
  foundation: {
    minDistance: 0.3,
    maxDistance: 10.0,
    requiredSupport: false,
    allowedTypes: ['wall', 'column'],
    brickPattern: 'linear'
  },
  wall: {
    minDistance: 0.5,
    maxDistance: 8.0,
    requiredSupport: true,
    allowedTypes: ['wall', 'beam', 'arch'],
    brickPattern: 'staggered'
  },
  column: {
    minDistance: 0.2,
    maxDistance: 4.0,
    requiredSupport: true,
    allowedTypes: ['beam', 'arch'],
    brickPattern: 'column'
  },
  beam: {
    minDistance: 1.0,
    maxDistance: 6.0,
    requiredSupport: true,
    allowedTypes: ['wall', 'column'],
    brickPattern: 'linear'
  },
  arch: {
    minDistance: 1.5,
    maxDistance: 5.0,
    requiredSupport: true,
    allowedTypes: ['wall'],
    brickPattern: 'arch'
  }
};

// Calculate distance between two 3D points
export function calculateDistance(point1: Position3D, point2: Position3D): number {
  return Math.sqrt(
    Math.pow(point2.x - point1.x, 2) +
    Math.pow(point2.y - point1.y, 2) +
    Math.pow(point2.z - point1.z, 2)
  );
}

// Normalize a 3D vector
export function normalize(vector: Position3D): Position3D {
  const length = Math.sqrt(vector.x * vector.x + vector.y * vector.y + vector.z * vector.z);
  if (length === 0) return { x: 0, y: 0, z: 0 };
  return {
    x: vector.x / length,
    y: vector.y / length,
    z: vector.z / length
  };
}

// Calculate optimal brick placement for linear construction
export function calculateLinearPath(
  start: Position3D,
  end: Position3D,
  brickType: BrickTypeKey,
  constructionType: ConstructionType = 'wall'
): ConstructionPath {
  const brick = brickTypes[brickType];
  const distance = calculateDistance(start, end);
  const rule = constructionRules[constructionType];

  // Validate distance constraints
  if (distance < rule.minDistance || distance > rule.maxDistance) {
    throw new Error(`Construction distance ${distance.toFixed(2)}m outside allowed range (${rule.minDistance}-${rule.maxDistance}m)`);
  }

  // Calculate direction vector
  const direction = normalize({
    x: end.x - start.x,
    y: end.y - start.y,
    z: end.z - start.z
  });

  // Determine brick spacing based on type and pattern
  const brickSpacing = rule.brickPattern === 'staggered' ? brick.size.width * 0.8 : brick.size.width;
  const numBricks = Math.floor(distance / brickSpacing);
  
  const brickPositions: Position3D[] = [];
  const brickRotations: Position3D[] = [];

  for (let i = 0; i < numBricks; i++) {
    const progress = i / Math.max(numBricks - 1, 1);
    
    // Base position along the path
    const basePosition: Position3D = {
      x: start.x + direction.x * distance * progress,
      y: start.y + direction.y * distance * progress,
      z: start.z + direction.z * distance * progress
    };

    // Apply pattern-specific adjustments
    let adjustedPosition = basePosition;
    let rotation = { x: 0, y: 0, z: 0 };

    switch (rule.brickPattern) {
      case 'staggered':
        // Alternate brick heights for better structural integrity
        adjustedPosition.y += (i % 2) * brick.size.height * 0.5;
        break;
      
      case 'column':
        // Stack bricks vertically
        adjustedPosition.y = start.y + i * brick.size.height;
        break;
      
      case 'arch':
        // Create curved arch pattern
        const archHeight = distance * 0.2; // 20% of span
        const archProgress = progress - 0.5; // Center the arch
        adjustedPosition.y += archHeight * (1 - 4 * archProgress * archProgress);
        rotation.z = Math.atan2(direction.y, direction.x);
        break;
    }

    // Calculate rotation to align with construction direction
    if (rule.brickPattern !== 'arch') {
      rotation.y = Math.atan2(direction.x, direction.z);
    }

    brickPositions.push(adjustedPosition);
    brickRotations.push(rotation);
  }

  return {
    start,
    end,
    brickPositions,
    brickRotations,
    totalBricks: numBricks,
    constructionType
  };
}

// Advanced structural analysis for multi-anchor construction
export function createStructuralNetwork(anchors: Anchor[]): StructuralNode[] {
  const nodes: StructuralNode[] = anchors.map(anchor => ({
    position: anchor.position,
    anchor,
    connections: [],
    supportCapacity: calculateSupportCapacity(anchor),
    isFoundation: anchor.purpose === 'foundation' || anchor.position.y <= 0.1
  }));

  // Calculate optimal connections between nodes
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const node1 = nodes[i];
      const node2 = nodes[j];
      const distance = calculateDistance(node1.position, node2.position);

      // Check if connection is structurally viable
      if (canConnect(node1, node2, distance)) {
        node1.connections.push(node2);
        node2.connections.push(node1);
      }
    }
  }

  return nodes;
}

// Calculate support capacity based on anchor type and position
function calculateSupportCapacity(anchor: Anchor): number {
  let capacity = 100; // Base capacity

  switch (anchor.purpose) {
    case 'foundation':
      capacity = 1000; // Very high for foundations
      break;
    case 'column-base':
      capacity = 500;
      break;
    case 'wall-corner':
      capacity = 300;
      break;
    case 'height-marker':
      capacity = 200;
      break;
    case 'roof-point':
      capacity = 150;
      break;
    case 'beam-junction':
      capacity = 400;
      break;
  }

  // Reduce capacity for elevated positions (simulating gravity effects)
  capacity *= Math.max(0.1, 1 - anchor.position.y * 0.1);

  return capacity;
}

// Check if two nodes can be structurally connected
function canConnect(node1: StructuralNode, node2: StructuralNode, distance: number): boolean {
  const anchor1 = node1.anchor;
  const anchor2 = node2.anchor;
  
  // Get construction rules for both anchor types
  const rule1 = constructionRules[anchor1.constructionType];
  const rule2 = constructionRules[anchor2.constructionType];

  // Check distance constraints
  const minDistance = Math.min(rule1.minDistance, rule2.minDistance);
  const maxDistance = Math.max(rule1.maxDistance, rule2.maxDistance);
  
  if (distance < minDistance || distance > maxDistance) {
    return false;
  }

  // Check type compatibility
  const compatible = rule1.allowedTypes.includes(anchor2.constructionType) ||
                    rule2.allowedTypes.includes(anchor1.constructionType);

  if (!compatible) {
    return false;
  }

  // Check structural support requirements
  if (rule1.requiredSupport || rule2.requiredSupport) {
    // At least one anchor must be foundation or have foundation support
    const hasSupport = node1.isFoundation || node2.isFoundation ||
                      node1.connections.some(n => n.isFoundation) ||
                      node2.connections.some(n => n.isFoundation);
    
    if (!hasSupport) {
      return false;
    }
  }

  return true;
}

// Generate optimal construction sequence for multiple paths
export function generateConstructionSequence(
  network: StructuralNode[],
  brickType: BrickTypeKey
): ConstructionPath[] {
  const paths: ConstructionPath[] = [];
  const processed = new Set<string>();

  // Sort nodes by structural priority (foundations first, then by height)
  const sortedNodes = [...network].sort((a, b) => {
    if (a.isFoundation && !b.isFoundation) return -1;
    if (!a.isFoundation && b.isFoundation) return 1;
    return a.position.y - b.position.y;
  });

  // Generate paths starting from foundation nodes
  for (const node of sortedNodes) {
    for (const connectedNode of node.connections) {
      const pathKey = `${node.anchor.name}-${connectedNode.anchor.name}`;
      const reverseKey = `${connectedNode.anchor.name}-${node.anchor.name}`;
      
      if (processed.has(pathKey) || processed.has(reverseKey)) {
        continue;
      }

      try {
        const path = calculateLinearPath(
          node.position,
          connectedNode.position,
          brickType,
          node.anchor.constructionType
        );
        paths.push(path);
        processed.add(pathKey);
      } catch (error) {
        console.warn(`Could not create path between ${node.anchor.name} and ${connectedNode.anchor.name}:`, error);
      }
    }
  }

  return paths;
}

// Physics simulation for brick stability
export interface BrickPhysics {
  position: Position3D;
  velocity: Position3D;
  acceleration: Position3D;
  mass: number;
  isStable: boolean;
  supportedBy: string[];
}

export function simulateBrickPhysics(
  bricks: Array<{ id: string; position: Position3D; brickType: BrickTypeKey }>,
  deltaTime: number = 1/60
): Record<string, BrickPhysics> {
  const physics: Record<string, BrickPhysics> = {};
  const gravity = { x: 0, y: -9.81, z: 0 };

  // Initialize physics for each brick
  for (const brick of bricks) {
    const brickTypeData = brickTypes[brick.brickType];
    const volume = brickTypeData.size.width * brickTypeData.size.height * brickTypeData.size.depth;
    const density = 2000; // kg/m³ for typical construction materials
    
    physics[brick.id] = {
      position: { ...brick.position },
      velocity: { x: 0, y: 0, z: 0 },
      acceleration: { ...gravity },
      mass: volume * density,
      isStable: false,
      supportedBy: []
    };
  }

  // Calculate support relationships
  for (const brick of bricks) {
    const brickPhysics = physics[brick.id];
    const brickSize = brickTypes[brick.brickType].size;
    
    // Find bricks below this one that can provide support
    for (const otherBrick of bricks) {
      if (brick.id === otherBrick.id) continue;
      
      const otherPhysics = physics[otherBrick.id];
      const otherSize = brickTypes[otherBrick.brickType].size;
      
      // Check if other brick is below and overlapping
      const yDiff = brick.position.y - otherBrick.position.y;
      const expectedGap = (brickSize.height + otherSize.height) / 2;
      
      if (yDiff > 0 && Math.abs(yDiff - expectedGap) < 0.1) {
        // Check horizontal overlap
        const xOverlap = Math.abs(brick.position.x - otherBrick.position.x) < 
                        (brickSize.width + otherSize.width) / 2;
        const zOverlap = Math.abs(brick.position.z - otherBrick.position.z) < 
                        (brickSize.depth + otherSize.depth) / 2;
        
        if (xOverlap && zOverlap) {
          brickPhysics.supportedBy.push(otherBrick.id);
        }
      }
    }

    // Check if brick is on ground (foundation support)
    if (brick.position.y <= brickSize.height / 2 + 0.1) {
      brickPhysics.supportedBy.push('ground');
    }

    // Brick is stable if it has support
    brickPhysics.isStable = brickPhysics.supportedBy.length > 0;
    
    // If stable, cancel downward velocity and acceleration
    if (brickPhysics.isStable) {
      brickPhysics.velocity.y = Math.max(0, brickPhysics.velocity.y);
      brickPhysics.acceleration.y = 0;
    }
  }

  return physics;
}

// Climate resilience analysis for construction
export interface ClimateAnalysis {
  thermalMass: number;
  windResistance: number;
  moistureResistance: number;
  sustainabilityScore: number;
  recommendations: string[];
}

export function analyzeClimateResilience(
  paths: ConstructionPath[],
  brickType: BrickTypeKey
): ClimateAnalysis {
  const brick = brickTypes[brickType];
  const analysis: ClimateAnalysis = {
    thermalMass: 0,
    windResistance: 0,
    moistureResistance: 0,
    sustainabilityScore: 0,
    recommendations: []
  };

  // Calculate thermal properties
  if (brick.properties.thermal) {
    analysis.thermalMass = 80; // High thermal mass
    analysis.recommendations.push("Excellent thermal regulation for temperature stability");
  } else {
    analysis.thermalMass = 40;
  }

  // Calculate structural resilience
  const totalBricks = paths.reduce((sum, path) => sum + path.totalBricks, 0);
  const avgPathLength = paths.reduce((sum, path) => 
    sum + calculateDistance(path.start, path.end), 0) / paths.length;

  analysis.windResistance = Math.min(100, 60 + (totalBricks / 10) - (avgPathLength * 5));
  analysis.moistureResistance = brick.material === 'clay' ? 90 : 
                                brick.material === 'composite' ? 70 : 
                                brick.material === 'recycled' ? 60 : 85;

  // Calculate sustainability score
  let sustainabilityPoints = 0;
  if (brick.properties.local) sustainabilityPoints += 20;
  if (brick.properties.renewable) sustainabilityPoints += 25;
  if (brick.properties.circular) sustainabilityPoints += 30;
  if (brick.properties.lightweight) sustainabilityPoints += 15;
  if (brick.properties.precise) sustainabilityPoints += 10;

  analysis.sustainabilityScore = sustainabilityPoints;

  // Generate recommendations
  if (analysis.sustainabilityScore > 70) {
    analysis.recommendations.push("Highly sustainable construction approach");
  }
  if (brick.properties.local) {
    analysis.recommendations.push("Using local materials reduces transportation emissions");
  }
  if (brick.properties.circular) {
    analysis.recommendations.push("Circular economy approach supports waste reduction");
  }

  return analysis;
} 