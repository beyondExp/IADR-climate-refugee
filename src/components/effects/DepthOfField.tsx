import { useRef, useMemo, useEffect } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass';
import { BokehPass } from 'three/examples/jsm/postprocessing/BokehPass';

interface DepthOfFieldProps {
  focus?: number;
  aperture?: number;
  maxblur?: number;
  enabled?: boolean;
  sceneMode?: string;
}

export function DepthOfField({ 
  focus = 1.0, 
  aperture = 0.025, 
  maxblur = 0.01,
  enabled = true,
  sceneMode = 'structure'
}: DepthOfFieldProps) {
  const { gl, scene, camera, size } = useThree();
  const composer = useRef<EffectComposer>();
  const bokehPass = useRef<BokehPass>();

  // Create composer and passes
  useEffect(() => {
    composer.current = new EffectComposer(gl);
    composer.current.addPass(new RenderPass(scene, camera));
    
    // Configure bokeh pass
    const bokeh = new BokehPass(scene, camera, {
      focus: focus,
      aperture: aperture,
      maxblur: maxblur,
      width: size.width,
      height: size.height
    });
    
    bokehPass.current = bokeh;
    composer.current.addPass(bokeh);
    
    return () => {
      composer.current?.dispose();
    };
  }, [gl, scene, camera, size.width, size.height]);

  // Update parameters based on scene mode
  useEffect(() => {
    if (!bokehPass.current) return;
    
    // Different DOF settings for different scenes
    switch (sceneMode) {
      case 'structure':
        bokehPass.current.uniforms['focus'].value = 5.2; // Focus on structure
        bokehPass.current.uniforms['aperture'].value = 0.015;
        bokehPass.current.uniforms['maxblur'].value = 0.008;
        break;
      case 'brick':
        bokehPass.current.uniforms['focus'].value = 4.1; // Focus closer on brick
        bokehPass.current.uniforms['aperture'].value = 0.025;
        bokehPass.current.uniforms['maxblur'].value = 0.012;
        break;
      case 'wind':
      case 'rain':
        bokehPass.current.uniforms['focus'].value = 3.5;
        bokehPass.current.uniforms['aperture'].value = 0.02;
        bokehPass.current.uniforms['maxblur'].value = 0.01;
        break;
      case 'disintegrate':
        bokehPass.current.uniforms['focus'].value = 3.9;
        bokehPass.current.uniforms['aperture'].value = 0.03;
        bokehPass.current.uniforms['maxblur'].value = 0.015;
        break;
      case 'plants':
        bokehPass.current.uniforms['focus'].value = 4.5; // Focus on wall
        bokehPass.current.uniforms['aperture'].value = 0.018;
        bokehPass.current.uniforms['maxblur'].value = 0.01;
        break;
    }
  }, [sceneMode]);

  // Handle resize
  useEffect(() => {
    composer.current?.setSize(size.width, size.height);
  }, [size]);

  // Render with composer
  useFrame(() => {
    if (enabled && composer.current) {
      composer.current.render();
    }
  }, 1); // Priority 1 to render after the scene

  return null;
}
