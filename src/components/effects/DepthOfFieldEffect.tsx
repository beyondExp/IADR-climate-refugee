import { useRef } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import { DepthOfField, EffectComposer, Bloom } from '@react-three/postprocessing';
import * as THREE from 'three';

interface DOFEffectProps {
  sceneMode: string;
  cursor: { x: number; y: number };
}

export function DOFEffect({ sceneMode, cursor }: DOFEffectProps) {
  const { camera } = useThree();
  const targetRef = useRef(5);
  
  // Dynamic focus distance based on scene mode - adjusted for brick and wall clarity
  const focusDistances: Record<string, number> = {
    structure: 0.0,    // Moved closer to keep brick and wall front in focus
    brick: 1.5,        // Closer focus for the hero brick
    wind: 3.8,         // Keep particles and brick sharp
    rain: 3.8,         // Similar to wind
    disintegrate: 4.0, // Slightly further for dissolution effect
    plants: 4.5        // Focus on wall front and brick
  };

  // Dynamic DOF settings per scene - reduced blur for sharper focus
  const dofSettings: Record<string, { focalLength: number; bokehScale: number; focusRange: number }> = {
    structure: { focalLength: 0.005, bokehScale: 0.5, focusRange: 0.018 },
    brick: { focalLength: 0.018, bokehScale: 0, focusRange: 0.01 },
    wind: { focalLength: 1.116, bokehScale: 0.8, focusRange: 0.109 },
    rain: { focalLength: 4.016, bokehScale: 1.2, focusRange: 0.009 },
    disintegrate: { focalLength: 0.02, bokehScale: 2.5, focusRange: 0.012 },
    plants: { focalLength: 4.5, bokehScale: 1.5, focusRange: 0.00011 }
  };

  const currentSettings = dofSettings[sceneMode] || dofSettings.structure;
  const targetDistance = focusDistances[sceneMode] || 5;

  // Smooth focus adjustment with cursor
  useFrame(() => {
    // Add subtle focus shift based on cursor position
    const cursorInfluence = 15.15; // Reduced for subtler effect
    const adjustedDistance = targetDistance + (cursor.y * cursorInfluence);
    
    // Smooth transition
    targetRef.current = THREE.MathUtils.lerp(
      targetRef.current,
      adjustedDistance,
      0.05
    );
  });

  return (
    <EffectComposer>
      <DepthOfField
        focusDistance={targetRef.current}
        focalLength={currentSettings.focalLength}
        bokehScale={currentSettings.bokehScale}
        height={480}
        focusRange={currentSettings.focusRange} // Extended focus range
      />
      {/* Subtle bloom for highlights */}
      <Bloom
        intensity={0.25} // Slightly reduced
        luminanceThreshold={0.9}
        luminanceSmoothing={0.9}
        mipmapBlur
      />
    </EffectComposer>
  );
}
