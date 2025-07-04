import type { BrickType, BrickTypeKey } from '../types';

export const brickTypes: Record<BrickTypeKey, BrickType> = {
  'clay-sustainable': {
    name: 'Clay Sustainable',
    size: { width: 0.25, height: 0.12, depth: 0.15 },
    color: 0xd2691e, // Sandy brown
    material: 'clay',
    properties: { thermal: true, local: true }
  },
  'bio-composite': {
    name: 'Bio-Composite',
    size: { width: 0.30, height: 0.10, depth: 0.15 },
    color: 0x8fbc8f, // Dark sea green
    material: 'composite',
    properties: { renewable: true, lightweight: true }
  },
  'recycled-aggregate': {
    name: 'Recycled Aggregate',
    size: { width: 0.20, height: 0.15, depth: 0.15 },
    color: 0x696969, // Dim gray
    material: 'recycled',
    properties: { insulation: true, circular: true }
  },
  '3d-printed-earth': {
    name: '3D Printed Earth',
    size: { width: 0.35, height: 0.08, depth: 0.20 },
    color: 0xcd853f, // Peru
    material: 'printed',
    properties: { precise: true, robotic: true }
  }
};

export function getBrickType(key: BrickTypeKey): BrickType {
  return brickTypes[key];
}

export function getAllBrickTypes(): Array<{ key: BrickTypeKey; brick: BrickType }> {
  return Object.entries(brickTypes).map(([key, brick]) => ({ 
    key: key as BrickTypeKey, 
    brick 
  }));
}

export function getBrickTypeKeys(): BrickTypeKey[] {
  return Object.keys(brickTypes) as BrickTypeKey[];
} 