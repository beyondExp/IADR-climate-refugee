// WebGL GPGPU (GPUComputationRenderer) version with CPU fallback
/* Disabled for now: GPU path under refinement; fallback to CPU is active
function DisintegrationParticlesGPGPU({ visible = true, cursor }: { visible?: boolean, cursor: { x: number; y: number } }) {
  const { gl, camera } = useThree();
  const support = useMemo(() => {
    const ctx: WebGLRenderingContext | WebGL2RenderingContext = gl.getContext();
    const isWebGL2 = (gl.capabilities as any).isWebGL2;
    const ext = (ctx.getExtension('EXT_color_buffer_float') || ctx.getExtension('OES_texture_float')) as any;
    return !!(isWebGL2 && ext);
  }, [gl]);
  const width = 128, height = 128; // 16,384 particles
  const count = width * height;
  const gpgpuRef = useRef<GPUComputationRenderer | null>(null);
  const posVarRef = useRef<any>(null);
  const velVarRef = useRef<any>(null);
  const baseTexRef = useRef<THREE.DataTexture | null>(null);
  const matRef = useRef<THREE.ShaderMaterial | null>(null);
  const pointsRef = useRef<THREE.Points>(null);
  const frameRef = useRef(0);

  // build base texture from GLTF mesh
  const gltf = useGLTF('/Octa2.glb') as any;
  const obstacleRadiusRef = useRef<number>(1.0);
  const baseData = useMemo(() => {
    const base = new Float32Array(count * 4);
    const root = gltf.scene as THREE.Object3D;
    root.updateMatrixWorld(true);
    let targetMesh: any = null;
    root.traverse((o: any) => { if (!targetMesh && o?.isMesh) targetMesh = o; });
    let arr: Float32Array | null = null;
    if (targetMesh?.geometry?.attributes?.position) arr = targetMesh.geometry.attributes.position.array as Float32Array;
    if (arr) {
      // bbox center + scale to ~4.5
      let minX=Infinity,minY=Infinity,minZ=Infinity,maxX=-Infinity,maxY=-Infinity,maxZ=-Infinity;
      const n = arr.length/3;
      for (let i=0;i<n;i++){const ix=i*3;const x=arr[ix],y=arr[ix+1],z=arr[ix+2];if(x<minX)minX=x;if(x>maxX)maxX=x;if(y<minY)minY=y;if(y>maxY)maxY=y;if(z<minZ)minZ=z;if(z>maxZ)maxZ=z;}
      const cx=(minX+maxX)*0.5, cy=(minY+maxY)*0.5, cz=(minZ+maxZ)*0.5;
      const scale=4.5/Math.max(maxX-minX,maxY-minY,maxZ-minZ);
      for (let i=0;i<count;i++){
        const s=(i%n)*3, ix=i*4; base[ix]= (arr[s]-cx)*scale; base[ix+1]=(arr[s+1]-cy)*scale; base[ix+2]=(arr[s+2]-cz)*scale; base[ix+3]=1;
      }
    } else {
      for (let i=0;i<count;i++){const ix=i*4;base[ix]=(Math.random()-0.5)*3;base[ix+1]=(Math.random()-0.5)*3;base[ix+2]=(Math.random()-0.5)*3;base[ix+3]=1;}
    }
    return base;
  }, [gltf, count]);

  // init GPGPU
  useEffect(() => {
    if (!support) return;
    const gpgpu = new GPUComputationRenderer(width, height, gl);
    const pos0 = gpgpu.createTexture(); (pos0.image.data as Float32Array).set(baseData);
    const vel0 = gpgpu.createTexture();
    gpgpuRef.current = gpgpu;
    const posVar = gpgpu.addVariable('texturePosition', `
      uniform vec2 resolution; uniform float dt;
      void main(){
        vec2 uv = gl_FragCoord.xy / resolution;
        vec3 pos = texture2D( texturePosition, uv ).xyz;
        vec3 vel = texture2D( textureVelocity, uv ).xyz;
        gl_FragColor = vec4( pos + vel * dt, 1.0 );
      }
    `, pos0);
    const velVar = gpgpu.addVariable('textureVelocity', `
      uniform vec2 resolution; uniform sampler2D baseTex; uniform sampler2D noiseTex;
      uniform vec3 cursor; uniform float time; uniform float dt;
      uniform float kRest; uniform float kExc; uniform float damping; uniform float sigma; uniform float repel;
      uniform float viscosity; uniform float velCap;
      void main(){
        vec2 uv = gl_FragCoord.xy / resolution;
        vec3 pos = texture2D( texturePosition, uv ).xyz;
        vec3 vel = texture2D( textureVelocity, uv ).xyz;
        vec3 base = texture2D( baseTex, uv ).xyz;
        vec4 n = texture2D( noiseTex, uv );
        vec3 d = pos - cursor; float d2 = dot(d,d);
        float falloff = exp( -d2 / (2.0 * sigma * sigma) );
        float act = clamp( falloff * 6.0, 0.0, 1.0 );
        float k = mix( kExc, kRest, 1.0 - act );
        vec3 spring = (base - pos) * k;
        vec3 rep = normalize(d) * (repel * falloff);
        vec3 flow = vec3(
          sin(0.7*pos.y + 0.4*time) - cos(0.6*pos.z - 0.3*time),
          sin(0.6*pos.z + 0.5*time) - cos(0.8*pos.x + 0.2*time),
          sin(0.5*pos.x - 0.6*time) - cos(0.7*pos.y + 0.3*time)
        );
        flow *= (0.03 + 0.015*(n.x-0.5)) * act;
        vec3 jitter = (n.xyz - 0.5) * (0.02 * act);
        float mass = mix(0.85, 1.25, n.w);
        vec3 acc = (spring + rep + flow + jitter) / mass;
        vec3 velNew = (vel + acc * dt) * mix(damping, damping*0.98, n.z);
        vec2 texel = 1.0 / resolution;
        vec3 v1 = texture2D( textureVelocity, uv + vec2(texel.x, 0.0) ).xyz;
        vec3 v2 = texture2D( textureVelocity, uv + vec2(-texel.x, 0.0) ).xyz;
        vec3 v3 = texture2D( textureVelocity, uv + vec2(0.0, texel.y) ).xyz;
        vec3 v4 = texture2D( textureVelocity, uv + vec2(0.0, -texel.y) ).xyz;
        vec3 vAvg = (vel + v1 + v2 + v3 + v4) / 5.0;
        velNew = mix(velNew, vAvg, viscosity);
        float vlen = length(velNew);
        if (vlen > velCap) velNew *= velCap / vlen;
        vel = velNew;
        gl_FragColor = vec4( vel, 1.0 );
      }
    `, vel0);
    // uniforms and dependencies (extend, don't overwrite defaults)
    Object.assign(velVar.material.uniforms, {
      resolution: { value: new THREE.Vector2(width, height) }, cursor: { value: new THREE.Vector3() }, time: { value: 0 }, dt: { value: 1/60 },
      kRest: { value: 0.08 }, kExc: { value: 0.0015 }, damping: { value: 0.94 }, sigma: { value: 0.7 }, repel: { value: 0.18 }, viscosity: { value: 0.18 }, velCap: { value: 1.2 }
    });
    Object.assign(posVar.material.uniforms, {
      resolution: { value: new THREE.Vector2(width, height) }, dt: { value: 1/60 }
    });
    gpgpu.setVariableDependencies(posVar, [posVar, velVar]);
    gpgpu.setVariableDependencies(velVar, [posVar, velVar]);
    // ensure wrapping/ filtering
    // @ts-ignore
    posVar.material.defines = { USE_FLOAT: 1 };
    // @ts-ignore
    velVar.material.defines = { USE_FLOAT: 1 };
    // create baseTex uniform
    const baseTex = new THREE.DataTexture(new Float32Array(baseData), width, height, THREE.RGBAFormat, THREE.FloatType); baseTex.needsUpdate = true; baseTexRef.current = baseTex;
    Object.assign(velVar.material.uniforms, { baseTex: { value: baseTex } });
    const noiseArr = new Float32Array(width*height*4);
    for (let i=0;i<width*height;i++){ const ix=i*4; noiseArr[ix]=Math.random(); noiseArr[ix+1]=Math.random(); noiseArr[ix+2]=Math.random(); noiseArr[ix+3]=Math.random(); }
    const noiseTex = new THREE.DataTexture(noiseArr, width, height, THREE.RGBAFormat, THREE.FloatType); noiseTex.needsUpdate = true;
    Object.assign(velVar.material.uniforms, { noiseTex: { value: noiseTex } });
    const init = gpgpu.init(); if (init) console.error('GPGPU init error:', init); else console.log('GPGPU init OK', { width, height, count });
    posVarRef.current = posVar; velVarRef.current = velVar;
    return () => { baseTex.dispose(); };
  }, [support, gl, baseData]);

  // draw geometry + material
  const geom = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const positions = new Float32Array(count*3); g.setAttribute('position', new THREE.BufferAttribute(positions,3));
    const ref = new Float32Array(count*2);
    for (let y=0;y<height;y++){ for (let x=0;x<width;x++){ const i=y*width+x; ref[2*i]=(x+0.5)/width; ref[2*i+1]=(y+0.5)/height; }}
    g.setAttribute('uvRef', new THREE.BufferAttribute(ref,2)); g.setDrawRange(0,count); g.boundingSphere=new THREE.Sphere(new THREE.Vector3(), 200);
    console.log('GPGPU geom built', { count, attrCount: (g.getAttribute('uvRef') as THREE.BufferAttribute).count });
    return g;
  }, [count, width, height]);

  useEffect(() => {
    if (!support || !gpgpuRef.current) return;
    const mat = new THREE.ShaderMaterial({
      uniforms: { posTex: { value: null }, size: { value: 0.8 }, color: { value: new THREE.Color('#a0a0a0') } },
      transparent: true, depthTest: true, depthWrite: false, blending: THREE.NormalBlending,
      vertexShader: `uniform sampler2D posTex; uniform float size; attribute vec2 uvRef; varying float vA; void main(){ vec3 pos = texture2D(posTex, uvRef).xyz; vec4 mv=modelViewMatrix*vec4(pos,1.0); gl_Position=projectionMatrix*mv; gl_PointSize=size*clamp(120.0/ -mv.z, 0.5, 2.0); vA=1.0; }`,
      fragmentShader: `uniform vec3 color; varying float vA; void main(){ vec2 p=gl_PointCoord*2.0-1.0; float r=dot(p,p); if(r>1.0) discard; float a=smoothstep(1.0,0.0,r); gl_FragColor=vec4(color, a*0.18); }`,
    });
    matRef.current = mat; return () => { mat.dispose(); };
  }, [support]);

  // simulate + update draw
  const hasTexRef = useRef(false);
  useFrame(({ clock }) => {
    if (!support || !gpgpuRef.current || !posVarRef.current || !velVarRef.current) return;
    // cursor on z=0 plane
    const ndc = new THREE.Vector2(cursor.x, -cursor.y); const ray = new THREE.Raycaster(); ray.setFromCamera(ndc, camera); const plane = new THREE.Plane(new THREE.Vector3(0,0,1),0); const p = new THREE.Vector3(); ray.ray.intersectPlane(plane, p);
    // convert cursor to particle local space so forces apply correctly
    let localCursor = p;
    if (pointsRef.current) {
      localCursor = pointsRef.current.worldToLocal(p.clone());
    }
    // uniforms
    velVarRef.current.material.uniforms.cursor.value.copy(localCursor);
    velVarRef.current.material.uniforms.time.value = clock.elapsedTime;
    // compute
    gpgpuRef.current.compute();
    // update render material with new pos texture
    if (matRef.current) {
      (matRef.current.uniforms as any).posTex.value = gpgpuRef.current.getCurrentRenderTarget(posVarRef.current).texture;
      hasTexRef.current = true;
    }
    // debug every 60 frames: sample one pixel
    frameRef.current++;
    if (frameRef.current % 60 === 0) {
      try {
        const rt = gpgpuRef.current.getCurrentRenderTarget(posVarRef.current);
        const buf = new Float32Array(4);
        gl.readRenderTargetPixels(rt, 0, 0, 1, 1, buf);
        console.log('GPGPU debug sample', { frame: frameRef.current, pos00: Array.from(buf) });
      } catch (e) {
        console.log('GPGPU readback failed', e);
      }
    }
  });

  if (!support) return <DisintegrationParticles visible={visible} cursor={cursor} />;
  if (!matRef.current || !hasTexRef.current) return null;
  return (
    <points ref={pointsRef} visible={visible} geometry={geom} frustumCulled={false}>
      <primitive object={matRef.current} attach="material" />
    </points>
  );
}
*/
import { useState, useEffect, useRef, useMemo } from 'react'
import { Monitor, Smartphone, Headset, ChevronUp, ChevronDown } from 'lucide-react'
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
// @ts-ignore
import { GPUComputationRenderer } from 'three/examples/jsm/misc/GPUComputationRenderer.js';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import * as THREE from 'three';
import { motion, AnimatePresence } from 'framer-motion';
// no settings icon used in minimalist header


interface LandingPageProps { onModeSelect: (mode: 'creator' | 'visitor') => void }

type SceneMode = 'structure' | 'brick' | 'wind' | 'rain' | 'disintegrate'

// Student-Designed Brick Component
function StudentBrick({ scale = [2, 2, 2] as [number, number, number], position = [0, 0, 0] as [number, number, number], isRotating = false, opacity = 1.0, visible = true }: { scale?: [number, number, number], position?: [number, number, number], isRotating?: boolean, opacity?: number, visible?: boolean }) {
  const { scene } = useGLTF('/Octa2.glb');
  const meshRef = useRef<THREE.Group>(null);
  const cloned = useMemo(() => scene.clone(), [scene]);
  const lastOpacityRef = useRef<number>(opacity);
  
  useFrame((state) => {
    if (meshRef.current && isRotating) {
      meshRef.current.rotation.y = state.clock.elapsedTime * 0.2;
      meshRef.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.15) * 0.06;
    }
  });

  useEffect(() => {
    // Only change opacity; leave original materials/textures intact
    cloned.traverse((obj: any) => {
      if (!(obj && obj.isMesh)) return;
      const mesh = obj as THREE.Mesh;
      const applyOpacity = (m: THREE.Material): THREE.Material => {
        const isTransparent = opacity < 0.999;
        (m as any).transparent = isTransparent;
        (m as any).opacity = opacity;
        (m as any).depthTest = true;
        // Allow particles to show through when brick is dissolving
        (m as any).depthWrite = opacity > 0.6;
        m.needsUpdate = true;
        return m;
      };
      if (Array.isArray(mesh.material)) {
        mesh.material = mesh.material.map((mm) => applyOpacity(mm)) as THREE.Material[];
      } else if (mesh.material) {
        mesh.material = applyOpacity(mesh.material);
      }
    });
  }, [cloned, opacity]);

  // Ensure opacity reflects scroll every frame (avoids stale materials)
  useFrame(() => {
    if (lastOpacityRef.current === opacity) return;
    lastOpacityRef.current = opacity;
    cloned.traverse((obj: any) => {
      if (!(obj && obj.isMesh)) return;
      const mesh = obj as THREE.Mesh;
      const apply = (m: THREE.Material) => {
        const isTransparent = opacity < 0.999;
        (m as any).transparent = isTransparent;
        (m as any).opacity = opacity;
        (m as any).depthTest = true;
        (m as any).depthWrite = opacity > 0.6;
        m.needsUpdate = true;
      };
      if (Array.isArray(mesh.material)) mesh.material.forEach(apply); else if (mesh.material) apply(mesh.material);
    });
  });

  return (
    <group ref={meshRef} scale={scale} position={position} visible={visible}>
      <primitive object={cloned} />
    </group>
  );
}

