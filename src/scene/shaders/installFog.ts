import * as THREE from 'three';
import { FOG_APPLY_GLSL, WATER_COLOR_GLSL } from './glsl';
import { globalUniforms } from './uniforms';

let installed = false;

/**
 * 以自訂的水下霧化取代 Three.js 內建霧化：
 * 霧的顏色會依視線方向變化（往上看偏亮青、往下看偏深藍），與背景水色完全一致。
 */
export function installUnderwaterFog(): void {
  if (installed) return;
  installed = true;
  const s = globalUniforms.uSunDir.value;
  const sun = `vec3(${s.x.toFixed(4)}, ${s.y.toFixed(4)}, ${s.z.toFixed(4)})`;

  THREE.ShaderChunk.fog_pars_vertex = /* glsl */ `
#ifdef USE_FOG
  varying float vFogDepth;
  varying vec3 vFogWorldPos;
#endif
`;
  THREE.ShaderChunk.fog_vertex = /* glsl */ `
#ifdef USE_FOG
  vFogDepth = - mvPosition.z;
  vFogWorldPos = transpose(mat3(viewMatrix)) * (mvPosition.xyz - viewMatrix[3].xyz);
#endif
`;
  THREE.ShaderChunk.fog_pars_fragment = /* glsl */ `
#ifdef USE_FOG
  uniform vec3 fogColor;
  varying float vFogDepth;
  varying vec3 vFogWorldPos;
  #ifdef FOG_EXP2
    uniform float fogDensity;
  #else
    uniform float fogNear;
    uniform float fogFar;
  #endif
  ${WATER_COLOR_GLSL}
  ${FOG_APPLY_GLSL}
#endif
`;
  THREE.ShaderChunk.fog_fragment = /* glsl */ `
#ifdef USE_FOG
  #ifdef FOG_EXP2
    float oceanDensity = fogDensity;
  #else
    float oceanDensity = 1.5 / max(fogFar, 1.0);
  #endif
  gl_FragColor.rgb = applyUnderwaterFog(gl_FragColor.rgb, vFogWorldPos, cameraPosition, oceanDensity, ${sun});
#endif
`;
}
