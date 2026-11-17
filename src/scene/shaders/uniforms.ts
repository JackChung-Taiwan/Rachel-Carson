import * as THREE from 'three';

/** 所有海洋材質共用的全域 uniforms（時間、霧、光紋強度）。 */
export const globalUniforms = {
  uTime: { value: 0 },
  uFogDensity: { value: 0.021 },
  uCausticStrength: { value: 1.0 },
  uSunDir: { value: new THREE.Vector3(0.28, 1.0, -0.42).normalize() },
};