function InlineInfo({ label, text }: { label: string; text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="btn-secondary" onClick={() => setOpen((v) => !v)}>{label}</button>
      <AnimatePresence>
        {open && (
          <>
            {/* Backdrop overlay */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/20 backdrop-blur-sm z-50"
              onClick={() => setOpen(false)}
            />
            
            {/* Modal window */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
              className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-50"
              style={{
                width: '70vw',
                height: '70vh',
                background: 'rgba(255, 255, 255, 0.95)',
                backdropFilter: 'blur(20px)',
                border: '1px solid rgba(255, 255, 255, 0.3)',
                borderRadius: '24px',
                boxShadow: '0 20px 60px rgba(0, 0, 0, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.2)'
              }}
            >
              <div className="p-8 h-full flex flex-col">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-2xl font-bold text-gray-900">{label}</h3>
                  <button 
                    onClick={() => setOpen(false)}
                    className="bg-gray-100 hover:bg-gray-200 text-gray-600 hover:text-gray-800 rounded-full p-3 transition-all duration-200 hover:scale-110"
                    style={{
                      minWidth: '48px',
                      minHeight: '48px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto">
                  <p className="text-lg text-gray-700 leading-relaxed">{text}</p>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

// Minimal auxiliary lighting background (white theme)
// Removed SubtleBackdrop (unused)

// (Replaced by HeroBrickRig)

// Single hero brick that persists across all sections (except footer/disintegrate)
function HeroBrickRig({ sceneMode, cursor, progress, heroMatrixRef }: { sceneMode: SceneMode, cursor: { x: number; y: number }, progress: { structure: number; brick: number; wind: number; rain: number; disintegrate: number }, heroMatrixRef: React.MutableRefObject<THREE.Matrix4> }) {
  const group = useRef<THREE.Group>(null);
  // match StructureGroup center slot formula to align positions in structure
  const params = { radius: 5.8, arcSpan: Math.PI * 0.5, xzScale: 1.3, yStep: 0.6 };
  const centerBase = useMemo(() => {
    const r = 3; // row index of center brick
    const c = 6; // col index
    const t = (c / (12 - 1)) - 0.5;
    const theta = t * params.arcSpan;
    const x = Math.sin(theta) * params.radius * params.xzScale;
    const z = (1 - Math.cos(theta)) * params.radius * 0.5 - 1.2;
    const y = (r - (6 - 1) / 2) * params.yStep + 0.8;
    const waveY = Math.sin((r * 0.8) + (c * 0.55)) * 0.18;
    const waveZ = Math.sin((c * 0.5) + r * 0.6) * 0.28;
    return new THREE.Vector3(x, y + waveY, z + waveZ);
  }, []);

  useFrame(() => {
    if (!group.current) return;
    // target transforms by scene
    const isWet = sceneMode === 'rain';
    const refractive = sceneMode !== 'rain';

    // position: in structure, stick to center slot; then move to front/center for brick, wind, rain
    const tBrick = THREE.MathUtils.clamp(progress.brick, 0, 1);
    const targetPos = new THREE.Vector3(0, 0.8, 0);
    const targetRot = new THREE.Euler(0, cursor.x * 0.25, -cursor.y * 0.12);
    const targetScale = new THREE.Vector3(2, 2, 2);

    // blend from structure center position into stage center as we enter brick
    const s = 0.5 - 0.5 * Math.cos(Math.PI * tBrick);
    const from = centerBase;
    targetPos.lerpVectors(from, new THREE.Vector3(0, 0.8, 0), s);

    // apply transforms smoothly
    group.current.position.lerp(targetPos, 0.08);
    group.current.rotation.y = THREE.MathUtils.lerp(group.current.rotation.y, targetRot.y, 0.1);
    group.current.rotation.x = THREE.MathUtils.lerp(group.current.rotation.x, targetRot.z, 0.1);
    group.current.scale.lerp(targetScale, 0.08);
    // expose world matrix for particles to match exactly
    heroMatrixRef.current.copy(group.current.matrixWorld);

    // store wet/refractive on object userData for StudentBrick
    (group.current.userData as any)._isWet = isWet;
    (group.current.userData as any)._refractive = refractive;
  });

  // Always mounted so opacity can crossfade even in disintegrate section
  return (
    <group ref={group}>
      {/* Fade brick out during transition from rain to disintegrate */}
      <StudentBrick
        scale={[1, 1, 1]}
        position={[0, 0, 0]}
        opacity={
          // Visible in structure, brick, wind, and rain; fully hidden in disintegrate (material study)
          (sceneMode === 'structure' || sceneMode === 'brick' || sceneMode === 'wind' || sceneMode === 'rain')
            ? 1.0
            : 0.0
        }
      />
    </group>
  );
}

// HDR Environment Component with Climate Refugee Themed Transition
// Shows how a beautiful environment becomes hostile and uninhabitable due to climate change
// Also handles disintegration effects for the skybox and subtle cinematic handheld camera rotation
function HDREnvironment({ sceneMode, progress }: { sceneMode: SceneMode, progress: { structure: number; wind: number; disintegrate: number; } }) {
  const { scene, camera } = useThree();
  const [envMap, setEnvMap] = useState<THREE.Texture | null>(null);
  
  useEffect(() => {
    // Load HDR environment
    const loader = new RGBELoader();
    loader.load(
      '/goegap_4k.hdr', 
      (texture) => {
        texture.mapping = THREE.EquirectangularReflectionMapping;
        console.log('[HDR] Successfully loaded HDR environment, size:', texture.image?.width, 'x', texture.image?.height);
        setEnvMap(texture);
      },
      (progress) => {
        console.log('[HDR] Loading progress:', (progress.loaded / progress.total * 100).toFixed(1) + '%');
      },
      (error) => {
        console.error('[HDR] Failed to load HDR environment:', error);
      }
    );
  }, []);

  useFrame((state) => {
    if (!envMap || !scene) return;
    
    // Calculate different transition types based on scene mode
    const climateTransitionProgress = sceneMode === 'structure' ? 
      THREE.MathUtils.clamp((progress.structure - 0.4) / 0.6, 0, 1) : 0; // Climate degradation in structure section
    
    const disintegrationProgress = sceneMode === 'disintegrate' ? progress.disintegrate : 0; // Disintegration effect
    
    // Handheld camera shake for cinematic feel - very subtle rotation only
    const time = state.clock.elapsedTime;
    const shakeIntensity = 0.01; // Much more subtle shake for rotation
    const shakeSpeed = 0.8; // Slower, gentler movement speed
    
    // Multiple sine waves for natural handheld movement (rotation only)
    const shakeX = Math.sin(time * shakeSpeed * 1.1) * shakeIntensity + 
                  Math.sin(time * shakeSpeed * 2.3) * shakeIntensity * 0.5;
    const shakeY = Math.cos(time * shakeSpeed * 0.9) * shakeIntensity + 
                  Math.cos(time * shakeSpeed * 1.7) * shakeIntensity * 0.3;
    const shakeZ = Math.sin(time * shakeSpeed * 1.5) * shakeIntensity * 0.7;
    
    // Apply HDR environment based on scene mode
    if (sceneMode === 'structure') {
      // Climate change progression in structure section
      scene.background = envMap;
      scene.environment = envMap;
      
      console.log('[HDR Structure] Climate Progress:', climateTransitionProgress, 'Background:', !!scene.background);
      
      // Climate change progression effects
      const climateIntensity = climateTransitionProgress;
      const time = state.clock.elapsedTime;
      
      // 1. Desertification effect - environment becomes more arid and hostile
      const desertification = climateIntensity * 0.8;
      const heatWave = Math.sin(time * 3.0 + climateIntensity * Math.PI * 2) * 0.3 * climateIntensity;
      
      // 2. Environmental degradation - colors drain, become hostile
      const degradationFactor = 1.0 - (climateIntensity * 0.7);
      const hostileTint = climateIntensity * 0.4; // Brown/orange tint for drought
      
      // 3. Extreme weather distortion - heat shimmer and instability
      const extremeWeather = Math.sin(time * 4.0 + climateIntensity * Math.PI * 3) * 0.2 * climateIntensity;
      const climateChaos = Math.sin(time * 1.5 + climateIntensity * Math.PI * 5) * 0.1 * climateIntensity;
      
      // Apply climate effects to environment
      const environmentIntensity = degradationFactor * (1.0 + extremeWeather + climateChaos);
      scene.environmentIntensity = Math.max(0.1, environmentIntensity);
      
      // Add visible color temperature shift - blue to orange/red
      if (scene.environment) {
        const colorShift = new THREE.Vector3(
          1.0 + (climateIntensity * 0.4), // More red
          1.0 - (climateIntensity * 0.2), // Less green  
          1.0 - (climateIntensity * 0.6)  // Much less blue
        );
        // Note: This would require a custom shader, but the tone mapping exposure helps
      }
      
      // Create hostile atmosphere - overheating and desertification
      const renderer = state.gl;
      if (renderer.toneMappingExposure !== undefined) {
        // Overexposure effect - simulating extreme heat
        const heatExposure = 1.0 + (climateIntensity * 1.5) + heatWave;
        renderer.toneMappingExposure = heatExposure;
      }
      
      // Background becomes more hostile and unstable
      if (scene.background) {
        // Start with full intensity, then degrade
        const backgroundIntensity = Math.max(0.3, degradationFactor + hostileTint);
        (scene.background as any).intensity = backgroundIntensity;
      }
      
      // Apply handheld camera shake + very subtle atmospheric chaos from climate change
      const atmosphericChaos = Math.sin(time * 2.5 + climateIntensity * Math.PI * 6) * 0.005 * climateIntensity;
      const chaosOffsetX = Math.cos(time * 3.0 + climateIntensity * Math.PI * 8) * 0.003 * climateIntensity;
      
      // Store original camera rotation for restoration (position handled by CameraRig)
      if (!camera.userData.originalRotation) {
        camera.userData.originalRotation = {
          x: camera.rotation.x,
          y: camera.rotation.y,
          z: camera.rotation.z
        };
      }
      
      // Apply cinematic handheld shake only to rotation + climate chaos
      camera.rotation.x = camera.userData.originalRotation.x + shakeX + atmosphericChaos;
      camera.rotation.y = camera.userData.originalRotation.y + shakeY + chaosOffsetX;
      camera.rotation.z = camera.userData.originalRotation.z + shakeZ;
      
      // Create dust storm / extreme weather fog effect
      if (scene.fog && climateIntensity > 0.3) {
        const dustStormIntensity = (climateIntensity - 0.3) / 0.7; // 0 to 1 from 30% onwards
        const fog = scene.fog as THREE.Fog;
        if (fog.near !== undefined && fog.far !== undefined) {
          fog.near = 10 - (dustStormIntensity * 8); // Fog moves closer
          fog.far = 50 - (dustStormIntensity * 30); // Visibility reduces dramatically
          fog.color = new THREE.Color().setHSL(0.1, 0.3 + dustStormIntensity * 0.4, 0.6 - dustStormIntensity * 0.3);
        }
      } else if (climateIntensity > 0.3 && !scene.fog) {
        // Add fog when environment becomes very hostile
        const dustStormIntensity = (climateIntensity - 0.3) / 0.7;
        scene.fog = new THREE.Fog(
          new THREE.Color().setHSL(0.1, 0.3 + dustStormIntensity * 0.4, 0.6 - dustStormIntensity * 0.3),
          10 - (dustStormIntensity * 8),
          50 - (dustStormIntensity * 30)
        );
      }
      
    } else if (sceneMode === 'disintegrate') {
      // Disintegration effects for the skybox - MAKE IT VERY VISIBLE
      scene.background = envMap;
      scene.environment = envMap;
      
      const time = state.clock.elapsedTime;
      
      // Disintegration effects - skybox breaks apart and dissolves dramatically
      const disIntensity = disintegrationProgress;
      
      console.log('[HDR Disintegration] Progress:', disIntensity, 'Background:', !!scene.background);
      
      // 1. DRAMATIC Fragmentation effect - environment breaks into pieces
      const fragmentationScale = 1.0 + (disIntensity * 5.0); // Much stronger stretching
      const fragmentationNoise = Math.sin(time * 8.0 + disIntensity * Math.PI * 16) * 0.8 * disIntensity;
      
      // 2. AGGRESSIVE Dissolution effect - environment fades away rapidly  
      const dissolutionRate = disIntensity * 1.5; // Much faster dissolution
      const dissolutionNoise = Math.sin(time * 6.0 + disIntensity * Math.PI * 12) * 0.6 * disIntensity;
      
      // 3. SEVERE Color corruption - environment loses coherence completely
      const colorCorruption = disIntensity * 1.2; // Much stronger corruption
      const corruptionFlicker = Math.sin(time * 15.0 + disIntensity * Math.PI * 30) * 0.9 * disIntensity;
      
      // Apply DRAMATIC disintegration to environment
      const environmentIntensity = Math.max(0.05, 1.0 - (dissolutionRate * 1.2) - (dissolutionNoise * 2.0));
      scene.environmentIntensity = environmentIntensity;
      
      // EXTREME Background disintegration effects
      if (scene.background) {
        // MASSIVE intensity reduction with wild flickering
        const baseIntensity = Math.max(0.02, 1.0 - (disIntensity * 1.8)); // Much more aggressive fading
        const intensityFlicker = Math.sin(time * 25.0 + disIntensity * Math.PI * 50) * 0.8 * disIntensity; // Wild flickering
        const backgroundIntensity = baseIntensity + intensityFlicker;
        (scene.background as any).intensity = Math.max(0.01, backgroundIntensity);
        
        console.log('[HDR Background] Intensity:', backgroundIntensity, 'Dis Progress:', disIntensity);
        
        // Controlled chaos layers for disintegration + handheld shake
        const primaryChaos = Math.sin(time * 12.0 + disIntensity * Math.PI * 24) * 0.04 * disIntensity; // Reduced camera rotation chaos
        const secondaryChaos = Math.cos(time * 18.0 + disIntensity * Math.PI * 36) * 0.03 * disIntensity;
        const tertiaryChaos = Math.sin(time * 9.0 + disIntensity * Math.PI * 18) * 0.02 * disIntensity;
        const chaosInfluence = disIntensity * 1.5; // Reduced chaos amplification
        
        // Store original camera rotation for restoration (position handled by CameraRig)
        if (!camera.userData.originalRotation) {
          camera.userData.originalRotation = {
            x: camera.rotation.x,
            y: camera.rotation.y,
            z: camera.rotation.z
          };
        }
        
        // Keep consistent handheld shake with subtle disintegration effects
        // Use normal shake as base, add minimal chaos only for reality breakdown feel
        const chaosScale = disIntensity > 0.8 ? (disIntensity - 0.8) * 0.5 : 0; // Only add chaos in final 20%
        
        const disIntegrationCameraX = camera.userData.originalRotation.x + 
          shakeX + (primaryChaos * chaosScale);
        const disIntegrationCameraY = camera.userData.originalRotation.y + 
          shakeY + (secondaryChaos * chaosScale);
        const disIntegrationCameraZ = camera.userData.originalRotation.z + 
          shakeZ + (tertiaryChaos * chaosScale);
        
        // Apply EXTREME camera rotation distortion for reality breakdown (no position changes)
        camera.rotation.x = disIntegrationCameraX;
        camera.rotation.y = disIntegrationCameraY;
        camera.rotation.z = disIntegrationCameraZ;
      }
      
      // EXTREME Renderer effects for disintegration
      const renderer = state.gl;
      if (renderer.toneMappingExposure !== undefined) {
        // VIOLENT flickering exposure as reality breaks down completely
        const exposureFlicker = 1.0 + (Math.sin(time * 20.0 + disIntensity * Math.PI * 40) * 1.5 * disIntensity);
        const exposureChaos = Math.cos(time * 15.0 + disIntensity * Math.PI * 30) * 0.8 * disIntensity;
        renderer.toneMappingExposure = Math.max(0.1, exposureFlicker + exposureChaos);
        console.log('[HDR Renderer] Exposure:', renderer.toneMappingExposure);
      }
      
      // Add disintegration fog - reality becoming unclear
      if (disIntensity > 0.1) {
        const fogIntensity = (disIntensity - 0.1) / 0.9; // 0 to 1 from 10% onwards
        const fogFlicker = Math.sin(time * 9.0 + disIntensity * Math.PI * 18) * 0.2 * fogIntensity;
        
        if (!scene.fog) {
          // Create chaotic, reality-breaking fog
          const fogColor = new THREE.Color().setHSL(
            0.0, // No hue - grayscale
            0.0, // No saturation
            0.8 - fogIntensity * 0.6 + fogFlicker // Flickering brightness
          );
          scene.fog = new THREE.Fog(
            fogColor,
            3 - (fogIntensity * 2.5), // Fog moves very close
            15 - (fogIntensity * 12) // Very limited visibility
          );
        } else {
          const fog = scene.fog as THREE.Fog;
          if (fog.near !== undefined && fog.far !== undefined) {
            fog.near = Math.max(0.5, 3 - (fogIntensity * 2.5));
            fog.far = Math.max(3, 15 - (fogIntensity * 12));
            // Flickering fog color for disintegration effect
            fog.color = new THREE.Color().setHSL(0.0, 0.0, 0.8 - fogIntensity * 0.6 + fogFlicker);
          }
        }
      } else if (scene.fog) {
        scene.fog = null; // Clear fog when disintegration is low
      }
      
    } else if (sceneMode === 'brick' || sceneMode === 'wind' || sceneMode === 'rain') {
      // Show HDR with cursor movement in other sections too
      scene.background = envMap;
      scene.environment = envMap;
      scene.environmentIntensity = 1.0;
      
      console.log('[HDR Other Modes] Scene:', sceneMode, 'Background:', !!scene.background);
      
      // Apply handheld camera shake for cinematic feel
      if (scene.background) {
        (scene.background as any).intensity = 1.0;
      }
      
      // Store original camera rotation for restoration (position handled by CameraRig)
      if (!camera.userData.originalRotation) {
        camera.userData.originalRotation = {
          x: camera.rotation.x,
          y: camera.rotation.y,
          z: camera.rotation.z
        };
      }
      
      // Apply subtle handheld shake only to rotation for natural camera movement
      camera.rotation.x = camera.userData.originalRotation.x + shakeX;
      camera.rotation.y = camera.userData.originalRotation.y + shakeY;
      camera.rotation.z = camera.userData.originalRotation.z + shakeZ;
      
      // Clear fog and reset exposure
      if (scene.fog) {
        scene.fog = null;
      }
      
      const renderer = state.gl;
      if (renderer.toneMappingExposure !== undefined) {
        renderer.toneMappingExposure = 1.0;
      }
      
    } else {
      // Default state - clear environment effects
      scene.background = null;
      scene.environment = null;
      scene.environmentIntensity = 1.0;
      
      // Reset camera rotation to original (position handled by CameraRig)
      if (camera.userData.originalRotation) {
        camera.rotation.x = camera.userData.originalRotation.x;
        camera.rotation.y = camera.userData.originalRotation.y;
        camera.rotation.z = camera.userData.originalRotation.z;
      }
      
      // Clear all effects
      if (scene.fog) {
        scene.fog = null;
      }
      
      // Reset exposure
      const renderer = state.gl;
      if (renderer.toneMappingExposure !== undefined) {
        renderer.toneMappingExposure = 1.0;
      }
    }
  });
  
  return null;
}

function CameraRig({ sceneMode, cursor, progress }: { sceneMode: SceneMode, cursor: { x: number; y: number }, progress: { structure: number; brick: number; wind: number; rain: number; disintegrate: number } }) {
  const { camera } = useThree();
  const target = useRef(new THREE.Vector3(0, 0.8, 0));
  useFrame(() => {
    const presets: Record<SceneMode, { pos: THREE.Vector3; look: THREE.Vector3 } > = {
      structure: { pos: new THREE.Vector3(0, 1.8, 5.2), look: new THREE.Vector3(0, 1.0, -1.5) }, // Better tunnel viewing angle
      brick: { pos: new THREE.Vector3(0, 1.15, 4.1), look: new THREE.Vector3(0, 0.8, 0) },
      wind: { pos: new THREE.Vector3(0.4, 1.2, 3.4), look: new THREE.Vector3(0, 0.8, 0) },
      rain: { pos: new THREE.Vector3(-0.2, 1.6, 3.6), look: new THREE.Vector3(0, 0.9, 0) },
      disintegrate: { pos: new THREE.Vector3(0, 1.2, 3.9), look: new THREE.Vector3(0, 0.9, 0) },
    };
    const preset = presets[sceneMode];
    // Scroll-driven cinematic: zoom into one brick while others slide out via StructureGroup
    const liftProgress = THREE.MathUtils.clamp(progress.brick, 0, 1);
    const disProgress = THREE.MathUtils.clamp(progress.disintegrate, 0, 1);
    const lifted = preset.pos.clone();
    // smoother S-curve easing for cinematic feel
    const s = 0.5 - 0.5 * Math.cos(Math.PI * THREE.MathUtils.clamp((liftProgress - 0.02) / 0.98, 0, 1));
    const zoomInBase = sceneMode === 'brick' ? 0.8 : sceneMode === 'disintegrate' ? 1.8 : 2.8;
    const zoomIn = zoomInBase * s; 
    const lateral = sceneMode === 'brick' ? 0.15 * s : 0.4 * s * Math.sin(s * Math.PI); // minimal lateral for brick
    lifted.z -= zoomIn;
    lifted.y -= 0.55 * s;
    // During disintegration, gently move closer as that section comes into view
    if (sceneMode === 'disintegrate') {
      lifted.z -= 0.6 * disProgress;
      lifted.y += 0.1 * disProgress;
    }
    lifted.x += lateral;
    camera.position.lerp(lifted, 0.05);
    // subtle parallax on look target with cursor
    target.current.x = THREE.MathUtils.lerp(target.current.x, preset.look.x + cursor.x * 0.2, 0.06);
    target.current.y = THREE.MathUtils.lerp(target.current.y, preset.look.y - cursor.y * 0.1, 0.06);
    target.current.z = THREE.MathUtils.lerp(target.current.z, preset.look.z, 0.06);
    camera.lookAt(target.current);
  });
  return null;
}

// Removed WindParticles (unused)

// Removed RainParticles (unused)

type ParticleMode = 'wind' | 'rain' | 'disintegrate' | 'off';
function DisintegrationParticles({ visible = true, cursor, heroMatrixRef, mode = 'off', windProgress = 0, rainProgress = 0, disProgress = 0, debugColors = false }: { visible?: boolean, cursor: { x: number; y: number }, heroMatrixRef: React.MutableRefObject<THREE.Matrix4>, mode?: ParticleMode, windProgress?: number, rainProgress?: number, disProgress?: number, debugColors?: boolean }) {
  // Instanced 3D spheres renderer path (true 3D particles)
  const groupRef = useRef<THREE.Group>(null);
  const innerRef = useRef<THREE.Group>(null);
  const instRef = useRef<THREE.InstancedMesh>(null);
  const velocityRef = useRef<Float32Array | null>(null);
  const lastModeRef = useRef<ParticleMode>('off');
  const baseRef = useRef<Float32Array | null>(null);
  const currentRef = useRef<Float32Array | null>(null); // current particle positions
  const baseNormalsRef = useRef<Float32Array | null>(null);
  const activationRef = useRef<Float32Array | null>(null); // per-particle excitement (0..1)
  const glowRef = useRef<Float32Array | null>(null); // visual brightness driven by interaction force
  const gltf = useGLTF('/Octa2.glb') as any;
  const { camera } = useThree();
  const ray = useMemo(() => new THREE.Raycaster(), []);
  const plane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 0, 1), 0), []); // z=0 plane
  const obstacleRadiusRef = useRef<number>(1.0);
  const sdfRef = useRef<{ width: number; height: number; cell: number; minY: number; minZ: number; dist: Float32Array } | null>(null);
  const sdfXZRef = useRef<{ width: number; height: number; cell: number; minX: number; minZ: number; dist: Float32Array } | null>(null);
  const bboxRef = useRef<{ minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number }>({ minX: 0, maxX: 0, minY: 0, maxY: 0, minZ: 0, maxZ: 0 });
  const dummyObj = useMemo(() => new THREE.Object3D(), []);
  const tmpColor = useMemo(() => new THREE.Color(), []);

  // Build a particle set sampled from the brick geometry so shape memory matches the brick
  const positions = useMemo(() => {
    // collect vertices from meshes
    const collected: number[] = [];
    const root = gltf.scene as THREE.Object3D;
    root.updateMatrixWorld(true);
    // Prefer a mesh named like the octa brick; fallback to first mesh
    let targetMesh: THREE.Mesh | null = null;
    root.traverse((obj: any) => {
      if (targetMesh) return;
      if (obj && obj.isMesh) {
        const name = (obj.name || '').toLowerCase();
        if (name.includes('octa') || name.includes('brick')) targetMesh = obj as THREE.Mesh;
      }
    });
    if (!targetMesh) {
      root.traverse((obj: any) => {
        if (!targetMesh && obj && obj.isMesh) targetMesh = obj as THREE.Mesh;
      });
    }
    if (targetMesh && (targetMesh as THREE.Mesh).geometry && ((targetMesh as THREE.Mesh).geometry as THREE.BufferGeometry).attributes.position) {
      const posAttr = ((targetMesh as THREE.Mesh).geometry as THREE.BufferGeometry).attributes.position as THREE.BufferAttribute;
      const nrmAttr = ((targetMesh as THREE.Mesh).geometry as THREE.BufferGeometry).attributes.normal as THREE.BufferAttribute | undefined;
      const arr = posAttr.array as Float32Array | number[];
      const targetParticles = 4500; // halve particle count for performance
      const step = Math.max(1, Math.floor(posAttr.count / targetParticles));
      const m = (targetMesh as THREE.Mesh).matrixWorld.clone();
      const v = new THREE.Vector3();
      const baseScale = 0.80; // slightly reduce overall particle brick size (smaller)
      for (let i = 0; i < posAttr.count; i += step) {
        const ix = i * 3;
        v.set((arr as any)[ix + 0], (arr as any)[ix + 1], (arr as any)[ix + 2]).applyMatrix4(m).multiplyScalar(baseScale);
        collected.push(v.x, v.y, v.z);
      }
      // capture normals if available
      if (nrmAttr && nrmAttr.array) {
        const nrmArr = nrmAttr.array as Float32Array | number[];
        const normals: number[] = [];
        for (let i = 0; i < posAttr.count; i += step) {
          const ix = i * 3;
          normals.push((nrmArr as any)[ix + 0], (nrmArr as any)[ix + 1], (nrmArr as any)[ix + 2]);
        }
        // store temporarily on baseNormalsRef after normalization
        const nrm = new Float32Array(normals.length);
        for (let i = 0; i < normals.length; i += 3) {
          const nx = normals[i + 0];
          const ny = normals[i + 1];
          const nz = normals[i + 2];
          const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
          nrm[i + 0] = nx / len;
          nrm[i + 1] = ny / len;
          nrm[i + 2] = nz / len;
        }
        baseNormalsRef.current = nrm;
      }
    } else {
      // fallback: aggregate all meshes
      root.traverse((obj: any) => {
        if (obj && obj.isMesh && obj.geometry && obj.geometry.attributes && obj.geometry.attributes.position) {
          const posAttr = obj.geometry.attributes.position as THREE.BufferAttribute;
          const arr = posAttr.array as Float32Array | number[];
          const targetParticles = 8000; // increase particle count for better coverage
          const step = Math.max(1, Math.floor(posAttr.count / targetParticles));
          console.log(`[Particles] Sampling mesh: ${posAttr.count} vertices, step=${step}, target=${targetParticles}`);
          const m = (obj as THREE.Mesh).matrixWorld.clone();
          const v = new THREE.Vector3();
          const baseScale = 0.60;
          for (let i = 0; i < posAttr.count; i += step) {
            const ix = i * 3;
            v.set((arr as any)[ix + 0], (arr as any)[ix + 1], (arr as any)[ix + 2]).applyMatrix4(m).multiplyScalar(baseScale);
            collected.push(v.x, v.y, v.z);
          }
        }
      });
    }
    console.log(`[Particles] Total collected: ${collected.length / 3} particles from CPU sampling`);
    if (collected.length === 0) return new Float32Array(0);
    // Compute model longest side to match hero brick scale exactly
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (let i = 0; i < collected.length; i += 3) {
      const x = collected[i + 0];
      const y = collected[i + 1];
      const z = collected[i + 2];
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
      if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
    }
    const sizeY = maxY - minY;
    const sizeZ = maxZ - minZ;
    bboxRef.current = { minX, maxX, minY, maxY, minZ, maxZ };
    const scaleN = 1.0; // match main brick scale exactly

    const base = new Float32Array(collected.length);
    for (let i = 0; i < collected.length; i += 3) {
      base[i + 0] = collected[i + 0] * scaleN;
      base[i + 1] = collected[i + 1] * scaleN;
      base[i + 2] = collected[i + 2] * scaleN;
    }
    baseRef.current = base;
    // approximate obstacle radius for wind deflection (match brick scale closely)
    const rYZ = Math.max(sizeY, sizeZ) * 0.5 * 1.0;
    obstacleRadiusRef.current = Math.max(0.2, rYZ);

    // Build a simple 2D distance field in YZ for wind-collision against the brick silhouette
    const gridCell = 0.06; // higher resolution for tighter fit
    const padding = 0.08;  // minimal padding around the brick
    const minYg = minY - padding, maxYg = maxY + padding;
    const minZg = minZ - padding, maxZg = maxZ + padding;
    const gw = Math.max(8, Math.ceil((maxZg - minZg) / gridCell));
    const gh = Math.max(8, Math.ceil((maxYg - minYg) / gridCell));
    const dist = new Float32Array(gw * gh);
    dist.fill(1e6);
    // seed zeros at occupied cells from base points
    for (let i = 0; i < base.length; i += 3) {
      const y = base[i + 1], z = base[i + 2];
      const gy = Math.floor((y - minYg) / gridCell);
      const gz = Math.floor((z - minZg) / gridCell);
      if (gy >= 0 && gy < gh && gz >= 0 && gz < gw) {
        const idx = gy * gw + gz;
        dist[idx] = 0;
      }
    }
    // forward pass
    for (let y = 0; y < gh; y++) {
      for (let z = 0; z < gw; z++) {
        const idx = y * gw + z;
        if (y > 0) dist[idx] = Math.min(dist[idx], dist[(y - 1) * gw + z] + gridCell);
        if (z > 0) dist[idx] = Math.min(dist[idx], dist[y * gw + (z - 1)] + gridCell);
        if (y > 0 && z > 0) dist[idx] = Math.min(dist[idx], dist[(y - 1) * gw + (z - 1)] + Math.SQRT1_2 * gridCell);
      }
    }
    // backward pass
    for (let y = gh - 1; y >= 0; y--) {
      for (let z = gw - 1; z >= 0; z--) {
        const idx = y * gw + z;
        if (y + 1 < gh) dist[idx] = Math.min(dist[idx], dist[(y + 1) * gw + z] + gridCell);
        if (z + 1 < gw) dist[idx] = Math.min(dist[idx], dist[y * gw + (z + 1)] + gridCell);
        if (y + 1 < gh && z + 1 < gw) dist[idx] = Math.min(dist[idx], dist[(y + 1) * gw + (z + 1)] + Math.SQRT1_2 * gridCell);
      }
    }
    sdfRef.current = { width: gw, height: gh, cell: gridCell, minY: minYg, minZ: minZg, dist };
    // Build XZ SDF for rain deflection
    const minXg = minX - padding, maxXg = maxX + padding;
    const minZg2 = minZ - padding, maxZg2 = maxZ + padding;
    const gwXZ = Math.max(8, Math.ceil((maxXg - minXg) / gridCell));
    const ghXZ = Math.max(8, Math.ceil((maxZg2 - minZg2) / gridCell));
    const distXZ = new Float32Array(gwXZ * ghXZ);
    distXZ.fill(1e6);
    for (let i = 0; i < base.length; i += 3) {
      const x = base[i + 0], z = base[i + 2];
      const gx = Math.floor((x - minXg) / gridCell);
      const gz = Math.floor((z - minZg2) / gridCell);
      if (gx >= 0 && gx < gwXZ && gz >= 0 && gz < ghXZ) distXZ[gz * gwXZ + gx] = 0;
    }
    for (let z = 0; z < ghXZ; z++) {
      for (let x = 0; x < gwXZ; x++) {
        const idx = z * gwXZ + x;
        if (z > 0) distXZ[idx] = Math.min(distXZ[idx], distXZ[(z - 1) * gwXZ + x] + gridCell);
        if (x > 0) distXZ[idx] = Math.min(distXZ[idx], distXZ[z * gwXZ + (x - 1)] + gridCell);
        if (z > 0 && x > 0) distXZ[idx] = Math.min(distXZ[idx], distXZ[(z - 1) * gwXZ + (x - 1)] + Math.SQRT1_2 * gridCell);
      }
    }
    for (let z = ghXZ - 1; z >= 0; z--) {
      for (let x = gwXZ - 1; x >= 0; x--) {
        const idx = z * gwXZ + x;
        if (z + 1 < ghXZ) distXZ[idx] = Math.min(distXZ[idx], distXZ[(z + 1) * gwXZ + x] + gridCell);
        if (x + 1 < gwXZ) distXZ[idx] = Math.min(distXZ[idx], distXZ[z * gwXZ + (x + 1)] + gridCell);
        if (z + 1 < ghXZ && x + 1 < gwXZ) distXZ[idx] = Math.min(distXZ[idx], distXZ[(z + 1) * gwXZ + (x + 1)] + Math.SQRT1_2 * gridCell);
      }
    }
    sdfXZRef.current = { width: gwXZ, height: ghXZ, cell: gridCell, minX: minXg, minZ: minZg2, dist: distXZ };

    // initialize current positions ON the base shape for seamless dissolve
    const curr = new Float32Array(collected.length);
    for (let i = 0; i < collected.length; i += 3) {
      // small jitter so it doesn't look perfectly static
      curr[i + 0] = base[i + 0] + (Math.random() - 0.5) * 0.005;
      curr[i + 1] = base[i + 1] + (Math.random() - 0.5) * 0.005;
      curr[i + 2] = base[i + 2] + (Math.random() - 0.5) * 0.005;
    }
    currentRef.current = curr;

    // initialize velocities and activation for instanced particles
    velocityRef.current = new Float32Array(collected.length); // zeros by default
    activationRef.current = new Float32Array(collected.length / 3); // zeros
    glowRef.current = new Float32Array(collected.length / 3); // zeros
    return base; // we will write directly into instance matrices from base
  }, [gltf]);

  // Build draw geometry for instanced tiny spheres
  const [instGeom, instMat, count] = useMemo(() => {
    const count = (positions.length / 3) | 0;
    const geom = new THREE.SphereGeometry(0.02, 8, 8);
    const mat = new THREE.MeshBasicMaterial({ color: '#ffffff' });
    (mat as any).vertexColors = true;
    (mat as any).depthTest = true;
    (mat as any).depthWrite = true;
    (mat as any).toneMapped = false;
    return [geom, mat, count] as const;
  }, [positions]);

  // (No longer using points sprites; keep instanced spheres only)

  useFrame(({ clock }) => {
    // Snap/lerp to hero brick transform so particles align across sections
    if (groupRef.current) {
      // Read world transform from heroMatrixRef and apply to our group
      const m = heroMatrixRef.current;
      const pos = new THREE.Vector3();
      const quat = new THREE.Quaternion();
      const scl = new THREE.Vector3();
      m.decompose(pos, quat, scl);
      const lerpF = mode === 'disintegrate' ? 1.0 : 0.4; // lock to hero in material study
      groupRef.current.position.lerp(pos, lerpF);
      groupRef.current.quaternion.slerp(quat, lerpF);
      // Always match hero brick scale on outer group; apply fine offset on inner group
      groupRef.current.scale.lerp(scl, lerpF);
      if (innerRef.current) innerRef.current.scale.setScalar(1.0); // match hero brick scale exactly in all modes
    }
    if (!instRef.current) return;
    const mesh = instRef.current;
    const base = baseRef.current;
    let vel = velocityRef.current;
    const act = activationRef.current;
    const glow = glowRef.current;
    const baseNormals = baseNormalsRef.current;
    const curr = currentRef.current;
    if (!base || !vel || !act || !curr || !glow) return;

    // compute cursor world point on z=0 plane and convert to local
    const ndc = new THREE.Vector2(cursor.x, -cursor.y);
    ray.setFromCamera(ndc, camera);
    const worldPoint = new THREE.Vector3();
    ray.ray.intersectPlane(plane, worldPoint);
    const localPoint = groupRef.current ? groupRef.current.worldToLocal(worldPoint.clone()) : worldPoint.clone();
    
    const t = clock.elapsedTime;
    
    // Debug cursor every 30 frames
    if (Math.floor(t * 60) % 30 === 0 && mode === 'disintegrate') {
      console.log(`[CPU Particles] Cursor: world=${worldPoint.x.toFixed(2)}, ${worldPoint.y.toFixed(2)}, ${worldPoint.z.toFixed(2)} | local=${localPoint.x.toFixed(2)}, ${localPoint.y.toFixed(2)}, ${localPoint.z.toFixed(2)}`);
    }
    // Mode-dependent dynamics
    // wind/rain: slight overlap is ok, but clamp lateral motion strongly in rain
    const rainBlend = THREE.MathUtils.smoothstep(0.05, 0.9, (rainProgress as number) || 0);
    const windBlend = THREE.MathUtils.smoothstep(0.08, 0.85, (windProgress as number) || 0);
    const isDis = mode === 'disintegrate';
    const isWindResidual = windBlend > 0.9 && rainBlend < 0.05; // small overlap window
    let isWind = mode === 'wind' || isWindResidual;
    let isRain = mode === 'rain' || (rainBlend > 0.25);
    if (isDis) { isWind = false; isRain = false; }
    let dampingBase = isDis ? 0.98 : (isWind ? 0.96 : 0.92);
    // In rain, fade out shape memory and cursor effects; in disintegrate, strengthen spring smoothly to form brick
    const disBlend = THREE.MathUtils.smoothstep(0.0, 1.0, (disProgress as number) || 0);
    const kSpringRest = isDis ? THREE.MathUtils.lerp(0.08, 0.25, disBlend) : (isWind ? 0.0 : isRain ? 0.0 : 0.12);
    const kSpringExcited = isDis ? THREE.MathUtils.lerp(0.15, 0.6, disBlend) : (isWind ? 0.0 : isRain ? 0.0 : 0.02);
    const sigmaLocal = isDis ? THREE.MathUtils.lerp(1.5, 1.0, disBlend) : (isWind ? 0.0 : (isRain ? 0.0 : 0.5));
    const repelStrength = isDis ? THREE.MathUtils.lerp(0.0, 0.3, disBlend) : (isWind ? 0.0 : (isRain ? 0.0 : 0.06));
    const outwardGain = 0.0;

    const count = positions.length / 3;
    let maxActivation = 0;
    let maxGlow = 0;
    // Snap transforms on mode change to disintegrate to ensure perfect alignment
    if (groupRef.current && lastModeRef.current !== mode) {
      const m = heroMatrixRef.current;
      const posSnap = new THREE.Vector3();
      const quatSnap = new THREE.Quaternion();
      const sclSnap = new THREE.Vector3();
      m.decompose(posSnap, quatSnap, sclSnap);
      if (mode === 'disintegrate') {
        groupRef.current.position.copy(posSnap);
        groupRef.current.quaternion.copy(quatSnap);
        // Match hero brick scale exactly
        groupRef.current.scale.copy(sclSnap);
        if (velocityRef.current) velocityRef.current.fill(0);
      }
      // Console debug: section + intended color palette (debugColors forces R/G/B)
      const _rainBlend = THREE.MathUtils.smoothstep(0.05, 0.9, (rainProgress as number) || 0);
      const _isDis = mode === 'disintegrate';
      const color = _isDis ? { r: 0.95, g: 0.65, b: 0.30 }
        : (mode === 'rain' || (_rainBlend > 0.25)) ? { r: 0.15, g: 0.55, b: 1.0 }
        : { r: 0.70, g: 0.70, b: 0.70 };
      // Convert to CSS rgb for readability
      const to255 = (v: number) => Math.round(255 * THREE.MathUtils.clamp(v, 0, 1));
      const css = `rgb(${to255(color.r)}, ${to255(color.g)}, ${to255(color.b)})`;
      console.log('[Particles] Mode changed →', mode, { debugColors, palette: color, css });
      lastModeRef.current = mode;
    }

    for (let p = 0, i = 0; p < count; p++, i += 3) {
      // current position is encoded in instance matrix; reconstruct from base + velocity accumulator
      const bx = base[i + 0];
      const by = base[i + 1];
      const bz = base[i + 2];
      let cx = curr[i + 0]; let cy = curr[i + 1]; let cz = curr[i + 2];
      // we store current offset in vel temporarily beyond velocities (abuse vel as state)
      // vel[i+0..2] holds velocity; we'll accumulate into position variables

      // Cursor vector and base falloff (always defined for downstream swirl math)
      const dx = cx - localPoint.x;
      const dy = cy - localPoint.y;
      const dz = cz - localPoint.z;
      const distSq = dx * dx + dy * dy + dz * dz;
      const dist = Math.sqrt(distSq) + 1e-6;
      let falloff = (sigmaLocal > 0.0) ? Math.exp(-(distSq) / (2 * sigmaLocal * sigmaLocal)) : 0.0;
      // Base flow and forces (no repel in wind mode; restore in disintegrate for cursor play)
      let rx = 0, ry = 0, rz = 0;
      if (isDis) {
        const repel = 0.10 * falloff; // gentle cursor pull/push
        rx = (dx / dist) * repel;
        ry = (dy / dist) * repel;
        rz = (dz / dist) * repel;
      } else if (!isWind && !isRain) {
        const repel = (repelStrength * falloff);
        rx = (dx / dist) * repel;
        ry = (dy / dist) * repel;
        rz = (dz / dist) * repel;
      }

      // subtle local jitter
      const phase = p * 0.37;
      const jitterAmp = isWind ? 0.0003 : (isRain ? 0.00015 : (isDis ? 0.0001 : 0.0018));
      const jx = (isWind || isRain) ? 0.0 : Math.sin(t * 2.0 + phase) * jitterAmp;
      const jy = isRain ? 0.0 : Math.cos(t * 1.7 + phase * 1.3) * jitterAmp;
      const jz = (isWind || isRain) ? 0.0 : Math.sin(t * 2.3 + phase * 0.7) * jitterAmp;

      // Curl-like flow; stronger in wind, subtle otherwise
      const flowAmp = isWind ? 0.06 : (isDis ? 0.0 : 0.04);
      const fxFlow = (Math.sin(0.7 * cy + 0.45 * t) - Math.cos(0.6 * cz - 0.3 * t)) * flowAmp;
      const fyFlow = (Math.sin(0.6 * cz + 0.5 * t) - Math.cos(0.8 * cx + 0.2 * t)) * flowAmp;
      const fzFlow = (Math.sin(0.5 * cx - 0.6 * t) - Math.cos(0.7 * cy + 0.3 * t)) * flowAmp;

      // spring back to base (shape memory)
      // Update activation: increase near cursor, then decay
      act[p] = Math.min(1, act[p] * 0.98 + falloff * 0.25);
      if (act[p] > maxActivation) maxActivation = act[p];
      const kSpring = kSpringExcited + (kSpringRest - kSpringExcited) * (1 - act[p]);
      const damping = dampingBase; // could also vary with act

      // Outward pressure along base normal kept minimal to avoid uniform scaling
      let nxNorm = 0, nyNorm = 0, nzNorm = 0;
      if (baseNormals) {
        nxNorm = baseNormals[i + 0];
        nyNorm = baseNormals[i + 1];
        nzNorm = baseNormals[i + 2];
      } else {
        // fallback: radial from center
        const lenb = Math.sqrt(bx * bx + by * by + bz * bz) || 1;
        nxNorm = bx / lenb; nyNorm = by / lenb; nzNorm = bz / lenb;
      }
      const outward = outwardGain * Math.pow(act[p], 1.2);

      // Tangential swirl around the cursor for local eddies
      // Compute a tangent vector orthogonal to toCursor and world up
      const upx = 0, upy = 1, upz = 0;
      const tx = upy * dz - upz * dy;
      const ty = upz * dx - upx * dz;
      const tz = upx * dy - upy * dx;
      const tlen = Math.max(Math.sqrt(tx * tx + ty * ty + tz * tz), 1e-6);
      const swirlStrength = (isWind ? 0.16 : (isRain || isDis ? 0.0 : 0.06)) * act[p]; // Increased wind swirl from 0.1 to 0.16
      const sx = (tx / tlen) * swirlStrength;
      const sy = (ty / tlen) * swirlStrength;
      const sz = (tz / tlen) * swirlStrength;

      // Per-particle brightness driven by local force, localized and thresholded
      const localFalloff = falloff; // 0..1
      const fi = Math.max(0, (localFalloff - 0.12) * 1.4) + Math.max(0, (act[p] - 0.20) * 0.6);
      glow[p] = Math.min(1, glow[p] * 0.88 + fi);
      if (glow[p] > maxGlow) maxGlow = glow[p];

      // Wind-tunnel style flow left->right around obstacle
      const flowMix = (isWind || isRain || isDis) ? 0.0 : act[p];
      let fx = (bx - cx) * kSpring + rx + jx + (fxFlow + sx) * flowMix + (isDis ? 0.0 : nxNorm * outward);
      let fy = (by - cy) * kSpring + ry + jy + (fyFlow + sy) * flowMix + (isDis ? 0.0 : nyNorm * outward);
      let fz = (bz - cz) * kSpring + rz + jz + (fzFlow + sz) * flowMix + (isDis ? 0.0 : nzNorm * outward);
      if (isDis) {
        const dxB = bx - cx, dyB = by - cy, dzB = bz - cz;
        const dBase = Math.sqrt(dxB*dxB + dyB*dyB + dzB*dzB);
        const snapT = THREE.MathUtils.smoothstep(0.10, 0.60, dBase);
        const kSnap = 0.22 * disBlend;
        fx += dxB * kSnap * snapT;
        fy += dyB * kSnap * snapT;
        fz += dzB * kSnap * snapT;
      }
      if (mode === 'wind') {
        // Base wind speed: slower, more dramatic wind
        // Taper wind carry as rain starts to blend in to avoid sudden change
        const baseU = 0.019 * (1.0 - THREE.MathUtils.smoothstep(0.0, 0.35, rainBlend)); // Reduced from 0.028
        const randSeed = Math.sin(p * 12.9898) * 43758.5453;
        const rand01 = randSeed - Math.floor(randSeed);
        const U = baseU * (0.9 + 0.2 * rand01);
        // Deflect based on YZ distance field around the brick silhouette
        const sdf = sdfRef.current;
        if (sdf) {
          const gyIdx = THREE.MathUtils.clamp(Math.floor((cy - sdf.minY) / sdf.cell), 1, sdf.height - 2);
          const gzIdx = THREE.MathUtils.clamp(Math.floor((cz - sdf.minZ) / sdf.cell), 1, sdf.width - 2);
          const idx = gyIdx * sdf.width + gzIdx;
          const d0 = sdf.dist[idx];
          if (d0 < 0.12) {
            // gradient approx
            const dY = (sdf.dist[(gyIdx + 1) * sdf.width + gzIdx] - sdf.dist[(gyIdx - 1) * sdf.width + gzIdx]) / (2 * sdf.cell);
            const dZ = (sdf.dist[gyIdx * sdf.width + (gzIdx + 1)] - sdf.dist[gyIdx * sdf.width + (gzIdx - 1)]) / (2 * sdf.cell);
            const glen = Math.max(Math.hypot(dY, dZ), 1e-5);
            const nY = dY / glen, nZ = dZ / glen; // outward normal approx
            const push = (0.12 - d0) * 0.12;
            fy += nY * push;
            fz += nZ * push;
            // tangential slip around contour
            const tY = -nZ, tZ = nY;
            const slip = (0.12 - d0) * 0.08;
            fy += tY * slip;
            fz += tZ * slip;
            // velocity reflection (bounce) with restitution and slight tangential damping
            const vn = vel[i + 1] * nY + vel[i + 2] * nZ;
            let vyr = vel[i + 1] - 2 * vn * nY;
            let vzr = vel[i + 2] - 2 * vn * nZ;
            const restitution = 0.5; // 0..1, lower = more loss
            vyr *= restitution;
            vzr *= restitution;
            // tangential damping
            const vtY = vyr - (vyr * nY + vzr * nZ) * nY;
            const vtZ = vzr - (vyr * nY + vzr * nZ) * nZ;
            vyr -= vtY * 0.1;
            vzr -= vtZ * 0.1;
            vel[i + 1] = vyr;
            vel[i + 2] = vzr;
          }
        }
        // Wake vortices downstream (small amplitude, dephased per particle)
        if (cx > 0) {
          const phaseP = (p * 0.37) % (Math.PI * 2);
          const w = 0.004 * Math.sin(3.0 * cx + phaseP - 1.05 * t);
          fy += w;
          fz -= w * 0.8;
        }
        // Target x-velocity to U for constant flow (slow blend)
        vel[i + 0] = THREE.MathUtils.lerp(vel[i + 0], U, 0.12);
      }
      // Rain: gravity + subtle flow + deflection only; no spring-to-shape to avoid early formation
      if (isRain) {
        const gy = -0.035 * (0.5 + 0.5 * rainBlend);
        fy += gy;
        // mild horizontal damping so they still move
        const lateralDamp = THREE.MathUtils.lerp(0.985, 0.94, rainBlend);
        vel[i + 0] *= lateralDamp;
        vel[i + 2] *= lateralDamp;
        // light vertical turbulence
        fy += (Math.sin(0.7 * cx + 0.9 * t + p * 0.13) * 0.002);
        fx += (Math.sin(0.4 * cy + 0.6 * t + p * 0.11) * 0.001);
        fz += (Math.cos(0.5 * cx - 0.7 * t + p * 0.07) * 0.001);
        // probabilistic early drop to encourage gradual transition, without instant respawn
        const rKill = Math.abs(Math.sin(p * 23.71 + t * 0.63)) % 1;
        const killChance = 0.01 * rainBlend; // <=1% per frame
        if (rKill < killChance) {
          vel[i + 1] -= (0.05 + 0.03 * rKill) * rainBlend; // softer downward nudge
        }
      }

      // integrate with velocity cap to avoid flicker
      const vcap = isDis ? 0.045 : (isWind ? 0.05 : 0.06);
      vel[i + 0] = Math.max(Math.min((vel[i + 0] + fx) * damping, vcap), -vcap);
      vel[i + 1] = Math.max(Math.min((vel[i + 1] + fy) * damping, vcap), -vcap);
      vel[i + 2] = Math.max(Math.min((vel[i + 2] + fz) * damping, vcap), -vcap);
      // For rain, clamp lateral velocities very tightly to keep motion vertical
      if (isRain) {
        const vLatMax = 0.01;
        vel[i + 0] = THREE.MathUtils.clamp(vel[i + 0], -vLatMax, vLatMax);
        vel[i + 2] = THREE.MathUtils.clamp(vel[i + 2], -vLatMax, vLatMax);
      }

      let nx = cx + vel[i + 0];
      let ny = cy + vel[i + 1];
      let nz = cz + vel[i + 2];

      // Boundaries: for wind, spawn/despawn in a canal moving left->right; otherwise keep cubic stage
      if (mode === 'wind') {
        const canalY = 1.2, canalZ = 2.2; // wider again, same height
        const canalX = 4.0;
        // helper: respawn at left inlet with dense circular cross-section
        const respawnAtInlet = () => {
          const r1 = (Math.sin(p * 12.9898 + t * 0.73) * 43758.5453) % 1;
          const r2 = (Math.sin(p * 78.233 + t * 1.11) * 15731.743) % 1;
          const ang = 2.0 * Math.PI * r2;
          const Rspawn = Math.min(canalY, canalZ) * 0.6;
          const rad = Rspawn * Math.sqrt(Math.abs(r1));
          nx = -canalX - 0.1;
          ny = THREE.MathUtils.clamp(rad * Math.cos(ang), -canalY, canalY);
          nz = THREE.MathUtils.clamp(rad * Math.sin(ang), -canalZ, canalZ);
          // kick velocity rightwards, reset lateral components
          vel[i + 0] = Math.max(vel[i + 0], 0.02);
          vel[i + 1] = 0.0;
          vel[i + 2] = 0.0;
        };
        // despawn on top/bottom/front/back walls
        if (ny > canalY || ny < -canalY || nz > canalZ || nz < -canalZ) {
          respawnAtInlet();
        }
        // out on the right → respawn on left inlet
        if (nx > canalX) {
          respawnAtInlet();
        }
        // safety: keep within left margin
        if (nx < -canalX - 0.5) nx = -canalX - 0.5;
      } else {
        // In disintegrate mode, remove hard stage bounds so particles spring back toward the brick
        if (!isRain && !isDis) {
          const halfExtent = 3.2;
          if (nx > halfExtent) { nx = halfExtent; vel[i + 0] *= -0.35; }
          if (nx < -halfExtent) { nx = -halfExtent; vel[i + 0] *= -0.35; }
          if (ny > halfExtent) { ny = halfExtent; vel[i + 1] *= -0.35; }
          if (ny < -halfExtent) { ny = -halfExtent; vel[i + 1] *= -0.35; }
          if (nz > halfExtent) { nz = halfExtent; vel[i + 2] *= -0.35; }
          if (nz < -halfExtent) { nz = -halfExtent; vel[i + 2] *= -0.35; }
        }
      }

      // No hard shape/global clamps while excited; rely on spring + damping to return

      // Rain respawn + deflection: if outside bounds, respawn; otherwise gently deflect around brick (XZ SDF)
      if (isRain) {
        // Narrower collision avoidance near brick: reduce vertical offset to avoid "pyramid" force feel
        const topY = 2.6, bottomY = -2.2;
        const boundX = 2.6, boundZ = 2.0;
        // When entering rain, start spawning from above as progress grows, but keep it gradual
        const rSpawn = Math.abs(Math.sin(p * 19.19 + t * 0.37)) % 1;
        const spawnChance = Math.max(0, rainBlend - 0.25) * 0.01; // up to ~1% per frame
        const gentleSpawn = rSpawn < spawnChance;
        const shouldRespawn = gentleSpawn || ny < bottomY || Math.abs(nx) > boundX || Math.abs(nz) > boundZ;
        if (shouldRespawn) {
          const r1 = (Math.sin(p * 19.19 + t * 0.37) * 104729.0) % 1;
          const r2 = (Math.sin(p * 23.71 + t * 0.41) * 130073.0) % 1;
          const ang = 2.0 * Math.PI * r2;
          const R = 1.2; // wider spawn column directly above the brick center
          const rad = R * Math.sqrt(Math.abs(r1));
          nx = rad * Math.cos(ang);
          ny = topY + (r1 - 0.5) * 0.15;
          nz = rad * Math.sin(ang);
          vel[i + 0] = (Math.random() - 0.5) * 0.0006;
          vel[i + 1] = (-0.02 - 0.02 * r1) * Math.max(0.2, rainBlend);
          vel[i + 2] = (Math.random() - 0.5) * 0.0006;
        }
        // XZ deflection: if within the brick's projected footprint (with padding), push drops outward strongly
        const sdfXZ = sdfXZRef.current;
        if (sdfXZ) {
          const gx = THREE.MathUtils.clamp(Math.floor((cx - sdfXZ.minX) / sdfXZ.cell), 1, sdfXZ.width - 2);
          const gz = THREE.MathUtils.clamp(Math.floor((cz - sdfXZ.minZ) / sdfXZ.cell), 1, sdfXZ.height - 2);
          const idx = gz * sdfXZ.width + gx;
          const d0 = sdfXZ.dist[idx];
          const threshold = 0.08;
          if (d0 < threshold) {
            const dX = (sdfXZ.dist[gz * sdfXZ.width + (gx + 1)] - sdfXZ.dist[gz * sdfXZ.width + (gx - 1)]) / (2 * sdfXZ.cell);
            const dZ = (sdfXZ.dist[(gz + 1) * sdfXZ.width + gx] - sdfXZ.dist[(gz - 1) * sdfXZ.width + gx]) / (2 * sdfXZ.cell);
            const gl = Math.max(Math.hypot(dX, dZ), 1e-5);
            const nX = dX / gl, nZ = dZ / gl;
            const push = (threshold - d0) * THREE.MathUtils.lerp(0.04, 0.10, rainBlend);
            fx += nX * push;
            fz += nZ * push;
            // reduce lateral velocity to avoid lingering and add slight extra downward acceleration
            vel[i + 0] *= 0.65;
            vel[i + 2] *= 0.65;
            fy += -0.012 * (1.0 + rainBlend);
          }
        }
      }

      // write back current position and update instance
      curr[i + 0] = nx;
      curr[i + 1] = ny;
      curr[i + 2] = nz;
      // update instanced transform
      dummyObj.position.set(nx, ny, nz);
      dummyObj.rotation.set(0, 0, 0);
      dummyObj.scale.setScalar(1);
      dummyObj.updateMatrix();
      mesh.setMatrixAt(p, dummyObj.matrix);
      const bright = Math.max(0.25, glow[p]);
      let baseR = 0.85, baseG = 0.85, baseB = 0.85; // wind: light grey
      if (isRain) { baseR = 0.20; baseG = 0.62; baseB = 1.00; } // rain: blue
      if (isDis) { baseR = 1.00; baseG = 0.78; baseB = 0.36; } // material: amber
      if (debugColors) {
        if (isWind) { baseR = 1.0; baseG = 0.0; baseB = 0.0; }
        if (isRain) { baseR = 0.0; baseG = 1.0; baseB = 0.0; }
        if (isDis)  { baseR = 0.0; baseG = 0.0; baseB = 1.0; }
      }
      const cr = Math.min(1, baseR + 0.5 * bright);
      const cg = Math.min(1, baseG + 0.6 * bright);
      const cb = Math.min(1, baseB + 0.8 * bright);
      tmpColor.setRGB(cr, cg, cb);
      (mesh as any).setColorAt?.(p, tmpColor);
    }
    mesh.instanceMatrix.needsUpdate = true;
    (mesh as any).instanceColor && ((mesh as any).instanceColor.needsUpdate = true);

    // Avoid global emissive changes to keep brightness truly per-particle
  });

  return (
    <group ref={groupRef} visible={visible} position={[0, 0.8, 0]} scale={1}>
      <group ref={innerRef}>
        <instancedMesh ref={instRef} args={[instGeom as any, instMat as any, count]} frustumCulled={false} renderOrder={10}
          onUpdate={(m) => {
            // Ensure instanceColor buffer exists to support setColorAt
            const mesh = m as any;
            if (!mesh.instanceColor || mesh.instanceColor.count !== count) {
              mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3);
            }
          }}
        >
        </instancedMesh>
      </group>
    </group>
  );
}

// GPU-based disintegration particles using WebGL GPGPU (ping-pong FBO)
function DisintegrationParticlesGPU({ visible = true, cursor, cursorVel, heroMatrixRef, mode }: { visible?: boolean, cursor: { x: number; y: number }, cursorVel: { x: number; y: number }, heroMatrixRef: React.MutableRefObject<THREE.Matrix4>, mode: SceneMode }) {
  const { gl, camera } = useThree();
  const groupRef = useRef<THREE.Group>(null);
  const instanced = useRef<THREE.Points>(null);
  const frameRef = useRef(0);
  const lastSectionRef = useRef<SceneMode | null>(null);
  const boostRef = useRef(0.0);
  // detect support synchronously
  const support = useMemo(() => {
    const ctx: WebGLRenderingContext | WebGL2RenderingContext = gl.getContext();
    const isWebGL2 = (gl.capabilities as any).isWebGL2;
    const extFloatRT = ctx.getExtension('EXT_color_buffer_float') || ctx.getExtension('WEBGL_color_buffer_float');
    const maxVTF = (ctx as any).getParameter((ctx as any).MAX_VERTEX_TEXTURE_IMAGE_UNITS) || 0;
    return !!(isWebGL2 && extFloatRT && maxVTF > 0);
  }, [gl]);
  const texSize = 128; // 16384 particles for better performance and less layering
  const count = texSize * texSize;
  const posTargets = useRef<{ read: THREE.WebGLRenderTarget; write: THREE.WebGLRenderTarget } | null>(null);
  const velTargets = useRef<{ read: THREE.WebGLRenderTarget; write: THREE.WebGLRenderTarget } | null>(null);
  const baseTexRef = useRef<THREE.DataTexture | null>(null);
  const simScene = useMemo(() => new THREE.Scene(), []);
  const simCam = useMemo(() => new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), []);
  const quad = useMemo(() => new THREE.Mesh(new THREE.PlaneGeometry(2, 2)), []);
  const ray = useMemo(() => new THREE.Raycaster(), []);
  const plane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 0, 1), 0), []);

  const posSimMat = useRef<THREE.ShaderMaterial | null>(null);
  const velSimMat = useRef<THREE.ShaderMaterial | null>(null);
  const renderMat = useRef<THREE.ShaderMaterial | null>(null);
  const seedSectionPositions = useRef<((section: SceneMode) => void) | null>(null);
  const showSDFOverlay = useRef<boolean>(true);
  const baseGeomInfoRef = useRef<{ center: THREE.Vector3; scaleBack: number }>({ center: new THREE.Vector3(0, 0, 0), scaleBack: 1 });

  // Build initial base positions texture from GLTF brick surface
  const gltf = useGLTF('/Octa2.glb') as any;
  const baseData = useMemo(() => {
    const data = new Float32Array(texSize * texSize * 4);
    // sample from mesh
    let collected: number[] = [];
    const root = gltf.scene as THREE.Object3D;
    // Collect vertices from all meshes in brick-local space (GLTF root local)
    const meshes: THREE.Mesh[] = [];
    root.traverse((obj: any) => {
      if (obj && obj.isMesh) {
        const name = (obj.name || '').toLowerCase();
        if (name.includes('octa') || name.includes('brick')) meshes.push(obj as THREE.Mesh);
      }
    });
    if (meshes.length === 0) root.traverse((obj: any) => { if (obj && obj.isMesh) meshes.push(obj as THREE.Mesh); });
    if (meshes.length > 0) {
      root.updateMatrixWorld(true);
      const rootInverse = new THREE.Matrix4().copy(root.matrixWorld).invert();
      let minX = Infinity, minY = Infinity, minZ = Infinity;
      let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
      const v = new THREE.Vector3();
      collected = [];
      let totalVerts = 0;
      for (const m of meshes) {
        const geom = m.geometry as THREE.BufferGeometry;
        const posAttr = geom.attributes.position as THREE.BufferAttribute;
        if (!posAttr) continue;
        const arr = posAttr.array as Float32Array;
        const mat = m.matrixWorld;
        totalVerts += posAttr.count;
      }
      const targetGPUParticles = Math.min(16384, totalVerts);
      const stride = Math.max(1, Math.floor(totalVerts / targetGPUParticles));
      let idxCounter = 0;
      for (const m of meshes) {
        const geom = m.geometry as THREE.BufferGeometry;
      const posAttr = geom.attributes.position as THREE.BufferAttribute;
        if (!posAttr) continue;
      const arr = posAttr.array as Float32Array;
        const mat = m.matrixWorld;
      for (let i = 0; i < posAttr.count; i++) {
          if (idxCounter % stride !== 0) { idxCounter++; continue; }
        const ix = i * 3;
          v.set(arr[ix], arr[ix + 1], arr[ix + 2]).applyMatrix4(mat).applyMatrix4(rootInverse);
          collected.push(v.x, v.y, v.z);
          if (v.x < minX) minX = v.x; if (v.x > maxX) maxX = v.x;
          if (v.y < minY) minY = v.y; if (v.y > maxY) maxY = v.y;
          if (v.z < minZ) minZ = v.z; if (v.z > maxZ) maxZ = v.z;
          idxCounter++;
        }
      }
      const cx = (minX + maxX) * 0.5, cy = (minY + maxY) * 0.5, cz = (minZ + maxZ) * 0.5;
      const sx = maxX - minX, sy = maxY - minY, sz = maxZ - minZ;
      const maxSide = Math.max(sx, sy, sz) || 1;
      baseGeomInfoRef.current.center.set(cx, cy, cz);
      baseGeomInfoRef.current.scaleBack = 1.0; // no normalization of base; keep 1:1
      console.log(`[GPU Particles] Sampling (union meshes): total=${totalVerts}, target=${targetGPUParticles}, out=${collected.length/3}`);
    }
    console.log(`[GPU Particles] Total collected: ${collected.length / 3} particles from GPU sampling`);
    if (collected.length === 0) {
      for (let i = 0; i < texSize * texSize; i++) {
        const ix = i * 4;
        data[ix + 0] = (Math.random() - 0.5) * 2.0;
        data[ix + 1] = (Math.random() - 0.5) * 2.0;
        data[ix + 2] = (Math.random() - 0.5) * 2.0;
        data[ix + 3] = 1.0;
      }
      return data;
    }
    // fill texture cycling through collected points
    for (let i = 0; i < texSize * texSize; i++) {
      const s = (i % (collected.length / 3)) * 3;
      const ix = i * 4;
      data[ix + 0] = collected[s + 0];
      data[ix + 1] = collected[s + 1];
      data[ix + 2] = collected[s + 2];
      data[ix + 3] = 1.0;
    }
    return data;
  }, [gltf, texSize]);

  // Initialize FBOs and materials
  useEffect(() => {
    if (!support) return;
    const options = { type: THREE.FloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: false, stencilBuffer: false } as THREE.RenderTargetOptions;
    const makeRT = () => new THREE.WebGLRenderTarget(texSize, texSize, options);
    const posA = makeRT();
    const posB = makeRT();
    const velA = makeRT();
    const velB = makeRT();
    posTargets.current = { read: posA, write: posB };
    velTargets.current = { read: velA, write: velB };

    // create base, position, velocity textures
    const baseTex = new THREE.DataTexture(baseData, texSize, texSize, THREE.RGBAFormat, THREE.FloatType);
    baseTex.needsUpdate = true;
    baseTexRef.current = baseTex;

    const zero = new Float32Array(texSize * texSize * 4);
    // Initialize positions at the base shape with tiny offset
    const initPosData = new Float32Array(texSize * texSize * 4);
    // Map brick-local base positions into world space for initial posTex
    const tmpV = new THREE.Vector3();
    for (let i = 0; i < texSize * texSize; i++) {
      const ix = i * 4;
      tmpV.set(baseData[ix + 0], baseData[ix + 1], baseData[ix + 2]);
      tmpV.applyMatrix4(heroMatrixRef.current);
      // tiny jitter
      initPosData[ix + 0] = tmpV.x + (Math.random() - 0.5) * 0.02;
      initPosData[ix + 1] = tmpV.y + (Math.random() - 0.5) * 0.02;
      initPosData[ix + 2] = tmpV.z + (Math.random() - 0.5) * 0.02;
      initPosData[ix + 3] = 1.0;
    }
    
    // Debug: log some base positions
    console.log('GPU Base texture sample:', {
      p0: [baseData[0], baseData[1], baseData[2]],
      p1: [baseData[4], baseData[5], baseData[6]],
      p100: [baseData[400], baseData[401], baseData[402]],
      initP0: [initPosData[0], initPosData[1], initPosData[2]],
      initP1: [initPosData[4], initPosData[5], initPosData[6]],
    });
    const posTexInit = new THREE.DataTexture(initPosData, texSize, texSize, THREE.RGBAFormat, THREE.FloatType);
    posTexInit.needsUpdate = true;
    const velTexInit = new THREE.DataTexture(zero, texSize, texSize, THREE.RGBAFormat, THREE.FloatType);
    velTexInit.needsUpdate = true;

    // helper to blit a data texture into a render target
    const blitMat = new THREE.ShaderMaterial({
      uniforms: { src: { value: posTexInit } },
      vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position,1.0); }`,
      fragmentShader: `uniform sampler2D src; varying vec2 vUv; void main(){ gl_FragColor = texture2D(src, vUv); }`,
    });
    const blit = (src: THREE.DataTexture, dst: THREE.WebGLRenderTarget) => {
      (blitMat.uniforms as any).src.value = src;
      quad.material = blitMat;
      simScene.add(quad);
      gl.setRenderTarget(dst);
      gl.clear();
      gl.render(simScene, simCam);
      gl.setRenderTarget(null);
      simScene.remove(quad);
      
      // Debug: verify blit worked
      const testBuf = new Float32Array(16);
      try {
        gl.readRenderTargetPixels(dst, 0, 0, 2, 2, testBuf);
        console.log('GPU blit verify:', {
          target: dst === posA ? 'posA' : dst === posB ? 'posB' : 'vel',
          p00: [testBuf[0], testBuf[1], testBuf[2]],
          p10: [testBuf[4], testBuf[5], testBuf[6]],
        });
      } catch (e) {
        console.error('Blit verify failed:', e);
      }
    };
    // Seeder to reset pos targets when switching sections (wind/rain)
    seedSectionPositions.current = (section: SceneMode) => {
      const arr = new Float32Array(texSize * texSize * 4);
      const rng = (x: number, y: number) => {
        // hash-like deterministic rng from indices
        const v = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
        return v - Math.floor(v);
      };
      for (let y = 0; y < texSize; y++) {
        for (let x = 0; x < texSize; x++) {
          const idx = (y * texSize + x) * 4;
          const r1 = rng(x, y);
          const r2 = rng(y, x);
          const r3 = rng(x + y, x - y);
                     if (section === 'wind') {
             // Dense spawn on the left (upstream) in a larger area, positioned higher
             const brickDiameter = 1.5; // approximate brick size
             const spawnArea = brickDiameter * 0.8; // 80% of brick diameter (4x bigger)
             arr[idx + 0] = -3.5; // Fixed left spawn position
             arr[idx + 1] = 0.8 + (r2 - 0.5) * spawnArea; // Medium height YZ area (centered around y=0.8)
             arr[idx + 2] = (r3 - 0.5) * spawnArea; // Larger YZ area
                     } else if (section === 'rain') {
             // Dense spawn at the top in a larger area
             const brickDiameter = 1.5; // approximate brick size
             const spawnArea = brickDiameter * 0.8; // 80% of brick diameter (4x bigger)
             arr[idx + 0] = (r1 - 0.5) * spawnArea; // Larger XZ area centered
             arr[idx + 1] = 3.5; // Much higher spawn position
             arr[idx + 2] = (r2 - 0.5) * spawnArea; // Larger XZ area centered
          } else {
            // default to base
            arr[idx + 0] = baseData[idx + 0];
            arr[idx + 1] = baseData[idx + 1];
            arr[idx + 2] = baseData[idx + 2];
          }
          arr[idx + 3] = 1.0;
        }
      }
      const seedTex = new THREE.DataTexture(arr, texSize, texSize, THREE.RGBAFormat, THREE.FloatType);
      seedTex.needsUpdate = true;
      blit(seedTex, posTargets.current!.read);
      blit(seedTex, posTargets.current!.write);
      seedTex.dispose();
      console.debug('[GPU Particles] Seeded positions for section', section);
    };
    blit(posTexInit, posA);
    blit(posTexInit, posB);
    blit(new THREE.DataTexture(zero, texSize, texSize, THREE.RGBAFormat, THREE.FloatType), velA);
    blit(new THREE.DataTexture(zero, texSize, texSize, THREE.RGBAFormat, THREE.FloatType), velB);
    
    // Create SDF textures for collision detection
    let sdfYZTex: THREE.DataTexture | null = null;
    let sdfXZTex: THREE.DataTexture | null = null;
    let sdf3DTex: THREE.DataTexture | null = null;
    
    // Build SDF from union of all GLTF meshes so collision matches visible brick exactly
    const root = gltf.scene as THREE.Object3D;
    const meshes: THREE.Mesh[] = [];
    root.traverse((obj: any) => {
      if (obj && obj.isMesh) {
        const name = (obj.name || '').toLowerCase();
        if (name.includes('octa') || name.includes('brick')) meshes.push(obj as THREE.Mesh);
      }
    });
    if (meshes.length === 0) {
      root.traverse((obj: any) => { if (obj && obj.isMesh) meshes.push(obj as THREE.Mesh); });
    }
    
    if (meshes.length > 0) {
      root.updateMatrixWorld(true);
      // Transform vertices into MODEL (GLTF root) LOCAL space: world -> modelLocal using inverse(root.matrixWorld)
      const rootInverse = new THREE.Matrix4().copy(root.matrixWorld).invert();
      const brickVertices: { x: number; y: number; z: number }[] = [];
      let minX = Infinity, minY = Infinity, minZ = Infinity;
      let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
      const v = new THREE.Vector3();
      for (const m of meshes) {
        const geom = m.geometry as THREE.BufferGeometry;
        const posAttr = geom.attributes.position as THREE.BufferAttribute;
        if (!posAttr) continue;
        const arr = posAttr.array as Float32Array;
        const mat = m.matrixWorld;
      for (let i = 0; i < posAttr.count; i++) {
        const ix = i * 3;
          v.set(arr[ix], arr[ix + 1], arr[ix + 2])
           .applyMatrix4(mat)          // to world
           .applyMatrix4(rootInverse); // to model (GLTF root) local
          brickVertices.push({ x: v.x, y: v.y, z: v.z });
          if (v.x < minX) minX = v.x; if (v.x > maxX) maxX = v.x;
          if (v.y < minY) minY = v.y; if (v.y > maxY) maxY = v.y;
          if (v.z < minZ) minZ = v.z; if (v.z > maxZ) maxZ = v.z;
        }
      }
      const sx = maxX - minX, sy = maxY - minY, sz = maxZ - minZ;
      const maxSide = Math.max(sx, sy, sz) || 1;
      console.log(`[SDF DEBUG] Building UNION mesh SDF (brick-local) - bounds: x[${minX.toFixed(3)}, ${maxX.toFixed(3)}], y[${minY.toFixed(3)}, ${maxY.toFixed(3)}], z[${minZ.toFixed(3)}, ${maxZ.toFixed(3)}], maxSide=${maxSide.toFixed(3)} | heroInverse set`);
      

      
      // Create YZ SDF (for wind) - using model space coordinates
      // Adaptive grid cell since we're in model space (not normalized)
      let minYs = Infinity, maxYs = -Infinity, minZs = Infinity, maxZs = -Infinity;
      for (const v of brickVertices) {
        minYs = Math.min(minYs, v.y); maxYs = Math.max(maxYs, v.y);
        minZs = Math.min(minZs, v.z); maxZs = Math.max(maxZs, v.z);
      }
      let gridCellYZ = Math.max(0.10, Math.max(maxYs - minYs, maxZs - minZs) / 220.0);
      let gwYZ = Math.ceil((maxYs - minYs) / gridCellYZ) + 2;
      let ghYZ = Math.ceil((maxZs - minZs) / gridCellYZ) + 2;
      // grow cell size if grid is too large
      { let attempts = 0; while (gwYZ * ghYZ > 100000 && attempts < 6) { gridCellYZ *= 1.25; gwYZ = Math.ceil((maxYs - minYs) / gridCellYZ) + 2; ghYZ = Math.ceil((maxZs - minZs) / gridCellYZ) + 2; attempts++; } }
      const minYg = minYs - gridCellYZ, minZg = minZs - gridCellYZ;
      
      console.log('[SDF Debug] YZ Grid size:', { gwYZ, ghYZ, totalCells: gwYZ * ghYZ, cellSize: gridCellYZ, bounds: { minYs: minYs.toFixed(3), maxYs: maxYs.toFixed(3), minZs: minZs.toFixed(3), maxZs: maxZs.toFixed(3) } });
      
      if (gwYZ * ghYZ > 100000) {
        console.error('[SDF Error] YZ Grid too large even after scaling');
      }
      
      const distYZ = new Float32Array(gwYZ * ghYZ);
      distYZ.fill(999.0);
      
      // Mark occupied cells with slight dilation to match solid silhouette
      const dilateCellsYZ = 1; // expand 1 cell in each direction
      for (const v of brickVertices) {
        const gy0 = Math.floor((v.y - minYg) / gridCellYZ);
        const gz0 = Math.floor((v.z - minZg) / gridCellYZ);
        for (let dy = -dilateCellsYZ; dy <= dilateCellsYZ; dy++) {
          for (let dz = -dilateCellsYZ; dz <= dilateCellsYZ; dz++) {
            const gy = gy0 + dy;
            const gz = gz0 + dz;
        if (gy >= 0 && gy < gwYZ && gz >= 0 && gz < ghYZ) {
          distYZ[gz * gwYZ + gy] = 0.0;
            }
          }
        }
      }
      
      // Distance propagation
      for (let z = 0; z < ghYZ; z++) {
        for (let y = 0; y < gwYZ; y++) {
          const idx = z * gwYZ + y;
          if (y + 1 < gwYZ) distYZ[idx] = Math.min(distYZ[idx], distYZ[z * gwYZ + (y + 1)] + gridCellYZ);
          if (z + 1 < ghYZ) distYZ[idx] = Math.min(distYZ[idx], distYZ[(z + 1) * gwYZ + y] + gridCellYZ);
        }
      }
      for (let z = ghYZ - 1; z >= 0; z--) {
        for (let y = gwYZ - 1; y >= 0; y--) {
          const idx = z * gwYZ + y;
          if (y + 1 < gwYZ) distYZ[idx] = Math.min(distYZ[idx], distYZ[z * gwYZ + (y + 1)] + gridCellYZ);
          if (z + 1 < ghYZ) distYZ[idx] = Math.min(distYZ[idx], distYZ[(z + 1) * gwYZ + y] + gridCellYZ);
        }
      }
      
      sdfYZTex = new THREE.DataTexture(distYZ, gwYZ, ghYZ, THREE.RedFormat, THREE.FloatType);
      sdfYZTex.needsUpdate = true;
      // Store bounds metadata
      (sdfYZTex as any)._minYg = minYg;
      (sdfYZTex as any)._minZg = minZg;
      (sdfYZTex as any)._cell = gridCellYZ;
      
      // Create XZ SDF (for rain) - using model space coordinates
      let minXs = Infinity, maxXs = -Infinity, minZs2 = Infinity, maxZs2 = -Infinity;
      for (const v of brickVertices) {
        minXs = Math.min(minXs, v.x); maxXs = Math.max(maxXs, v.x);
        minZs2 = Math.min(minZs2, v.z); maxZs2 = Math.max(maxZs2, v.z);
      }
      let gridCellXZ = Math.max(0.10, Math.max(maxXs - minXs, maxZs2 - minZs2) / 220.0);
      let gwXZ = Math.ceil((maxXs - minXs) / gridCellXZ) + 2;
      let ghXZ = Math.ceil((maxZs2 - minZs2) / gridCellXZ) + 2;
      // grow cell size if grid is too large
      { let attempts = 0; while (gwXZ * ghXZ > 100000 && attempts < 6) { gridCellXZ *= 1.25; gwXZ = Math.ceil((maxXs - minXs) / gridCellXZ) + 2; ghXZ = Math.ceil((maxZs2 - minZs2) / gridCellXZ) + 2; attempts++; } }
      const minXg = minXs - gridCellXZ, minZg2 = minZs2 - gridCellXZ;
      
      console.log('[SDF Debug] XZ Grid size:', { gwXZ, ghXZ, totalCells: gwXZ * ghXZ, cellSize: gridCellXZ, bounds: { minXs: minXs.toFixed(3), maxXs: maxXs.toFixed(3), minZs2: minZs2.toFixed(3), maxZs2: maxZs2.toFixed(3) } });
      
      if (gwXZ * ghXZ > 100000) {
        console.error('[SDF Error] XZ Grid too large even after scaling');
      }
      
      const distXZ = new Float32Array(gwXZ * ghXZ);
      distXZ.fill(999.0);
      
      // Mark occupied cells with slight dilation to match solid footprint
      const dilateCellsXZ = 1; // expand 1 cell
      for (const v of brickVertices) {
        const gx0 = Math.floor((v.x - minXg) / gridCellXZ);
        const gz0 = Math.floor((v.z - minZg2) / gridCellXZ);
        for (let dx = -dilateCellsXZ; dx <= dilateCellsXZ; dx++) {
          for (let dz = -dilateCellsXZ; dz <= dilateCellsXZ; dz++) {
            const gx = gx0 + dx;
            const gz = gz0 + dz;
        if (gx >= 0 && gx < gwXZ && gz >= 0 && gz < ghXZ) {
          distXZ[gz * gwXZ + gx] = 0.0;
            }
          }
        }
      }
      
      // Distance propagation
      for (let z = 0; z < ghXZ; z++) {
        for (let x = 0; x < gwXZ; x++) {
          const idx = z * gwXZ + x;
          if (x + 1 < gwXZ) distXZ[idx] = Math.min(distXZ[idx], distXZ[z * gwXZ + (x + 1)] + gridCellXZ);
          if (z + 1 < ghXZ) distXZ[idx] = Math.min(distXZ[idx], distXZ[(z + 1) * gwXZ + x] + gridCellXZ);
        }
      }
      for (let z = ghXZ - 1; z >= 0; z--) {
        for (let x = gwXZ - 1; x >= 0; x--) {
          const idx = z * gwXZ + x;
          if (x + 1 < gwXZ) distXZ[idx] = Math.min(distXZ[idx], distXZ[z * gwXZ + (x + 1)] + gridCellXZ);
          if (z + 1 < ghXZ) distXZ[idx] = Math.min(distXZ[idx], distXZ[(z + 1) * gwXZ + x] + gridCellXZ);
        }
      }
      
      sdfXZTex = new THREE.DataTexture(distXZ, gwXZ, ghXZ, THREE.RedFormat, THREE.FloatType);
      sdfXZTex.needsUpdate = true;
      // Store bounds metadata
      (sdfXZTex as any)._minXg = minXg;
      (sdfXZTex as any)._minZg2 = minZg2;
      (sdfXZTex as any)._cell = gridCellXZ;
      
      console.log('[GPU Particles] Created SDF textures:', {
        YZ: { size: [gwYZ, ghYZ], min: [minYg, minZg], cell: gridCellYZ },
        XZ: { size: [gwXZ, ghXZ], min: [minXg, minZg2], cell: gridCellXZ }
      });
      
      // Debug: Check a few SDF values
      console.log('[GPU Particles] SDF YZ samples:', {
        center: distYZ[Math.floor(ghYZ/2) * gwYZ + Math.floor(gwYZ/2)],
        corner: distYZ[0],
        max: Math.max(...distYZ),
        min: Math.min(...distYZ)
      });
      console.log('[GPU Particles] SDF XZ samples:', {
        center: distXZ[Math.floor(ghXZ/2) * gwXZ + Math.floor(gwXZ/2)],
        corner: distXZ[0], 
        max: Math.max(...distXZ),
        min: Math.min(...distXZ)
      });

      // Build 3D SDF (unsigned) from brick-local vertices via voxel distance transform
      // Determine grid resolution adaptively
      let maxAttempts = 6;
      let cell3D = Math.max(0.08, (Math.max(sx, sy, sz) || 1) / 64.0);
      let nx = Math.max(8, Math.ceil(sx / cell3D) + 2);
      let ny = Math.max(8, Math.ceil(sy / cell3D) + 2);
      let nz = Math.max(8, Math.ceil(sz / cell3D) + 2);
      while (nx * ny * nz > 300000 && maxAttempts-- > 0) {
        cell3D *= 1.25;
        nx = Math.max(8, Math.ceil(sx / cell3D) + 2);
        ny = Math.max(8, Math.ceil(sy / cell3D) + 2);
        nz = Math.max(8, Math.ceil(sz / cell3D) + 2);
      }
      const min3DX = minX - cell3D;
      const min3DY = minY - cell3D;
      const min3DZ = minZ - cell3D;
      console.log('[SDF3D] grid:', { nx, ny, nz, cell3D, min: [min3DX, min3DY, min3DZ] });

      const N = nx * ny * nz;
      const dist3D = new Float32Array(N);
      const large = 1e6;
      for (let i = 0; i < N; i++) dist3D[i] = large;
      const toIndex = (ix: number, iy: number, iz: number) => ix + iy * nx + iz * nx * ny;
      // Seed zeros from surface vertices (nearest grid cell)
      for (const v of brickVertices) {
        const gx = Math.floor((v.x - min3DX) / cell3D);
        const gy = Math.floor((v.y - min3DY) / cell3D);
        const gz = Math.floor((v.z - min3DZ) / cell3D);
        if (gx >= 0 && gx < nx && gy >= 0 && gy < ny && gz >= 0 && gz < nz) {
          const idx = toIndex(gx, gy, gz);
          dist3D[idx] = 0.0;
        }
      }
      // 3D chamfer distance transform (6-neighborhood)
      // forward pass
      for (let z = 0; z < nz; z++) {
        for (let y = 0; y < ny; y++) {
          for (let x = 0; x < nx; x++) {
            const idx = toIndex(x, y, z);
            let d = dist3D[idx];
            if (x > 0) d = Math.min(d, dist3D[toIndex(x - 1, y, z)] + 1.0);
            if (y > 0) d = Math.min(d, dist3D[toIndex(x, y - 1, z)] + 1.0);
            if (z > 0) d = Math.min(d, dist3D[toIndex(x, y, z - 1)] + 1.0);
            dist3D[idx] = d;
          }
        }
      }
      // backward pass
      for (let z = nz - 1; z >= 0; z--) {
        for (let y = ny - 1; y >= 0; y--) {
          for (let x = nx - 1; x >= 0; x--) {
            const idx = toIndex(x, y, z);
            let d = dist3D[idx];
            if (x + 1 < nx) d = Math.min(d, dist3D[toIndex(x + 1, y, z)] + 1.0);
            if (y + 1 < ny) d = Math.min(d, dist3D[toIndex(x, y + 1, z)] + 1.0);
            if (z + 1 < nz) d = Math.min(d, dist3D[toIndex(x, y, z + 1)] + 1.0);
            dist3D[idx] = d;
          }
        }
      }
      // Convert to real units (multiply by cell)
      for (let i = 0; i < N; i++) dist3D[i] = Math.min(dist3D[i] * cell3D, 999.0);

      // Pack slices (z) into a 2D atlas texture
      const tilesX = Math.ceil(Math.sqrt(nz));
      const tilesY = Math.ceil(nz / tilesX);
      const texW = nx * tilesX;
      const texH = ny * tilesY;
      const atlas = new Float32Array(texW * texH);
      for (let zz = 0; zz < nz; zz++) {
        const tileX = zz % tilesX;
        const tileY = Math.floor(zz / tilesX);
        const offX = tileX * nx;
        const offY = tileY * ny;
        for (let yy = 0; yy < ny; yy++) {
          for (let xx = 0; xx < nx; xx++) {
            const srcIdx = toIndex(xx, yy, zz);
            const dstIdx = (offY + yy) * texW + (offX + xx);
            atlas[dstIdx] = dist3D[srcIdx];
          }
        }
      }
      sdf3DTex = new THREE.DataTexture(atlas, texW, texH, THREE.RedFormat, THREE.FloatType);
      sdf3DTex.needsUpdate = true;
      // attach metadata to texture for shader mapping
      (sdf3DTex as any)._min3D = new THREE.Vector3(min3DX, min3DY, min3DZ);
      (sdf3DTex as any)._cell3D = cell3D;
      (sdf3DTex as any)._size3D = new THREE.Vector3(nx, ny, nz);
      (sdf3DTex as any)._tiles3D = new THREE.Vector2(tilesX, tilesY);
      
      // Store SDF data to set after material creation
      console.log('[GPU Particles] SDF textures created, will set uniforms after material creation (2D+3D)');
    }

    // build sim materials
    velSimMat.current = new THREE.ShaderMaterial({
      uniforms: {
        posTex: { value: posA.texture },
        velTex: { value: velA.texture },
        baseTex: { value: baseTex },
        cursor: { value: new THREE.Vector3() },
        cursorVel: { value: new THREE.Vector3() },
        time: { value: 0 },
        dt: { value: 1 / 8 }, // Larger time step for faster simulation
        texSize: { value: texSize },
        kRest: { value: 1.5 }, // Very fast return to form after displacement
        kExc: { value: 0.3 }, // Weaker when activated but not too weak
        damping: { value: 0.92 }, // Proper damping below 1.0 for settling
        sigma: { value: 0.58 }, // Bigger force field for wider influence  
        repelStrength: { value: 8.0 }, // Very strong push for dramatic water displacement
        outwardGain: { value: 0.1 },
        modelScale: { value: 30.0 },
        swirlStrength: { value: 3.5 }, // Stronger swirl for fluid look
        sectionMode: { value: 2.0 }, // 0=wind,1=rain,2=disintegrate
        windDir: { value: new THREE.Vector3(1.0, 0.0, 0.0) },
        boost: { value: 0.0 }, // one-shot dislodge strength
        // exact brick SDFs (2D slices and 3D volume)
        sdfYZTex: { value: null },
        sdfYZMin: { value: new THREE.Vector2() }, // (minY, minZ)
        sdfYZCell: { value: 0 },
        sdfYZSize: { value: new THREE.Vector2() },
        sdfXZTex: { value: null },
        sdfXZMin: { value: new THREE.Vector2() }, // (minX, minZ)
        sdfXZCell: { value: 0 },
        sdfXZSize: { value: new THREE.Vector2() },
        sdf3DTex: { value: null },
        sdf3DMin: { value: new THREE.Vector3() },
        sdf3DCell: { value: 0 },
        sdf3DSize: { value: new THREE.Vector3() },
        sdf3DTiles: { value: new THREE.Vector2() },
        sdf3DBias: { value: 0.02 },
        brickInverseMatrix: { value: new THREE.Matrix4() },
        brickNormalMatrix: { value: new THREE.Matrix3() },
        brickMatrix: { value: new THREE.Matrix4() },
        // Fine-tuning factors for SDF footprint vs visual mesh
        sdfYZFudge: { value: 1.0 },
        sdfXZFudge: { value: 1.0 },
        debugFrame: { value: 0 },
      },
      vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position,1.0); }`,
      fragmentShader: `
        precision highp float;
        varying vec2 vUv;
        uniform sampler2D posTex, velTex, baseTex;
        uniform vec3 cursor;
        uniform float time, dt, kRest, kExc, damping, sigma, repelStrength, outwardGain, modelScale, swirlStrength;
        uniform vec3 cursorVel;
        uniform float sectionMode; // 0=wind,1=rain,2=disintegrate
        uniform vec3 windDir;
        uniform float boost;
        // exact brick SDFs
        uniform sampler2D sdfYZTex; uniform vec2 sdfYZMin; uniform float sdfYZCell; uniform vec2 sdfYZSize;
        uniform sampler2D sdfXZTex; uniform vec2 sdfXZMin; uniform float sdfXZCell; uniform vec2 sdfXZSize;
        uniform sampler2D sdf3DTex; uniform vec3 sdf3DMin; uniform float sdf3DCell; uniform vec3 sdf3DSize; uniform vec2 sdf3DTiles; uniform float sdf3DBias;
        uniform mat4 brickInverseMatrix; uniform mat4 brickMatrix;
        uniform mat3 brickNormalMatrix;
        uniform float sdfYZFudge;
        uniform float sdfXZFudge;
        uniform float debugFrame;
 
        float sdfSample(sampler2D tex, vec2 minV, float cell, vec2 size, vec2 p){
          vec2 uv = (p - minV) / (cell * size);
          uv = clamp(uv, vec2(0.0), vec2(1.0));
          return texture2D(tex, uv).r;
        }
        float sdf3D(vec3 p){
          // map p to grid coords
          vec3 g = (p - sdf3DMin) / sdf3DCell;
          vec3 dims = sdf3DSize;
          // clamp within grid
          g = clamp(g, vec3(0.0), dims - 1.001);
          // slice index
          float zf = floor(g.z);
          float zc = ceil(g.z);
          float tz = g.z - zf;
          // tile coords (atlas)
          vec2 tiles = sdf3DTiles;
          vec2 uvA = vec2((mod(zf, tiles.x) * dims.x + g.x) / (dims.x * tiles.x), (floor(zf / tiles.x) * dims.y + g.y) / (dims.y * tiles.y));
          vec2 uvB = vec2((mod(zc, tiles.x) * dims.x + g.x) / (dims.x * tiles.x), (floor(zc / tiles.x) * dims.y + g.y) / (dims.y * tiles.y));
          float dA = texture2D(sdf3DTex, uvA).r;
          float dB = texture2D(sdf3DTex, uvB).r;
          return mix(dA, dB, tz);
        }
        vec2 sdfGrad(sampler2D tex, vec2 minV, float cell, vec2 size, vec2 p){
          float d1 = sdfSample(tex, minV, cell, size, p + vec2(cell, 0.0));
          float d2 = sdfSample(tex, minV, cell, size, p - vec2(cell, 0.0));
          float d3 = sdfSample(tex, minV, cell, size, p + vec2(0.0, cell));
          float d4 = sdfSample(tex, minV, cell, size, p - vec2(0.0, cell));
          return vec2((d1 - d2) / (2.0*cell), (d3 - d4) / (2.0*cell));
        }
        vec3 safeNorm3(vec3 v){ float l = length(v); return l > 1e-6 ? v / l : vec3(0.0); }
        vec2 safeNorm2(vec2 v){ float l = length(v); return l > 1e-6 ? v / l : vec2(0.0); }
        void main(){
          vec3 pos = texture2D(posTex, vUv).xyz;
          vec3 vel = texture2D(velTex, vUv).xyz;
          vec3 base = texture2D(baseTex, vUv).xyz;
          // CPU-style cursor interaction with activation system
          vec3 toCursor = pos - cursor;
          float cursorDist = length(toCursor) + 0.000001;
 
          // Sharp falloff with hard cutoff - no soft influence beyond intended radius
          float falloffRadius = sigma * 2.0; // influence radius is 2x sigma
          float cursorFalloff = 0.0;
          if (cursorDist < falloffRadius) {
            // Use inverse square falloff with sharp cutoff instead of exponential
            float normalizedDist = cursorDist / falloffRadius;
            cursorFalloff = 1.0 - (normalizedDist * normalizedDist);
            cursorFalloff = max(cursorFalloff, 0.0);
          }
 
          // Activation system like CPU - builds up and decays (use time-based for now)
          float activation = cursorFalloff;
 
          // Spring force only in disintegrate mode
          float enableSpring = step(1.5, sectionMode); // 1 if disintegrate (>=2.0), 0 otherwise
          float kSpringExcited = kExc * enableSpring;
          float kSpringRest = kRest * enableSpring;
          float kSpring = kSpringExcited + (kSpringRest - kSpringExcited) * (1.0 - activation);
 
          // Use exact brick-local base position (from baseTex, stored 1:1) and map to world
          vec3 baseLocal = base;
          vec3 baseWorld = (brickMatrix * vec4(baseLocal, 1.0)).xyz;
          vec3 springTarget = baseWorld;
          // In material study, use exact baseLocal mapped to world as primary target
          vec3 toTarget = springTarget - pos;
          vec3 springF = toTarget * kSpring;
 
          // Movement-based cursor forces - only when cursor is moving
          vec3 repelF = vec3(0.0);
          vec3 swirlF = vec3(0.0);
 
          // Check if cursor is moving
          float cursorSpeed = length(cursorVel);
          float moveThreshold = 0.01; // Lower threshold so interaction engages easily
          
          // Cursor interaction enabled for all sections
 
          if (cursorFalloff > 0.0 && cursorSpeed > moveThreshold) {
            // Scale forces with movement speed for more dynamic interaction
            float movementFactor = min(cursorSpeed * 50.0, 3.0); // Much higher scaling and cap
 
            // Repel force - only when cursor is moving
            vec3 repelDir = (cursorDist > 1e-6) ? (toCursor / cursorDist) : vec3(0.0);
             repelF = repelDir * (repelStrength * cursorFalloff * movementFactor);
 
             // Realistic water swirl - like stirring liquid
             if (activation > 0.05) {
               // Create realistic water vortex based on fluid dynamics
               vec3 toCenter = toCursor;
               float dist2D = length(toCenter.xy);
 
               // Tangential velocity for circular flow (perpendicular to radius)
              vec3 tangent = safeNorm3(vec3(-toCenter.y, toCenter.x, 0.0));
 
               // Vortex profile - faster near center, slower at edges (like real fluid)
               float vortexCore = 0.1 * sigma; // Core radius where velocity peaks
               float vortexStrength;
 
               if (dist2D < vortexCore) {
                 // Solid body rotation in core (linear increase)
                 vortexStrength = (dist2D / vortexCore);
               } else {
                 // Free vortex outside core (1/r decay like real fluids)
                 vortexStrength = (vortexCore / max(dist2D, 1e-4));
               }
 
               // Apply swirl with realistic profile
               float swirlStrengthLocal = swirlStrength * vortexStrength * activation * movementFactor;
               swirlF = tangent * swirlStrengthLocal;
 
               // Add inward spiral component (like water draining)
              vec2 inward2 = -safeNorm2(toCenter.xy) * (swirlStrengthLocal * 0.2);
               vec3 inwardSpiral = vec3(inward2, 0.0);
               swirlF.xy += inwardSpiral.xy;
 
               // Vertical flow component (creates 3D water funnel effect)
               float heightFactor = 1.0 - abs(pos.z) / 1.0; // Stronger at middle height
               swirlF.z = -sign(pos.z) * swirlStrengthLocal * 0.15 * heightFactor;
             }
           }
 
           // Subtle jitter only when cursor is moving and near
           vec3 jitterF = vec3(0.0);
           if (activation > 0.01 && cursorSpeed > moveThreshold) {
             float movementFactor = min(cursorSpeed * 50.0, 3.0);
             jitterF = vec3(
               sin(time * 2.0 + pos.x * 0.37) * 0.0005,
               cos(time * 1.7 + pos.y * 0.37 * 1.3) * 0.0005,
               sin(time * 2.3 + pos.z * 0.37 * 0.7) * 0.0005
             ) * activation * movementFactor; // Scale with activation and movement
           }
 
           vec3 cursorF = repelF + swirlF + jitterF;
 
           // Only add fluid dynamics when cursor is actively applying force
           vec3 fluidForces = vec3(0.0);
 
           if (cursorSpeed > moveThreshold && cursorFalloff > 0.0) {
             // Zero-gravity water: strong momentum preservation
             vec3 momentum = vel * 0.95; // High momentum for water-like flow
 
             // Surface tension effect - particles stick together slightly
            vec3 cohesion = -safeNorm3(pos - cursor) * 0.1 * (1.0 - cursorFalloff);
 
             // Ripple propagation for water-like waves
             vec3 ripple = vec3(
               sin(length(pos - cursor) * 10.0 - time * 5.0) * 0.02,
               cos(length(pos - cursor) * 10.0 - time * 5.0) * 0.02,
               0.0
             ) * cursorFalloff;
 
             fluidForces = momentum + cohesion + ripple;
           }
 
           // Environmental forces by section
           vec3 envF = vec3(0.0);
           if (sectionMode < 0.5) {
             // wind: uniform left->right flow with exact silhouette avoidance in YZ via SDF
            vec3 flowDir = safeNorm3(windDir);
             float windSpeed = 1.6; // Slower, more dramatic wind
             vec3 baseFlow = flowDir * windSpeed;
             // distance to brick silhouette in YZ (transform to normalized SDF space)
             // Use fresh position sampling to avoid cursor coordinate contamination
             vec3 freshPos = texture2D(posTex, vUv).xyz;
             vec3 localPos = (brickInverseMatrix * vec4(freshPos, 1.0)).xyz;
            float d = max(0.0, sdf3D(localPos) - sdf3DBias);
             
             // Collision detection active
             

             
            float boundary = max(0.005, sdf3DCell * 0.8);
             if (d < boundary) {
              float eps = sdf3DCell * 0.5;
              vec3 gx = vec3(eps, 0.0, 0.0);
              vec3 gy = vec3(0.0, eps, 0.0);
              vec3 gz = vec3(0.0, 0.0, eps);
              vec3 grad = vec3(
                sdf3D(localPos + gx) - sdf3D(localPos - gx),
                sdf3D(localPos + gy) - sdf3D(localPos - gy),
                sdf3D(localPos + gz) - sdf3D(localPos - gz)
              ) / (2.0 * eps);
              vec3 localNormal = safeNorm3(grad);
               // Transform normal back to world space
               vec3 n = safeNorm3(brickNormalMatrix * localNormal);
               float k = (boundary - d);
               // moderate outward push + tangential steering to wrap around
               envF += n * (20.0 * k);
              vec3 tang = safeNorm3(cross(n, flowDir));
               envF += tang * (10.0 * k);
               baseFlow *= (1.0 - 0.5 * smoothstep(0.0, boundary, boundary - d));
             }
             // Much more swirly wind effects around the brick
             float wake = smoothstep(0.4, 1.5, pos.x) * (1.0 - smoothstep(1.5, 2.5, pos.x));
             vec3 radialYZ = vec3(0.0, pos.y - 0.8, pos.z); // Center around wind height
             float radialDist = length(radialYZ.yz);
             
             // Stronger main recirculation vortex
             vec3 recirc = safeNorm3(cross(flowDir, radialYZ + 1e-4)) * (3.5 * wake);
             
             // Multiple swirling frequencies for complex turbulence
             float swirl1 = sin(time * 2.5 + radialDist * 14.0) * cos(time * 1.8 + pos.x * 7.0);
             float swirl2 = cos(time * 3.2 + radialDist * 10.0) * sin(time * 1.2 + pos.x * 4.0);
             float swirl3 = sin(time * 4.2 + pos.y * 12.0) * cos(time * 2.8 + pos.z * 9.0);
             float swirl4 = cos(time * 1.6 + radialDist * 6.0) * sin(time * 3.8 + pos.y * 5.0); // Additional swirl layer
             
             vec3 turbulence = vec3(
               (swirl2 + swirl4 * 0.6) * 0.35 * wake, // More complex longitudinal swirl
               (swirl1 + swirl3 + swirl4 * 0.8) * 0.9 * wake, // More dramatic Y turbulence
               (swirl1 - swirl3 + swirl4 * 0.4) * 0.9 * wake  // More dramatic Z turbulence
             );
             
             // Stronger vortex shedding with multiple frequencies
             float vortexPhase1 = time * 4.0 + pos.x * 3.0;
             float vortexPhase2 = time * 6.0 + pos.x * 1.5;
             float vortexStrength1 = 1.2 * wake * sin(vortexPhase1);
             float vortexStrength2 = 0.8 * wake * cos(vortexPhase2);
             
             vec3 vortexFlow = vec3(
               0.0,
               vortexStrength1 * cos(radialDist * 8.0) + vortexStrength2 * sin(radialDist * 4.0),
               vortexStrength1 * sin(radialDist * 8.0) + vortexStrength2 * cos(radialDist * 4.0)
             );
             
             // Additional spiral flow pattern
             float spiral = atan(radialYZ.z, radialYZ.y) + time * 2.0;
             vec3 spiralFlow = vec3(
               0.0,
               sin(spiral) * 0.7 * wake * radialDist, // Stronger spiral Y component
               cos(spiral) * 0.7 * wake * radialDist  // Stronger spiral Z component
             );
             
             envF += baseFlow + recirc + turbulence + vortexFlow + spiralFlow + flowDir * (6.0 * boost);
           } else if (sectionMode < 1.5) {
             // rain: gravity + much more swirly motion
             envF += vec3(0.0, -1.8, 0.0);
             
             // Enhanced swirling rain patterns with multiple frequencies
             float swirl1 = sin(pos.x * 4.0 + time * 2.5) * cos(pos.z * 3.5 + time * 1.8);
             float swirl2 = cos(pos.x * 6.0 + time * 3.2) * sin(pos.z * 2.8 - time * 2.1);
             float swirl3 = sin(pos.y * 1.5 + time * 1.5) * cos(pos.x * 1.8 + time * 2.8);
             
             // Falling spiral motion
             float heightFactor = smoothstep(-1.0, 2.0, pos.y); // Stronger effect higher up
             float distFromCenter = length(vec2(pos.x, pos.z));
             
             vec3 swirlyRain = vec3(
               (swirl1 + swirl3) * 0.15 * heightFactor,
               swirl2 * 0.08 * heightFactor, // Slight vertical swirl
               (swirl2 - swirl1) * 0.15 * heightFactor
             );
             
             // Rotational motion around falling axis
             float angle = atan(pos.z, pos.x) + time * 1.5;
             float radialSwirl = sin(angle + pos.y * 2.0) * 0.1 * heightFactor;
             vec3 circularMotion = vec3(
               radialSwirl * cos(angle + 1.57), // 90 degree offset for circular motion
               0.0,
               radialSwirl * sin(angle + 1.57)
             );
             
             // Air resistance creates more swirl when falling fast
             float fallSpeed = max(0.0, -vel.y);
             float airResistance = fallSpeed * 0.3;
             vec3 turbulentDrag = vec3(
               sin(time * 4.0 + pos.x * 8.0) * airResistance * 0.1,
               0.0,
               cos(time * 3.5 + pos.z * 7.0) * airResistance * 0.1
             );
             
             envF += swirlyRain + circularMotion + turbulentDrag;
             vec3 localPos = (brickInverseMatrix * vec4(pos, 1.0)).xyz;
            float d = max(0.0, sdf3D(localPos) - sdf3DBias);
             

             
            float boundary = max(0.005, sdf3DCell * 1.0);
             if (d < boundary) {
              float eps = sdf3DCell * 0.5;
              vec3 gx = vec3(eps, 0.0, 0.0);
              vec3 gy = vec3(0.0, eps, 0.0);
              vec3 gz = vec3(0.0, 0.0, eps);
              vec3 grad = vec3(
                sdf3D(localPos + gx) - sdf3D(localPos - gx),
                sdf3D(localPos + gy) - sdf3D(localPos - gy),
                sdf3D(localPos + gz) - sdf3D(localPos - gz)
              ) / (2.0 * eps);
              vec3 localNormal = safeNorm3(grad);
               // Transform normal back to world space
               vec3 n = safeNorm3(brickNormalMatrix * localNormal);
               float k = (boundary - d) * 2.0; // Amplify collision strength
               // push out of the surface - very strong
               envF += n * (50.0 * k);
               // damp inward velocity to prevent sticking
               float vIn = dot(vel, n);
               envF += -(vIn) * n * 25.0;
               // slide down along surface
              vec3 slideDir = safeNorm3(vec3(0.0, -1.0, 0.0) - dot(vec3(0.0, -1.0, 0.0), n) * n);
               envF += slideDir * (20.0 * k);
               // local drag near the surface
               envF += -vel * (15.0 * k);
             }
             envF += vec3(0.0, -6.0 * boost, 0.0);
           }
 
           // Always apply viscosity for settling
           vec3 viscosity = -vel * length(vel) * 0.3; // Stronger drag for quick settling
 
           // Apply forces - spring always active, cursor+fluid only when cursor moving
           vec3 totalForce = springF + cursorF + fluidForces + viscosity + envF;
 
           // Bounds: allow a larger corridor in wind/rain, tighter in disintegrate
           float maxR = sectionMode < 1.5 ? 6.0 : 2.0;
           float distFromOrigin = length(pos);
           if (distFromOrigin > maxR) {
             totalForce += -safeNorm3(pos) * (distFromOrigin - maxR) * 0.5;
           }
 
           vec3 acc = totalForce;
 
                      // Integrate velocity
           vel.xyz = (vel.xyz + acc * dt) * damping;

          // Strong NaN sanitization for velocity
          if (!(vel.x == vel.x) || abs(vel.x) > 100.0) vel.x = 0.0;
          if (!(vel.y == vel.y) || abs(vel.y) > 100.0) vel.y = 0.0;
          if (!(vel.z == vel.z) || abs(vel.z) > 100.0) vel.z = 0.0;
          
          // Additional bounds check
          vel.x = clamp(vel.x, -50.0, 50.0);
          vel.y = clamp(vel.y, -50.0, 50.0);
          vel.z = clamp(vel.z, -50.0, 50.0);
          
          // Store collision information in w component for color changes
          float collisionIntensity = 0.0;
          
          // Check if particle is at spawn position (reset collision data)
          bool isAtSpawn = false;
          if (sectionMode < 0.5) {
            // wind: check if at left spawn area (higher position, larger exclusion zone)
            isAtSpawn = (pos.x < -2.5 && abs(pos.y - 0.8) < 1.0 && abs(pos.z) < 1.0);
            if (!isAtSpawn) {
              // wind: check collision with YZ brick silhouette
              vec3 localPos = (brickInverseMatrix * vec4(pos, 1.0)).xyz;
              float d = sdfSample(sdfYZTex, sdfYZMin, sdfYZCell, sdfYZSize, localPos.yz * sdfYZFudge);
              // Normal collision intensity calculation
              collisionIntensity = smoothstep(sdfYZCell * 2.5, 0.0, d); // tighter boundary
            }
          } else if (sectionMode < 1.5) {
            // rain: check if at top spawn area (match new larger spawn area)
            isAtSpawn = (pos.y > 3.0 && abs(pos.x) < 0.6 && abs(pos.z) < 0.6);
            if (!isAtSpawn) {
              // rain: check collision with XZ brick footprint
              vec3 localPos = (brickInverseMatrix * vec4(pos, 1.0)).xyz;
              float d = sdfSample(sdfXZTex, sdfXZMin, sdfXZCell, sdfXZSize, localPos.xz * sdfXZFudge);
              // Normal collision intensity calculation - match boundary with physics collision  
              collisionIntensity = smoothstep(sdfXZCell * 4.0, 0.0, d); // fade from boundary to 0
            }
          }
          
           gl_FragColor = vec4(vel.xyz, collisionIntensity);
         }
      `,
    });

    posSimMat.current = new THREE.ShaderMaterial({
      uniforms: {
        posTex: { value: posA.texture },
        velTex: { value: velA.texture },
        dt: { value: 1 / 4 },
        time: { value: 0 }, // Add time for staggered spawning
        sectionMode: { value: 2.0 }, // 0 wind, 1 rain, 2 disintegrate
        canalXMin: { value: -3.0 },
        canalXMax: { value: 3.0 },
        rainTop: { value: 1.8 },
        rainBottom: { value: -1.3 },
      },
      vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position,1.0); }`,
      fragmentShader: `
        precision highp float; 
        varying vec2 vUv; 
        uniform sampler2D posTex, velTex; 
        uniform float dt; 
        uniform float time;
        uniform float sectionMode; 
        uniform float canalXMin, canalXMax; 
        uniform float rainTop, rainBottom; 
        // simple hash for pseudo-random
        float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
        void main(){ 
          vec3 pos = texture2D(posTex, vUv).xyz; 
          vec3 vel = texture2D(velTex, vUv).xyz; 
          vec3 newPos = pos + vel * dt;
          // Section-based wrapping
          if (sectionMode < 0.5) {
            // wind canal: staggered continuous flow for more natural pattern
            float r1 = hash12(vUv + newPos.yz);
            float r2 = hash12(vUv * 2.345 + newPos.xy);
            float r3 = hash12(vUv * 5.678 + newPos.xz);
            
            // Staggered respawn based on particle position hash for natural flow
            float respawnChance = smoothstep(2.5, 3.0, newPos.x) * (0.3 + 0.7 * r3);
            
            if (newPos.x > canalXMax || 
                newPos.x < -4.0 || 
                abs(newPos.y) > 3.0 || 
                abs(newPos.z) > 3.0 ||
                (newPos.x > 2.5 && r3 < respawnChance)) {
              
              float spawnArea = 1.2; // 4x bigger spawn area (80% of brick diameter)
              // Add slight time-based variation to spawn position
              float timeVariation = sin(time * 0.5 + r1 * 6.28) * 0.2;
              newPos.x = -3.5 + timeVariation; // Slightly varied spawn position
              newPos.y = 0.8 + (r1 - 0.5) * spawnArea; // Medium height spawn area (centered around y=0.8)
              newPos.z = (r2 - 0.5) * spawnArea; // Larger area
            }
          } else if (sectionMode < 1.5) {
            // rain: simple respawn from top when hitting bottom
            if (newPos.y < rainBottom) {
              float r1 = hash12(vUv + newPos.xz);
              float r2 = hash12(vUv + newPos.zy + 1.234);
              float spawnArea = 1.2; // 4x bigger spawn area (80% of brick diameter)
              
              // Simple spawn at top in larger area
              newPos.x = (r1 - 0.5) * spawnArea; // Larger XZ area centered
              newPos.y = 3.5; // Much higher spawn height
              newPos.z = (r2 - 0.5) * spawnArea; // Larger XZ area centered
            }
          }
          // Strong NaN sanitization for position
          if (!(newPos.x == newPos.x) || abs(newPos.x) > 1000.0) newPos.x = 0.0;
          if (!(newPos.y == newPos.y) || abs(newPos.y) > 1000.0) newPos.y = 0.0;
          if (!(newPos.z == newPos.z) || abs(newPos.z) > 1000.0) newPos.z = 0.0;
          
          // Additional bounds check
          newPos.x = clamp(newPos.x, -10.0, 10.0);
          newPos.y = clamp(newPos.y, -5.0, 5.0);
          newPos.z = clamp(newPos.z, -10.0, 10.0);
          gl_FragColor = vec4(newPos, 1.0); 
        }`,
    });

    // render material for points
    renderMat.current = new THREE.ShaderMaterial({
      uniforms: {
        posTex: { value: posA.texture },
        velTex: { value: velA.texture }, // Add velocity texture for collision data
        baseTex: { value: baseTex },
        size: { value: 5.0 },
        color: { value: new THREE.Color('#D2B48C') },
        modelScale: { value: 1.0 },
        opacity: { value: 0.85 },
        debugMode: { value: 0.0 },
        debugScale: { value: 6.0 },
        sizeVariation: { value: 1.0 }, // Controls how much size variation to apply (0=uniform, 1=full variation)
        useBase: { value: 0.0 },
        sectionMode: { value: 2.0 }, // Add section mode for color changes
        // Section-specific colors - realistic wind particles
        windColor: { value: new THREE.Color('#C4A373') }, // Dust/sand color for realistic wind debris
        windCollisionColor: { value: new THREE.Color('#8B4513') }, // Darker brown when hitting brick
        rainColor: { value: new THREE.Color('#4A90E2') }, // Blue for rain
        rainCollisionColor: { value: new THREE.Color('#87CEEB') }, // Light blue when hitting brick
        materialColor: { value: new THREE.Color('#D2B48C') }, // Light brown for material study
      },
      transparent: true,
      depthTest: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
      vertexShader: `
        precision highp float; precision highp int;
        uniform sampler2D posTex; uniform sampler2D baseTex;
        uniform float size; uniform float modelScale; uniform float debugMode; uniform float debugScale;
        uniform float sizeVariation; // Control amount of size variation
        uniform float useBase;
        // uv is already provided by Three.js as a built-in attribute
        varying vec2 vUv;
        varying vec3 vDebugColor;
        void main(){
          vUv = uv;
          vec3 pos;
          if (debugMode > 0.5) {
            // Spread points in a plane to verify draw count
            pos = vec3( (uv.x - 0.5) * debugScale, (uv.y - 0.5) * debugScale, 0.0 );
            vDebugColor = vec3(uv.x, uv.y, 0.5); // color by UV
          } else {
            vec4 texSample = (useBase > 0.5) ? texture2D(baseTex, uv) : texture2D(posTex, uv);
            pos = texSample.xyz; // already world space
            vDebugColor = vec3(0.0, 1.0, 0.0);
          }
          vec4 mv = modelViewMatrix * vec4(pos, 1.0);
          gl_Position = projectionMatrix * mv;
          float atten = clamp(240.0 / max(-mv.z, 0.001), 0.6, 3.2);
          
          // Create realistic size variation based on particle ID (UV coordinates)
          // Use only UV to create deterministic but varied sizes that remain constant per particle
          float sizeHash = sin(vUv.x * 123.456 + vUv.y * 789.123 + vUv.x * vUv.y * 456.789);
          sizeHash = sizeHash * 0.5 + 0.5; // Normalize to 0-1
          
          // Create size categories: dust (small), sand (medium), debris (large) - max size reduced by half
          float particleSize;
          if (sizeHash < 0.6) {
            // 60% dust particles - very small
            particleSize = 0.3 + sizeHash * 0.33; // 0.3 to 0.5
          } else if (sizeHash < 0.85) {
            // 25% sand particles - medium
            particleSize = 0.5 + (sizeHash - 0.6) * 0.8; // 0.5 to 0.7
          } else {
            // 15% debris particles - large (reduced from max 1.5 to max 0.75)
            particleSize = 0.65 + (sizeHash - 0.85) * 0.67; // 0.65 to 0.75
          }
          
          // Apply size variation factor
          particleSize = mix(1.0, particleSize, sizeVariation);
          
          gl_PointSize = size * atten * particleSize;
        }
      `,
      fragmentShader: `
        precision highp float; precision highp int; 
        uniform vec3 color; 
        varying vec2 vUv; 
        varying vec3 vDebugColor;
        uniform sampler2D posTex, velTex; 
        uniform float debugMode;
        uniform float opacity;
        uniform float sectionMode;
        uniform vec3 windColor, windCollisionColor;
        uniform vec3 rainColor, rainCollisionColor;
        uniform vec3 materialColor;
        void main(){
          vec2 p = gl_PointCoord*2.0-1.0; 
          float r = dot(p,p); 
          if(r>1.0) discard; 
          float a = smoothstep(1.0, 0.0, r);
          
          vec3 c = color; // Default color
          
          if (debugMode < 0.5) {
            // Get collision intensity from velocity texture w component
            vec4 velSample = texture2D(velTex, vUv);
            float collisionIntensity = velSample.w;
            
            if (sectionMode < 0.5) {
              // Wind section: realistic dust/debris particles with variation
              vec3 pos = texture2D(posTex, vUv).xyz;
              vec3 vel = texture2D(velTex, vUv).xyz;
              
              // Create particle variety based on position and velocity
              float dustVariation = sin(pos.x * 15.0 + pos.y * 12.0 + pos.z * 18.0) * 0.5 + 0.5;
              float speedVariation = length(vel) * 2.0;
              
              // Mix different earth tones for realistic debris
              vec3 dustColor1 = vec3(0.77, 0.64, 0.45); // Sandy brown
              vec3 dustColor2 = vec3(0.65, 0.49, 0.24); // Darker earth
              vec3 dustColor3 = vec3(0.85, 0.75, 0.60); // Light dust
              
              // Blend colors based on particle characteristics
              vec3 baseColor = mix(dustColor1, dustColor2, dustVariation);
              baseColor = mix(baseColor, dustColor3, speedVariation * 0.3);
              
              // Mix with collision color when hitting brick
              c = mix(baseColor, windCollisionColor, collisionIntensity);
            } else if (sectionMode < 1.5) {
              // Rain section: blue particles, light blue when colliding
              c = mix(rainColor, rainCollisionColor, collisionIntensity);
            } else {
              // Material study: light brown (default)
              c = materialColor;
            }
          }
          
          gl_FragColor = vec4(c, a * opacity);
        }
      `,
    });
    
    // Set SDF uniforms now that materials are created
    if (sdfYZTex && sdfXZTex && velSimMat.current) {
      (velSimMat.current.uniforms as any).sdfYZTex.value = sdfYZTex;
      (velSimMat.current.uniforms as any).sdfYZMin.value.set(
        sdfYZTex.image ? (sdfYZTex as any)._minYg || -1 : -1,
        sdfYZTex.image ? (sdfYZTex as any)._minZg || -1 : -1
      );
      (velSimMat.current.uniforms as any).sdfYZCell.value = (sdfYZTex as any)._cell || 0.12;
      (velSimMat.current.uniforms as any).sdfYZSize.value.set(sdfYZTex.image.width, sdfYZTex.image.height);
      
      (velSimMat.current.uniforms as any).sdfXZTex.value = sdfXZTex;
      (velSimMat.current.uniforms as any).sdfXZMin.value.set(
        sdfXZTex.image ? (sdfXZTex as any)._minXg || -1 : -1,
        sdfXZTex.image ? (sdfXZTex as any)._minZg2 || -1 : -1
      );
      (velSimMat.current.uniforms as any).sdfXZCell.value = (sdfXZTex as any)._cell || 0.12;
      (velSimMat.current.uniforms as any).sdfXZSize.value.set(sdfXZTex.image.width, sdfXZTex.image.height);
      
      // 3D SDF uniforms
      if (sdf3DTex) {
        (velSimMat.current.uniforms as any).sdf3DTex.value = sdf3DTex;
        (velSimMat.current.uniforms as any).sdf3DMin.value.copy((sdf3DTex as any)._min3D);
        (velSimMat.current.uniforms as any).sdf3DCell.value = (sdf3DTex as any)._cell3D;
        (velSimMat.current.uniforms as any).sdf3DSize.value.copy((sdf3DTex as any)._size3D);
        (velSimMat.current.uniforms as any).sdf3DTiles.value.copy((sdf3DTex as any)._tiles3D);
      }

      console.log('[GPU Particles] SDF uniforms set on material (including 3D)');

    }

    return () => {
      posA.dispose(); posB.dispose(); velA.dispose(); velB.dispose();
      baseTex.dispose();
      blitMat.dispose();
      sdfYZTex?.dispose(); sdfXZTex?.dispose();
      posSimMat.current?.dispose(); velSimMat.current?.dispose(); renderMat.current?.dispose();
    };
  }, [gl, baseData, simCam, simScene, quad, texSize, support]);

  // simulate
  useFrame(({ clock }) => {
    // remove reveal debug
    const revealRef = { frames: 0 } as any;
    // Keep particle render group at identity because posTex stores world-space positions already
    if (groupRef.current) {
      groupRef.current.position.set(0, 0, 0);
      groupRef.current.quaternion.set(0, 0, 0, 1);
      groupRef.current.scale.set(1, 1, 1);
    }
    if (!support || !posTargets.current || !velTargets.current || !posSimMat.current || !velSimMat.current) return;
    // cursor in local z=0 plane
    const ndc = new THREE.Vector2(cursor.x, -cursor.y);
    ray.setFromCamera(ndc, camera);
    const worldPoint = new THREE.Vector3();
    ray.ray.intersectPlane(plane, worldPoint);
    // Particles are now in world space, so use world cursor position directly
    const worldCursor = worldPoint.clone();
    
    // Use real mouse cursor for interaction
    (velSimMat.current.uniforms as any).cursor.value.copy(worldCursor);
    (velSimMat.current.uniforms as any).time.value = clock.elapsedTime;
    
    // Convert cursor velocity from screen space to world space properly
    // cursorVel is in screen space (-1 to 1), we need to convert it to world units
    const screenToWorldScale = camera.position.z; // Rough approximation for orthographic-like scaling
    const worldCursorVel = new THREE.Vector3(
      cursorVel.x * screenToWorldScale * 0.1, // Scale down for appropriate force
      -cursorVel.y * screenToWorldScale * 0.1, // Flip Y and scale
      0
    );
    (velSimMat.current.uniforms as any).cursorVel.value.copy(worldCursorVel);
    
    // Update brick inverse matrix for accurate collision detection
    const brickInverseMatrix = new THREE.Matrix4().copy(heroMatrixRef.current).invert();
    (velSimMat.current.uniforms as any).brickInverseMatrix.value.copy(brickInverseMatrix);
    
    // Update brick normal matrix for transforming normals from local to world space
    const brickNormalMatrix = new THREE.Matrix3().getNormalMatrix(heroMatrixRef.current);
    (velSimMat.current.uniforms as any).brickNormalMatrix.value.copy(brickNormalMatrix);
    
    // Provide full brick world matrix for mapping base positions to world in material study
    (velSimMat.current.uniforms as any).brickMatrix.value.copy(heroMatrixRef.current);
    // baseCenter retained for potential debug use; no scaleBack needed now
    (velSimMat.current.uniforms as any).baseCenter && (velSimMat.current.uniforms as any).baseCenter.value.copy(baseGeomInfoRef.current.center);


    
    (velSimMat.current.uniforms as any).debugFrame.value = frameRef.current;
    
    // Debug brick transform and collision positions every 60 frames (1 second)
    if (frameRef.current % 60 === 0) {
      const pos = new THREE.Vector3();
      const quat = new THREE.Quaternion();
      const scale = new THREE.Vector3();
      heroMatrixRef.current.decompose(pos, quat, scale);
      const euler = new THREE.Euler().setFromQuaternion(quat);
      
      console.log('[BRICK DEBUG] Main brick world transform:', {
        position: { x: pos.x.toFixed(3), y: pos.y.toFixed(3), z: pos.z.toFixed(3) },
        rotation: { x: euler.x.toFixed(3), y: euler.y.toFixed(3), z: euler.z.toFixed(3) },
        scale: { x: scale.x.toFixed(3), y: scale.y.toFixed(3), z: scale.z.toFixed(3) }
      });
      console.log('[BRICK DEBUG] Inverse matrix determinant:', brickInverseMatrix.determinant().toFixed(6));
      
      // Sample particle positions and velocities for collision debugging
      const pixels = new Float32Array(4 * 16); // Sample 4x4 = 16 particles
      gl.readRenderTargetPixels(posTargets.current.read, 0, 0, 4, 4, pixels);
      
      const velPixels = new Float32Array(4 * 16); 
      gl.readRenderTargetPixels(velTargets.current.read, 0, 0, 4, 4, velPixels);
      
      console.log('[COLLISION DEBUG] Sample particle positions and velocities:');
      for (let i = 0; i < 4; i++) {
        const idx = i * 4;
        const velIdx = i * 4;
        const worldPos = [pixels[idx], pixels[idx + 1], pixels[idx + 2]];
        const vel = [velPixels[velIdx], velPixels[velIdx + 1], velPixels[velIdx + 2]];
        
        // Transform to SDF local space (with NaN protection)
        const localPos = new THREE.Vector3(...worldPos);
        if (isNaN(localPos.x) || isNaN(localPos.y) || isNaN(localPos.z)) {
          console.warn(`[COLLISION DEBUG] NaN world position detected:`, worldPos);
          localPos.set(0, 0, 0); // Fallback to origin
        } else {
          localPos.applyMatrix4(brickInverseMatrix);
          if (isNaN(localPos.x) || isNaN(localPos.y) || isNaN(localPos.z)) {
            console.warn(`[COLLISION DEBUG] NaN after matrix transform:`, worldPos, '→', localPos);
            localPos.set(0, 0, 0); // Fallback to origin
          }
        }
        
        // Test SDF sampling at brick center
        const brickCenterWorld = [pos.x, pos.y, pos.z];
        const brickCenterLocal = new THREE.Vector3(...brickCenterWorld).applyMatrix4(brickInverseMatrix);
        
        console.log(`Particle ${i}:`, {
          worldPos: worldPos.map(v => v.toFixed(3)),
          localPos: [localPos.x.toFixed(3), localPos.y.toFixed(3), localPos.z.toFixed(3)],
          velocity: vel.map(v => v.toFixed(3)),
          markerDetected: Math.abs(vel[0]) > 5,
          distanceToBrick: Math.sqrt(
            Math.pow(worldPos[0] - pos.x, 2) + 
            Math.pow(worldPos[1] - pos.y, 2) + 
            Math.pow(worldPos[2] - pos.z, 2)
          ).toFixed(3)
        });
        
        if (i === 0) {
          console.log('[COLLISION DEBUG] Brick center world→local transform:', {
            brickCenterWorld: brickCenterWorld.map(v => v.toFixed(3)),
            brickCenterLocal: [brickCenterLocal.x.toFixed(3), brickCenterLocal.y.toFixed(3), brickCenterLocal.z.toFixed(3)],
            expectedLocal: [0, 0, 0] // Should be origin in SDF space
          });
          
          // Debug SDF coordinate sampling
          console.log('[SDF DEBUG] Coordinate system check:', {
            // For wind (YZ plane): should use localPos.yz
            windCoords: `YZ=(${brickCenterLocal.y.toFixed(3)}, ${brickCenterLocal.z.toFixed(3)})`,
            // For rain (XZ plane): should use localPos.xz  
            rainCoords: `XZ=(${brickCenterLocal.x.toFixed(3)}, ${brickCenterLocal.z.toFixed(3)})`,
            sdfBounds: {
              YZ: `minY=${((velSimMat.current.uniforms as any).sdfYZMin.value.x || 0).toFixed(3)}, minZ=${((velSimMat.current.uniforms as any).sdfYZMin.value.y || 0).toFixed(3)}`,
              XZ: `minX=${((velSimMat.current.uniforms as any).sdfXZMin.value.x || 0).toFixed(3)}, minZ=${((velSimMat.current.uniforms as any).sdfXZMin.value.y || 0).toFixed(3)}`
            }
          });
        }
      }
    }
    
    // Determine section mode for shader (0 wind, 1 rain, 2 disintegrate)
    const sectionModeValue = mode === 'wind' ? 0.0 : mode === 'rain' ? 1.0 : 2.0;
    (velSimMat.current.uniforms as any).sectionMode.value = sectionModeValue;
    (posSimMat.current.uniforms as any).sectionMode.value = sectionModeValue;

    // Per-section physics tuning and one-shot boost when mode changes
    const uniforms = velSimMat.current.uniforms as any;
    const changedSection = lastSectionRef.current !== mode;
    if (changedSection) {
      lastSectionRef.current = mode;
      // kick particles so they detach from the base on section enter
      boostRef.current = mode === 'wind' ? 1.0 : mode === 'rain' ? 1.0 : 0.0;
      // no reveal overlay
      console.debug('[GPU Particles] Section changed →', mode, 'boost=1, frameRef reset to 0');
      // Reset frame counter on section change to restart debug sequence
      frameRef.current = 0;
      // Reseed positions for flow sections so they don't start glued to brick
      if ((mode === 'wind' || mode === 'rain') && seedSectionPositions.current) {
        seedSectionPositions.current(mode);
      }
    }
    // Exponential decay of boost
    boostRef.current *= 0.92;
    if (boostRef.current < 0.001) boostRef.current = 0.0;
    uniforms.boost.value = boostRef.current;

    // ensure dtVal is defined before section-based assignment
    let dtVal = 1 / 8;

    if (sectionModeValue < 0.5) {
      // wind
      uniforms.kRest.value = 0.0;
      uniforms.kExc.value = 0.0;
      uniforms.repelStrength.value = 0.0;
      uniforms.damping.value = 0.992; // higher damping to slow down
      uniforms.sigma.value = 0.35;
      uniforms.swirlStrength.value = 0.0;
      dtVal = 1 / 24; // slower integration for wind
    } else if (sectionModeValue < 1.5) {
      // rain
      uniforms.kRest.value = 0.0;
      uniforms.kExc.value = 0.0;
      uniforms.repelStrength.value = 0.0;
      uniforms.damping.value = 0.996; // very high damping for heavy drops
      uniforms.sigma.value = 0.25;
      uniforms.swirlStrength.value = 0.0;
      dtVal = 1 / 28; // slower integration for rain
    } else {
      // disintegrate
      uniforms.kRest.value = 1.5;
      uniforms.kExc.value = 0.3;
      uniforms.repelStrength.value = 8.0;
      uniforms.damping.value = 0.92;
      uniforms.sigma.value = 0.58;
      uniforms.swirlStrength.value = 3.5;
      boostRef.current = 0.0;
      dtVal = 1 / 10; // responsive interaction
    }
    (velSimMat.current.uniforms as any).dt.value = dtVal;
    (posSimMat.current.uniforms as any).dt.value = dtVal;
 
    // Debug cursor velocity every 30 frames
    if (Math.floor(clock.elapsedTime * 60) % 30 === 0) {
      const speed = Math.sqrt(cursorVel.x * cursorVel.x + cursorVel.y * cursorVel.y);
      console.log(`[GPU Particles] CursorVel: ${cursorVel.x.toFixed(3)}, ${cursorVel.y.toFixed(3)} | Speed: ${speed.toFixed(3)} | World: ${worldCursorVel.x.toFixed(3)}, ${worldCursorVel.y.toFixed(3)}, ${worldCursorVel.z.toFixed(3)}`);
    }
    
    // Debug cursor every 15 frames for more detail
    if (Math.floor(clock.elapsedTime * 60) % 15 === 0) {
      console.log(`[GPU Particles] Section: ${mode} (${sectionModeValue}) | dt: ${dtVal} | Raw: ${cursor.x.toFixed(3)}, ${cursor.y.toFixed(3)} | NDC: ${ndc.x.toFixed(3)}, ${ndc.y.toFixed(3)} | World: ${worldPoint.x.toFixed(3)}, ${worldPoint.y.toFixed(3)}, ${worldPoint.z.toFixed(3)} | Uniform: ${(velSimMat.current.uniforms as any).cursor.value.x.toFixed(3)}, ${(velSimMat.current.uniforms as any).cursor.value.y.toFixed(3)}, ${(velSimMat.current.uniforms as any).cursor.value.z.toFixed(3)}`);
    }
 
    // velocity pass
    quad.material = velSimMat.current;
    (velSimMat.current.uniforms as any).posTex.value = posTargets.current.read.texture;
    (velSimMat.current.uniforms as any).velTex.value = velTargets.current.read.texture;
    simScene.add(quad);
    const velRead = velTargets.current.write, velWrite = velTargets.current.read;
    gl.setRenderTarget(velRead); gl.clear(); gl.render(simScene, simCam);
    gl.setRenderTarget(null);
    simScene.remove(quad);
    // swap
    velTargets.current = { read: velRead, write: velWrite };
 
    // position pass
    quad.material = posSimMat.current;
    (posSimMat.current.uniforms as any).posTex.value = posTargets.current.read.texture;
    (posSimMat.current.uniforms as any).velTex.value = velTargets.current.read.texture;
    (posSimMat.current.uniforms as any).sectionMode.value = sectionModeValue;
    (posSimMat.current.uniforms as any).time.value = clock.elapsedTime;
    simScene.add(quad);
    const posRead = posTargets.current.write, posWrite = posTargets.current.read;
    gl.setRenderTarget(posRead); gl.clear(); gl.render(simScene, simCam);
    gl.setRenderTarget(null);
    simScene.remove(quad);
    // ping pong (set read to the freshly written target)
    posTargets.current = { read: posRead, write: posWrite };
 
    // update render material to use latest pos texture
    if (renderMat.current) {
      (renderMat.current.uniforms as any).posTex.value = posTargets.current.read.texture;
      (renderMat.current.uniforms as any).velTex.value = velTargets.current.read.texture; // Update velocity texture for collision data
      (renderMat.current.uniforms as any).sectionMode.value = sectionModeValue; // Update section mode for colors
      // After a couple of frames, switch off debug plane to sample posTex
      frameRef.current++;
      // Debug current frame and render state
      if (frameRef.current % 60 === 0) {
        console.log(`[GPU Particles] Frame: ${frameRef.current}, DebugMode: ${(renderMat.current.uniforms as any).debugMode.value}, UseBase: ${(renderMat.current.uniforms as any).useBase.value}`);
      }
      // Keep debug mode on for shorter time to verify points are rendering
      if (frameRef.current === 20) {
        console.log('Switching from debug to simulation mode');
        (renderMat.current.uniforms as any).debugMode.value = 0.0;
        // Go directly to simulation - no base transition
        (renderMat.current.uniforms as any).useBase.value = 0.0;
      }
      
      // Debug: sample a few pixels from position texture
      if (frameRef.current % 60 === 0) {
        const readBuffer = new Float32Array(4 * 16); // read 4x4 pixels RGBA
        try {
          gl.readRenderTargetPixels(posTargets.current.read, 0, 0, 4, 4, readBuffer);
          let minV = 1e9, maxV = -1e9;
          for (let i = 0; i < readBuffer.length; i += 4) {
            const x = readBuffer[i+0], y = readBuffer[i+1], z = readBuffer[i+2];
            if (x === x) { minV = Math.min(minV, x); maxV = Math.max(maxV, x); }
            if (y === y) { minV = Math.min(minV, y); maxV = Math.max(maxV, y); }
            if (z === z) { minV = Math.min(minV, z); maxV = Math.max(maxV, z); }
          }
          console.log('GPU Positions sample:', { frame: frameRef.current, min: minV, max: maxV });
          
          // Also sample velocity texture to see if it's changing
          const velBuffer = new Float32Array(4 * 4); // read 2x2 pixels RGBA 
          gl.readRenderTargetPixels(velTargets.current.read, 0, 0, 2, 2, velBuffer);
          const velMags = [0, 1, 2, 3].map(i => Math.sqrt(velBuffer[i*4]*velBuffer[i*4] + velBuffer[i*4+1]*velBuffer[i*4+1] + velBuffer[i*4+2]*velBuffer[i*4+2]));
          console.log('GPU Velocity sample:', { mags: velMags.map(v => v.toFixed(4)), raw: [velBuffer[0], velBuffer[1], velBuffer[2]] });
        } catch (e) {
          console.error('Failed to read positions:', e);
        }
      }
    }
  });

  // build draw geometry (N*N points)
  const geom = useMemo(() => {
    const g = new THREE.BufferGeometry();
    // Fill CPU positions with a unit quad fan so R3F sees non-degenerate points
    const positions = new Float32Array(count * 3);
    const uvs = new Float32Array(count * 2);
    
    let idx = 0;
    for (let y = 0; y < texSize; y++) {
      for (let x = 0; x < texSize; x++) {
        // Position (not used when sampling from texture, but needed for THREE.Points)
        positions[idx * 3 + 0] = 0.0;
        positions[idx * 3 + 1] = 0.0;
        positions[idx * 3 + 2] = 0.0;
        
        // UV coordinates for texture sampling
        uvs[idx * 2 + 0] = (x + 0.5) / texSize;
        uvs[idx * 2 + 1] = (y + 0.5) / texSize;
        
        idx++;
      }
    }
    
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    g.setDrawRange(0, count);
    
    // Debug log to verify UVs
    console.log('GPU Geometry UV check:', {
      count,
      firstUV: [uvs[0], uvs[1]],
      lastUV: [uvs[(count-1)*2], uvs[(count-1)*2+1]],
      midUV: [uvs[count], uvs[count+1]]
    });
    
    // ensure it's never culled (positions come from texture, CPU verts are at origin)
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 5000);
    return g;
  }, [count, texSize]);

  if (!support) {
    // Fallback to CPU-based particles
    return <DisintegrationParticles visible={visible} cursor={cursor} heroMatrixRef={heroMatrixRef} mode="disintegrate" />;
  }
  if (!renderMat.current) return null;
  return (
    <group ref={groupRef} visible={visible} position={[0, 0.8, 0]}>
      <points ref={instanced} geometry={geom} frustumCulled={false} renderOrder={0}>
        <primitive object={renderMat.current!} attach="material" />
      </points>
    </group>
  );
}

// Bottom drawer component that shows content based on current section
function BottomDrawer({ currentSection }: { currentSection: SceneMode }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [dragY, setDragY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  
  // Content for each section
  const sectionContent = {
    structure: {
      title: "Octagonal precision, climate‑ready.",
      subtitle: "Move your cursor — the structure responds.",
      content: (
        <div className="mt-4 sm:mt-6 flex items-center gap-2 sm:gap-3 text-xs sm:text-sm text-white/80 flex-wrap">
          <span className="inline-flex items-center gap-1 sm:gap-2"><Monitor className="w-3 h-3 sm:w-4 sm:h-4" /> Desktop</span>
          <span className="inline-flex items-center gap-1 sm:gap-2"><Smartphone className="w-3 h-3 sm:w-4 sm:h-4" /> Mobile</span>
          <span className="inline-flex items-center gap-1 sm:gap-2"><Headset className="w-3 h-3 sm:w-4 sm:h-4" /> AR/VR</span>
        </div>
      )
    },
    brick: {
      title: "The brick",
      subtitle: "Clean geometry, modular, and efficient.",
      content: (
        <div className="mt-4 sm:mt-6">
          <h3 className="text-sm sm:text-lg font-semibold text-white/90 mb-2 sm:mb-3">What is this brick?</h3>
          <p className="text-xs sm:text-base text-white/80 leading-relaxed">A student‑designed octagonal unit optimized for thermal stability and structural interlock.</p>
        </div>
      )
    },
    wind: {
      title: "Wind response",
      subtitle: "Particles flow with your cursor to visualize pressure and airflow.",
      content: (
        <div className="mt-4 sm:mt-6">
          <h3 className="text-sm sm:text-lg font-semibold text-white/90 mb-2 sm:mb-3">How it handles wind</h3>
          <p className="text-xs sm:text-base text-white/80 leading-relaxed">Facet orientation and interlock reduce drag and improve lateral stability under wind loads.</p>
        </div>
      )
    },
    rain: {
      title: "Rain + moisture",
      subtitle: "Falling particles and a wet surface illustrate material behavior.",
      content: (
        <div className="mt-4 sm:mt-6">
          <h3 className="text-sm sm:text-lg font-semibold text-white/90 mb-2 sm:mb-3">Performance in rain</h3>
          <p className="text-xs sm:text-base text-white/80 leading-relaxed">Surface roughness and capillarity control moisture absorption; coatings further improve resilience.</p>
        </div>
      )
    },
    disintegrate: {
      title: "Material study",
      subtitle: "The brick dissolves into particles — explore casting options.",
      content: (
        <div className="mt-4 sm:mt-6">
          <h3 className="text-sm sm:text-lg font-semibold text-white/90 mb-2 sm:mb-3">Casting materials</h3>
          <p className="text-xs sm:text-base text-white/80 leading-relaxed">Use earth-based composites, recycled aggregates, or cementitious mixes. Add fibers for tensile strength.</p>
        </div>
      )
    }
  };

  const currentContent = sectionContent[currentSection];

  // Handle touch/mouse drag
  const handleDragStart = (clientY: number) => {
    setIsDragging(true);
    setDragY(clientY);
  };

  const handleDragMove = (clientY: number) => {
    if (!isDragging) return;
    
    const deltaY = dragY - clientY;
    if (deltaY > 50) {
      setIsExpanded(true);
    } else if (deltaY < -50) {
      setIsExpanded(false);
    }
  };

  const handleDragEnd = () => {
    setIsDragging(false);
    setDragY(0);
  };

  return (
    <motion.div
      className="fixed left-0 right-0 z-50 drawer-glass"
      initial={{ y: "85%" }}
      animate={{ 
        y: isExpanded ? "10vh" : "85%"
      }}
      transition={{ type: "spring", damping: 30, stiffness: 300 }}
      style={{ 
        bottom: 0,
        height: "90vh",
        minHeight: "90vh"
      }}
    >
      {/* Visual drag handle indicator */}
      <div className="flex justify-center pt-4 pb-2">
        <div className="w-16 h-2 bg-white/40 rounded-full" />
      </div>

      {/* Drag handle */}
      <div 
        className="w-full px-6 py-4 cursor-pointer select-none"
        style={{ padding: '1rem 1.5rem' }}
        onMouseDown={(e) => handleDragStart(e.clientY)}
        onMouseMove={(e) => handleDragMove(e.clientY)}
        onMouseUp={handleDragEnd}
        onMouseLeave={handleDragEnd}
        onTouchStart={(e) => handleDragStart(e.touches[0].clientY)}
        onTouchMove={(e) => handleDragMove(e.touches[0].clientY)}
        onTouchEnd={handleDragEnd}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0 pr-2">
            <h2 className="text-xs sm:text-xl md:text-2xl lg:text-3xl font-semibold text-white/90 leading-tight drop-shadow-sm break-words">
              {currentContent.title}
            </h2>
            <p className="text-xs sm:text-sm md:text-base text-white/70 mt-1 line-clamp-2 drop-shadow-sm">
              {currentContent.subtitle}
            </p>
          </div>
          <div className="p-2 rounded-full bg-white/20 hover:bg-white/30 transition-all duration-200 flex-shrink-0 backdrop-blur-sm self-start">
            {isExpanded ? (
              <ChevronDown className="w-4 h-4 sm:w-5 sm:h-5 text-white/80" />
            ) : (
              <ChevronUp className="w-4 h-4 sm:w-5 sm:h-5 text-white/80" />
            )}
          </div>
        </div>
      </div>

      {/* Expanded content */}
      <motion.div
        className="overflow-y-auto"
        style={{ padding: '0 1.5rem 1.5rem 1.5rem' }}
        initial={{ opacity: 0, height: 0 }}
        animate={{ 
          opacity: isExpanded ? 1 : 0,
          height: isExpanded ? "auto" : 0
        }}
        transition={{ duration: 0.3 }}
      >
        <div className="max-w-3xl mx-auto">
          {currentContent.content}
          
          {/* Progress indicators */}
          <div className="mt-8 flex justify-center">
            <div className="flex space-x-3">
              {Object.keys(sectionContent).map((section) => (
                <div
                  key={section}
                  className={`w-3 h-3 rounded-full transition-all duration-300 ${
                    section === currentSection ? 'bg-white/80 shadow-lg' : 'bg-white/30'
                  }`}
                />
              ))}
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

export default function LandingPage({ onModeSelect }: LandingPageProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [sceneMode, setSceneMode] = useState<SceneMode>('structure');
  const [cursor, setCursor] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const cursorVelRef = useRef({ x: 0, y: 0 });
  const prevCursorRef = useRef({ x: 0, y: 0, time: 0 });
  const [progress, setProgress] = useState<{ structure: number; brick: number; wind: number; rain: number; disintegrate: number }>({ structure: 1, brick: 0, wind: 0, rain: 0, disintegrate: 0 });
  const heroMatrixRef = useRef<THREE.Matrix4>(new THREE.Matrix4());
  const sectionRefs = {
    structure: useRef<HTMLDivElement>(null),
    brick: useRef<HTMLDivElement>(null),
    wind: useRef<HTMLDivElement>(null),
    rain: useRef<HTMLDivElement>(null),
    disintegrate: useRef<HTMLDivElement>(null)
  };

  useEffect(() => {
    const handleMove = (e: MouseEvent) => {
      const nx = (e.clientX / window.innerWidth) * 2 - 1;
      const ny = (e.clientY / window.innerHeight) * 2 - 1;
      
      // Calculate cursor velocity
      const currentTime = performance.now();
      const dt = (currentTime - prevCursorRef.current.time) / 1000; // convert to seconds
      const vx = dt > 0 ? (nx - prevCursorRef.current.x) / dt : 0;
      const vy = dt > 0 ? (ny - prevCursorRef.current.y) / dt : 0;
      
      // Update cursor position and velocity
      setCursor({ x: nx, y: ny });
      cursorVelRef.current = { x: vx, y: vy };
      
      // Store previous position and time for next calculation
      prevCursorRef.current = { x: nx, y: ny, time: currentTime };
      
      // Debug cursor every few frames
      if (Math.random() < 0.01) { // ~1% chance per mouse move
        const speed = Math.sqrt(vx * vx + vy * vy);
        console.log(`[LandingPage] Mouse: ${e.clientX}, ${e.clientY} → Cursor: ${nx.toFixed(3)}, ${ny.toFixed(3)} | Vel: ${vx.toFixed(3)}, ${vy.toFixed(3)} | Speed: ${speed.toFixed(3)}`);
      }
    };
    window.addEventListener('mousemove', handleMove);
    return () => window.removeEventListener('mousemove', handleMove);
  }, []);

  // Decay cursor velocity when mouse stops moving
  useEffect(() => {
    const decayInterval = setInterval(() => {
      const currentTime = performance.now();
      const timeSinceLastMove = currentTime - prevCursorRef.current.time;
      
      if (timeSinceLastMove > 100) { // if no movement for 100ms, start decay
        const decayRate = 0.9; // velocity decays to 90% each interval
        cursorVelRef.current.x *= decayRate;
        cursorVelRef.current.y *= decayRate;
        
        // Zero out very small velocities
        if (Math.abs(cursorVelRef.current.x) < 0.01) cursorVelRef.current.x = 0;
        if (Math.abs(cursorVelRef.current.y) < 0.01) cursorVelRef.current.y = 0;
      }
    }, 16); // ~60fps
    
    return () => clearInterval(decayInterval);
  }, []);

  useEffect(() => {
    const entriesToMode = (id: string): SceneMode => id as SceneMode;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible && visible.target.id) {
          const mode = entriesToMode(visible.target.id);
          // debug: section visibility
          console.debug('[LandingPage] sceneMode →', mode);
          setSceneMode(mode);
        }
      },
      { threshold: [0.5, 0.7] }
    );
    Object.values(sectionRefs).forEach((ref) => { if (ref.current) observer.observe(ref.current) });
    return () => observer.disconnect();
  }, []);

  // Scroll-driven per-section progress for smooth camera transitions
  useEffect(() => {
    const computeProgressFor = (el: HTMLElement | null): number => {
      if (!el) return 0;
      const rect = el.getBoundingClientRect();
      const vh = window.innerHeight;
      const centerY = vh * 0.5;
      const sectionCenter = rect.top + rect.height * 0.5;
      const maxDist = vh * 0.5 + rect.height * 0.5;
      const dist = Math.abs(sectionCenter - centerY);
      const p = 1 - dist / maxDist;
      return THREE.MathUtils.clamp(p, 0, 1);
    };
    
    const update = () => {
      const next = {
        structure: computeProgressFor(sectionRefs.structure.current),
        brick: computeProgressFor(sectionRefs.brick.current),
        wind: computeProgressFor(sectionRefs.wind.current),
        rain: computeProgressFor(sectionRefs.rain.current),
        disintegrate: computeProgressFor(sectionRefs.disintegrate.current),
      };
      // debug: progress values
      console.debug('[LandingPage] progress', next);
      setProgress(next);
    };
    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update as EventListener);
      window.removeEventListener('resize', update);
    };
  }, [sectionRefs.brick, sectionRefs.wind, sectionRefs.rain, sectionRefs.disintegrate]);

  const handleModeSelect = (mode: 'creator' | 'visitor') => {
    setIsLoading(true);
    setTimeout(() => { onModeSelect(mode); setIsLoading(false); }, 600);
  };

  // Removed legacy rotating mode cards in favor of focused CTAs

  return (
    <>
      <header className="sticky top-0 z-20 header-glass">
        <div className="max-w-7xl mx-auto px-2 sm:px-6 lg:px-8 py-4 sm:py-6">
          <div className="flex items-center justify-between">
            {/* Left Button */}
            <div className="flex justify-start min-w-0 flex-1">
              <button 
                className="btn-secondary text-xs sm:text-sm px-2 py-1.5 sm:px-3 sm:py-2 whitespace-nowrap" 
                onClick={() => handleModeSelect('visitor')}
              >
                <span className="hidden sm:inline">AR Viewer</span>
                <span className="sm:hidden">Viewer</span>
              </button>
            </div>
            
            {/* Centered Logo */}
            <div className="flex items-center justify-center px-2 sm:px-6">
              <img 
                src="/general_header.svg" 
                alt="Climate Refuge AR" 
                className="h-14 sm:h-20 md:h-24 w-auto" 
                style={{ maxHeight: '70px' }}
              />
              <span className="sr-only">Climate Refuge AR</span>
            </div>
            
            {/* Right Button */}
            <div className="flex justify-end min-w-0 flex-1">
              <button 
                className="btn-primary text-xs sm:text-sm px-2 py-1.5 sm:px-3 sm:py-2 whitespace-nowrap" 
                onClick={() => handleModeSelect('creator')}
              >
                <span className="hidden sm:inline">Creator Studio</span>
                <span className="sm:hidden">Creator</span>
              </button>
            </div>
          </div>
        </div>
        </header>

      <main className="relative">
        {/* Fullscreen interactive Canvas background */}
        <div className="fixed inset-0 z-0 w-screen pointer-events-none" style={{ top: 0, height: '100svh' }}>
          <Canvas 
            className="!block w-full h-full"
            style={{ width: '100vw', height: '100svh', background: 'transparent' }}
            gl={{ alpha: true, antialias: true, powerPreference: 'high-performance' }}
            camera={{ position: [0, 1.2, 4.2], fov: 60 }}
          dpr={[1, 2]}
            onCreated={({ gl, scene }) => {
              gl.setClearAlpha(0);
              // Disable tone mapping to test color output without postprocessing influence
              // @ts-ignore
              gl.toneMapping = THREE.NoToneMapping;
              // @ts-ignore
              gl.toneMappingExposure = 1.0;
              // Ensure sRGB output for consistent color appearance
              // @ts-ignore
              gl.outputColorSpace = THREE.SRGBColorSpace;
              (scene as any).background = null;
            }}
          >
            <CameraRig sceneMode={sceneMode} cursor={cursor} progress={progress} />
            {/* Climate-responsive lighting system */}
            {(() => {
              // Calculate different lighting modes
              const climateProgress = sceneMode === 'structure' ? 
                THREE.MathUtils.clamp((progress.structure - 0.4) / 0.6, 0, 1) : 0;
              const disintegrationProgress = sceneMode === 'disintegrate' ? progress.disintegrate : 0;
              
              // Base lighting calculations
              let ambientIntensity = 0.4;
              let ambientColor = "#ffffff";
              let directionalIntensity = 1.8;
              let directionalColor = "#ffffff";
              
              if (sceneMode === 'structure') {
                // Climate change lighting
                ambientIntensity = 0.4 - (climateProgress * 0.2);
                ambientColor = "#" + new THREE.Color().setHSL(0.1, 0.1 + climateProgress * 0.3, 1.0 - climateProgress * 0.3).getHexString();
                directionalIntensity = 1.8 + (climateProgress * 0.8);
                directionalColor = "#" + new THREE.Color().setHSL(0.08 + climateProgress * 0.1, 0.2 + climateProgress * 0.5, 1.0 + climateProgress * 0.4).getHexString();
              } else if (sceneMode === 'disintegrate') {
                // Disintegration lighting - flickering and chaotic
                const time = performance.now() * 0.001;
                const flicker = Math.sin(time * 8.0 + disintegrationProgress * Math.PI * 16) * 0.3 * disintegrationProgress;
                const chaos = Math.sin(time * 12.0 + disintegrationProgress * Math.PI * 24) * 0.2 * disintegrationProgress;
                
                ambientIntensity = Math.max(0.1, 0.4 - (disintegrationProgress * 0.3) + flicker);
                ambientColor = "#" + new THREE.Color().setHSL(0.0, 0.0, Math.max(0.3, 1.0 - disintegrationProgress * 0.4 + chaos)).getHexString();
                directionalIntensity = Math.max(0.2, 1.8 - (disintegrationProgress * 1.0) + Math.abs(flicker) * 2);
                directionalColor = "#" + new THREE.Color().setHSL(0.0, 0.0, Math.max(0.4, 1.0 - disintegrationProgress * 0.3 + Math.abs(chaos))).getHexString();
              }
              
              return (
                <>
                  <ambientLight 
                    intensity={ambientIntensity}
                    color={ambientColor}
                  />
                  <directionalLight 
                    position={[0, 3, 4]} 
                    intensity={directionalIntensity}
                    color={directionalColor}
                  />
                  {/* Climate degradation lighting effects */}
                  {sceneMode === 'structure' && (
                    <>
                      {/* Harsh sun effect during climate change */}
                      <directionalLight 
                        position={[2, 4, 1]} 
                        intensity={0.6 + climateProgress * 1.2} 
                        color={new THREE.Color().setHSL(0.1 + climateProgress * 0.05, 0.3 + climateProgress * 0.4, 1.0 + climateProgress * 0.3)} 
                      />
                      {/* Heat distortion lighting */}
                      <directionalLight 
                        position={[-2, 3, 2]} 
                        intensity={0.4 + climateProgress * 0.8} 
                        color={new THREE.Color().setHSL(0.08, 0.4 + climateProgress * 0.3, 0.9 + climateProgress * 0.2)} 
                      />
                      {/* Atmospheric degradation - losing cool tones */}
                      <directionalLight 
                        position={[0, 1, -3]} 
                        intensity={0.6 - climateProgress * 0.4} 
                        color={new THREE.Color().setHSL(0.6 - climateProgress * 0.3, 0.2, 0.8 - climateProgress * 0.3)} 
                      />
                    </>
                  )}
                  {/* Disintegration lighting effects */}
                  {sceneMode === 'disintegrate' && (
                    <>
                      {(() => {
                        const time = performance.now() * 0.001;
                        const chaosIntensity1 = Math.sin(time * 6.0 + disintegrationProgress * Math.PI * 12) * 0.5 * disintegrationProgress;
                        const chaosIntensity2 = Math.cos(time * 9.0 + disintegrationProgress * Math.PI * 18) * 0.4 * disintegrationProgress;
                        const chaosIntensity3 = Math.sin(time * 4.0 + disintegrationProgress * Math.PI * 8) * 0.3 * disintegrationProgress;
                        
                        return (
                          <>
                            {/* Chaotic fragmenting lights */}
                            <directionalLight 
                              position={[3 + chaosIntensity1, 2, 1]} 
                              intensity={Math.max(0, 0.5 + chaosIntensity1)} 
                              color={new THREE.Color().setHSL(0.0, 0.0, Math.max(0.2, 0.8 + chaosIntensity1))} 
                            />
                            <directionalLight 
                              position={[-2 + chaosIntensity2, 4, -1]} 
                              intensity={Math.max(0, 0.4 + chaosIntensity2)} 
                              color={new THREE.Color().setHSL(0.0, 0.0, Math.max(0.2, 0.7 + chaosIntensity2))} 
                            />
                            <directionalLight 
                              position={[1, -1 + chaosIntensity3, 2]} 
                              intensity={Math.max(0, 0.3 + chaosIntensity3)} 
                              color={new THREE.Color().setHSL(0.0, 0.0, Math.max(0.2, 0.6 + chaosIntensity3))} 
                            />
                          </>
                        );
                      })()}
                    </>
                  )}
                </>
              );
            })()}

            {/* Climate Refugee HDR Environment - Beautiful landscape becomes uninhabitable and disintegrates */}
            <HDREnvironment sceneMode={sceneMode} progress={{ structure: progress.structure, wind: progress.wind, disintegrate: progress.disintegrate }} />
            {/* Persist the same hero brick across all non-footer scenes */}
            <group>
              <HeroBrickRig sceneMode={sceneMode} cursor={cursor} progress={{ structure: progress.structure, brick: progress.brick, wind: progress.wind, rain: progress.rain, disintegrate: progress.disintegrate }} heroMatrixRef={heroMatrixRef} />
            </group>
            {/* Unified GPU particle system across wind, rain, and disintegrate */}
            {(sceneMode === 'wind' || sceneMode === 'rain' || sceneMode === 'disintegrate') && (
              <DisintegrationParticlesGPU visible cursor={cursor} cursorVel={cursorVelRef.current} heroMatrixRef={heroMatrixRef} mode={sceneMode} />
            )}
            {/* Mild bloom hint via emissive on particles; full composer can be added later */}

            {/* Postprocessing moved to BloomComposer component below */}

            {/* No OrbitControls to keep camera locked; movement is via pointer-responsive groups */}
        </Canvas>
                    </div>

        {/* Invisible scroll trigger sections */}
        <div className="relative z-0 pointer-events-none">
          <div id="structure" ref={sectionRefs.structure} className="h-[180vh]" />
          <div id="brick" ref={sectionRefs.brick} className="h-screen" />
          <div id="wind" ref={sectionRefs.wind} className="h-screen" />
          <div id="rain" ref={sectionRefs.rain} className="h-screen" />
          <div id="disintegrate" ref={sectionRefs.disintegrate} className="h-[140vh]" />
        </div>

        {/* Bottom Drawer */}
        <BottomDrawer currentSection={sceneMode} />
      </main>

      <AnimatePresence>
        {isLoading && (
          <motion.div className="loading-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="loading-content">
              <div className="loading-spinner" />
              <p className="text-gray-900 text-lg font-medium mt-4">Initializing...</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

// Preload the student brick model for better performance
useGLTF.preload('/Octa2.glb'); 