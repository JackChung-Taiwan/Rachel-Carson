import * as THREE from 'three';
import { globalUniforms } from './uniforms';
import { CAUSTIC_GLSL } from './glsl';

export interface PatchOptions {
  /** 在海底表面加上流動光紋 */
  caustics?: boolean;
  causticLayers?: number;
  /** 隨水流搖擺（海帶、海草）：swayHeight 為植物高度，swayAmp 為擺幅 */
  sway?: { height: number; amp: number };
  /** 背光透光（海帶葉片） */
  translucency?: THREE.ColorRepresentation;
  /** 沙紋 */
  sandRipples?: boolean;
  /** 魚尾擺動，需要 instanced 屬性 aPhase */
  fishWiggle?: { amp: number; speed: number };
  /** 自體微光（讓珊瑚顏色在藍色水中仍然鮮豔） */
  glow?: number;
  /** 魟魚翅膀拍動 */
  wingFlap?: { amp: number; speed: number };
}

/**
 * 為 Three.js 內建 MeshStandardMaterial 注入海洋特效（onBeforeCompile）。
 * 保留內建的光照、霧化流程，只在必要位置插入程式碼。
 */
export function patchMaterial<T extends THREE.MeshStandardMaterial>(material: T, opts: PatchOptions): T {
  const layers = opts.causticLayers ?? 2;
  const key = JSON.stringify(opts);
  const translucency = opts.translucency ? new THREE.Color(opts.translucency) : null;

  material.customProgramCacheKey = () => key;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = globalUniforms.uTime;
    shader.uniforms.uCausticStrength = globalUniforms.uCausticStrength;
    shader.uniforms.uSunDir = globalUniforms.uSunDir;
    if (translucency) shader.uniforms.uTranslucency = { value: translucency };

    let vHead = 'uniform float uTime;\nvarying vec3 vOceanWorld;\nvarying vec3 vOceanNormal;\nvarying float vOceanHeight;\n';
    let begin = 'vec3 transformed = vec3( position );\nvOceanHeight = position.y;\n';

    if (opts.sway) {
      begin += `
      {
        #ifdef USE_INSTANCING
          vec2 ip = instanceMatrix[3].xz;
        #else
          vec2 ip = vec2(0.0);
        #endif
        float hN = clamp(position.y / ${opts.sway.height.toFixed(2)}, 0.0, 1.0);
        float w = pow(hN, 1.5) * ${opts.sway.amp.toFixed(3)};
        float ph = ip.x * 0.11 + ip.y * 0.17;
        transformed.x += (sin(uTime * 0.62 + ph + position.y * 0.11) * 0.85 + sin(uTime * 1.37 + ph * 1.9 + position.y * 0.33) * 0.22) * w;
        transformed.z += (cos(uTime * 0.48 + ph * 1.3 + position.y * 0.09) * 0.6) * w;
      }
      `;
    }
    if (opts.fishWiggle) {
      vHead += 'attribute float aPhase;\n';
      begin += `
      {
        float tail = smoothstep(0.15, -0.55, position.z);
        float wave = sin(uTime * ${opts.fishWiggle.speed.toFixed(2)} * (0.8 + fract(aPhase * 7.13) * 0.5) + aPhase * 6.2831 - position.z * 5.0);
        transformed.x += wave * (0.025 + tail * ${opts.fishWiggle.amp.toFixed(3)});
      }
      `;
    }
    if (opts.wingFlap) {
      begin += `
      {
        float span = abs(position.x);
        transformed.y += sin(uTime * ${opts.wingFlap.speed.toFixed(2)} - span * 0.9) * span * span * ${opts.wingFlap.amp.toFixed(3)};
      }
      `;
    }

    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + vHead)
      .replace('#include <begin_vertex>', begin)
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        vOceanWorld = transpose(mat3(viewMatrix)) * (mvPosition.xyz - viewMatrix[3].xyz);
        vOceanNormal = transpose(mat3(viewMatrix)) * normalize(transformedNormal);`,
      );

    let fHead = 'uniform float uTime;\nuniform float uCausticStrength;\nuniform vec3 uSunDir;\nvarying vec3 vOceanWorld;\nvarying vec3 vOceanNormal;\nvarying float vOceanHeight;\n';
    if (translucency) fHead += 'uniform vec3 uTranslucency;\n';
    if (opts.caustics) fHead += CAUSTIC_GLSL;

    let colorMod = '';
    if (opts.sandRipples) {
      colorMod += `
      {
        vec2 q = vOceanWorld.xz;
        float r = sin(q.x * 1.9 + sin(q.y * 0.45) * 2.2 + sin(q.x * 0.21 + q.y * 0.33) * 3.0);
        float r2 = sin(q.y * 2.6 + q.x * 0.7 + sin(q.x * 0.6) * 1.5);
        float rip = (r * 0.6 + r2 * 0.4) * smoothstep(0.6, 0.95, normalize(vOceanNormal).y);
        diffuseColor.rgb *= 0.92 + rip * 0.09;
      }
      `;
    }

    let lightMod = '';
    if (opts.caustics) {
      lightMod += `
      {
        float up = clamp(normalize(vOceanNormal).y, 0.0, 1.0);
        float depthK = smoothstep(-45.0, -6.0, vOceanWorld.y);
        float c = causticPattern(vOceanWorld.xz, uTime * 0.8, ${layers.toFixed(1)});
        outgoingLight += diffuseColor.rgb * vec3(0.8, 1.0, 1.0) * c * uCausticStrength * (0.25 + 0.75 * up) * depthK * 1.25;
      }
      `;
    }
    if (opts.glow) {
      lightMod += `outgoingLight += diffuseColor.rgb * ${opts.glow.toFixed(3)};\n`;
    }
    if (translucency) {
      lightMod += `
      {
        vec3 V = normalize(vOceanWorld - cameraPosition);
        float back = pow(max(dot(V, uSunDir), 0.0), 2.0);
        float hk = smoothstep(-26.0, -4.0, vOceanWorld.y);
        outgoingLight += uTranslucency * diffuseColor.rgb * (0.35 + back * 1.6) * hk;
      }
      `;
    }

    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + fHead)
      .replace('#include <color_fragment>', '#include <color_fragment>\n' + colorMod)
      .replace('#include <opaque_fragment>', lightMod + '\n#include <opaque_fragment>');
  };
  material.needsUpdate = true;
  return material;
}
