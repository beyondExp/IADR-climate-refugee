// Core types for the Climate Refuge AR Project

export interface Position3D {
  x: number;
  y: number;
  z: number;
}

export interface Rotation3D {
  x: number;
  y: number;
  z: number;
}

export interface BrickProperties {
  thermal?: boolean;
  local?: boolean;
  renewable?: boolean;
  lightweight?: boolean;
  insulation?: boolean;
  circular?: boolean;
  precise?: boolean;
  robotic?: boolean;
}

export interface BrickSize {
  width: number;
  height: number;
  depth: number;
}

export interface BrickType {
  name: string;
  size: BrickSize;
  color: number; // Three.js color hex
  material: string;
  properties: BrickProperties;
}

export type BrickTypeKey = 'clay-sustainable' | 'bio-composite' | 'recycled-aggregate' | '3d-printed-earth';

export type AnchorPurpose = 'foundation' | 'wall-corner' | 'height-marker' | 'roof-point' | 'column-base' | 'beam-junction';

export type ConstructionType = 'wall' | 'column' | 'beam' | 'foundation' | 'arch';

export interface Anchor {
  purpose: AnchorPurpose;
  name: string;
  position: Position3D;
  constructionType: ConstructionType;
  notes?: string;
}

export interface Project {
  id: string;
  uid: string;
  name: string;
  description: string;
  brickType: BrickTypeKey;
  anchors: Anchor[];
  timestamp: string;
  type: 'modular-construction';
}

export interface Database {
  projects: Project[];
  metadata: {
    version: string;
    created: string;
    lastUpdated: string;
  };
}

// AR and QR related types
export interface ARPose {
  position: Position3D;
  rotation: Rotation3D;
  timestamp: number;
}

export interface AnchorQRData {
  projectId: string;
  projectUID: string;
  projectName: string;
  anchorIndex: number;
  anchorUID: string;
  anchor: Anchor;
  brickType: BrickTypeKey;
  totalAnchors: number;
  type: 'construction-anchor';
  timestamp: string;
}

export interface DetectedAnchor {
  data: AnchorQRData;
  pose: ARPose;
  timestamp: number;
}

export interface ConstructedBrick {
  id: string;
  position: Position3D;
  rotation: Rotation3D;
  brickType: BrickTypeKey;
  anchorPair: string; // Key identifying which anchors this brick connects
}

// UI State types
export type AppMode = 'selection' | 'creator' | 'visitor';

export type CreatorTab = 'construction' | 'anchor-creator' | 'database' | 'gallery';

export type VisitorTab = 'scanner' | 'viewer' | 'gallery';

export interface AppState {
  mode: AppMode;
  creatorTab: CreatorTab;
  visitorTab: VisitorTab;
  currentProject: Project | null;
  isARActive: boolean;
}

// WebXR types (using global WebXR types)
export interface WebXRState {
  session: XRSession | null;
  referenceSpace: XRReferenceSpace | null;
  isSupported: boolean;
  isActive: boolean;
}

// Error handling
export interface AppError {
  code: string;
  message: string;
  details?: string;
  timestamp: number;
}

export type ErrorType = 'CAMERA_ACCESS' | 'QR_GENERATION' | 'QR_SCANNING' | 'WEBXR_INIT' | 'DATABASE_ERROR' | 'NETWORK_ERROR'; 