import * as THREE from 'three';
import { globalUniforms } from './shaders/uniforms';
import { FOG_APPLY_GLSL, WATER_COLOR_GLSL } from './shaders/glsl';
import type { QualitySettings } from '../core/Quality';
import { SeededRandom } from '../utils/random';
import { terrainHeight } from './Terrain';

const COMMON_UNIFORMS = () => ({
  uTime: globalUniforms.uTime,
  uFogDensity: globalUniforms.uFogDensity,
  uSunDir: globalUniforms.uSunDir,
});

/**
 * 水的環境：背景水色球、海面（由下往上看）、光束、漂浮微粒、氣泡與燈光。
 * 依畫質設定建立，可以 dispose 後重建。
 */
export class OceanEnvironment {
  readonly group = new THREE.Group();
  private dome!: THREE.Mesh;
  private disposables: { dispose(): void }[] = [];
  private particleUniforms = { uBox: { value: 46 }, uCam: { value: new THREE.Vector3() }, uPixel: { value: 1 } };

  constructor(private readonly quality: QualitySettings) {
    this.group.name = 'OceanEnvironment';
    this.buildLights();
    this.buildDome();
    this.buildSurface();
    this.buildLightShafts();
    this.buildParticles();
    this.buildBubbles();
  }

  setPixelRatio(pr: number): void {
    this.particleUniforms.uPixel.value = pr;
  }

  update(camera: THREE.Camera): void {
    this.dome.position.copy(camera.position);
    this.particleUniforms.uCam.value.copy(camera.position);
  }

  private track<T extends { dispose(): void }>(o: T): T {
    this.disposables.push(o);
    return o;
  }

  private buildLights(): void {
    const hemi = new THREE.HemisphereLight(0xc4f0ff, 0x123a52, 1.1);
    this.group.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff4e2, 2.0);
    sun.position.copy(globalUniforms.uSunDir.value).multiplyScalar(100);
    this.group.add(sun);
    this.group.add(sun.target);
    const fill = new THREE.DirectionalLight(0x2a8fb0, 0.35);
    fill.position.set(-40, -10, 30);
    this.group.add(fill);
  }

  private buildDome(): void {
    const geo = this.track(new THREE.SphereGeometry(420, 48, 24));
    const mat = this.track(
      new THREE.ShaderMaterial({
        uniforms: COMMON_UNIFORMS(),
        vertexShader: /* glsl */ `
          varying vec3 vWorld;
          void main() {
            vec4 wp = modelMatrix * vec4(position, 1.0);
            vWorld = wp.xyz;
            gl_Position = projectionMatrix * viewMatrix * wp;
          }`,
        fragmentShader: /* glsl */ `
          uniform vec3 uSunDir;
          uniform float uTime;
          varying vec3 vWorld;
          ${WATER_COLOR_GLSL}
          void main() {
            vec3 dir = normalize(vWorld - cameraPosition);
            vec3 c = oceanWaterColor(dir, cameraPosition, uSunDir);
            // 遠方微微的水流明暗
            float n = sin(dir.x * 9.0 + uTime * 0.15) * sin(dir.z * 7.0 - uTime * 0.11) * sin(dir.y * 5.0);
            c *= 1.0 + n * 0.05;
            gl_FragColor = vec4(c, 1.0);
          }`,
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
      }),
    );
    this.dome = new THREE.Mesh(geo, mat);
    this.dome.renderOrder = -10;
    this.dome.frustumCulled = false;
    this.group.add(this.dome);
  }

  private buildSurface(): void {
    const geo = this.track(new THREE.PlaneGeometry(900, 900, 1, 1));
    geo.rotateX(Math.PI / 2); // 法線朝下
    const mat = this.track(
      new THREE.ShaderMaterial({
        uniforms: COMMON_UNIFORMS(),
        vertexShader: /* glsl */ `
          varying vec3 vWorld;
          void main() {
            vec4 wp = modelMatrix * vec4(position, 1.0);
            vWorld = wp.xyz;
            gl_Position = projectionMatrix * viewMatrix * wp;
          }`,
        fragmentShader: /* glsl */ `
          uniform float uTime;
          uniform float uFogDensity;
          uniform vec3 uSunDir;
          varying vec3 vWorld;
          ${WATER_COLOR_GLSL}
          ${FOG_APPLY_GLSL}
          float waves(vec2 p, float t) {
            float h = sin(p.x * 0.21 + t * 0.9) * 0.5 + sin(p.y * 0.17 - t * 0.7) * 0.5;
            h += sin((p.x + p.y) * 0.43 + t * 1.3) * 0.25 + sin((p.x - p.y) * 0.61 - t * 1.1) * 0.18;
            h += sin(p.x * 1.3 + sin(p.y * 0.8 + t) + t * 1.7) * 0.08;
            return h;
          }
          void main() {
            vec2 p = vWorld.xz;
            float t = uTime;
            float e = 0.35;
            vec2 grad = vec2(waves(p + vec2(e, 0.0), t) - waves(p - vec2(e, 0.0), t),
                             waves(p + vec2(0.0, e), t) - waves(p - vec2(0.0, e), t)) / (2.0 * e);
            vec3 n = normalize(vec3(-grad.x * 0.55, -1.0, -grad.y * 0.55));
            vec3 V = normalize(vWorld - cameraPosition);
            // Snell's window：抬頭看時，視線接近垂直可看到明亮的天空；斜看則是水面全反射
            float cosUp = clamp(V.y, 0.0, 1.0);
            float tilt = dot(n.xz, vec2(0.6, 0.4)) * 0.25;
            float window = smoothstep(0.58, 0.78, cosUp + tilt);
            vec3 sky = vec3(0.75, 1.05, 1.10) * (1.15 + 0.5 * pow(max(dot(V, uSunDir), 0.0), 40.0) * 4.0);
            vec3 reflected = oceanWaterColor(reflect(V, vec3(0.0, -1.0, 0.0)) * vec3(1.0, 1.0, 1.0), cameraPosition, uSunDir) * 1.4;
            float ripple = pow(abs(sin(waves(p * 1.7, t * 1.3) * 3.0)), 6.0);
            vec3 c = mix(reflected, sky, window);
            c += vec3(0.4, 0.75, 0.8) * ripple * (0.25 + window * 0.6);
            c += vec3(0.3, 0.6, 0.7) * pow(max(dot(V, uSunDir), 0.0), 6.0) * 1.2;
            c = applyUnderwaterFog(c, vWorld, cameraPosition, uFogDensity * 0.9, uSunDir);
            gl_FragColor = vec4(c, 1.0);
          }`,
        side: THREE.DoubleSide,
        depthWrite: false,
        fog: false,
      }),
    );
    const surface = new THREE.Mesh(geo, mat);
    surface.position.y = 0;
    surface.renderOrder = -9;
    this.group.add(surface);
  }

  /** 從海面斜射下來的光束（加法混色的錐形體，依視角做柔邊） */
  private buildLightShafts(): void {
    const rng = new SeededRandom(77);
    const count = this.quality.lightShafts;
    const sun = globalUniforms.uSunDir.value;
    const segs = this.quality.level === 'low' ? 10 : 20;
    const mat = this.track(
      new THREE.ShaderMaterial({
        uniforms: { ...COMMON_UNIFORMS(), uIntensity: { value: this.quality.level === 'low' ? 0.9 : this.quality.level === 'high' ? 0.78 : 1.0 } },
        vertexShader: /* glsl */ `
          attribute float aSeed;
          varying vec3 vWorld;
          varying vec3 vNormalW;
          varying float vAlong;
          varying float vSeed;
          void main() {
            vec4 wp = modelMatrix * vec4(position, 1.0);
            vWorld = wp.xyz;
            vNormalW = normalize(mat3(modelMatrix) * normal);
            vAlong = uv.y;
            vSeed = aSeed;
            gl_Position = projectionMatrix * viewMatrix * wp;
          }`,
        fragmentShader: /* glsl */ `
          uniform float uTime;
          uniform float uIntensity;
          uniform float uFogDensity;
          varying vec3 vWorld;
          varying vec3 vNormalW;
          varying float vAlong;
          varying float vSeed;
          void main() {
            vec3 toCam = cameraPosition - vWorld;
            float d = length(toCam);
            vec3 V = toCam / d;
            float facing = abs(dot(normalize(vNormalW), V));
            float soft = pow(facing, 2.2);
            float topFade = smoothstep(0.0, 0.85, vAlong) * smoothstep(1.0, 0.94, vAlong);
            float flicker = 0.55 + 0.45 * sin(uTime * (0.35 + vSeed * 0.3) + vSeed * 40.0 + vWorld.y * 0.04);
            float near = smoothstep(1.5, 9.0, d);
            float far = exp(-d * uFogDensity * 0.9);
            float a = soft * topFade * flicker * near * far * uIntensity * 0.22;
            gl_FragColor = vec4(vec3(0.62, 0.92, 0.95) * a, 1.0);
          }`,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        fog: false,
      }),
    );

    const geos: THREE.BufferGeometry[] = [];
    const tilt = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), sun.clone());
    for (let i = 0; i < count; i++) {
      // 前方（-Z）與起點附近較密集，確保開場就看得到光束
      const ang = rng.range(0, Math.PI * 2);
      const rad = i < count * 0.55 ? rng.range(4, 45) : rng.range(20, 95);
      let x = Math.cos(ang) * rad;
      let z = Math.sin(ang) * rad;
      if (i < count * 0.35) {
        x = rng.range(-28, 30);
        z = rng.range(-40, 18);
      }
      const len = rng.range(34, 52);
      const r = rng.range(0.9, i % 4 === 0 ? 5.5 : 3.2);
      const g = new THREE.CylinderGeometry(r * 0.75, r * 1.9, len, segs, 1, true);
      g.translate(0, -len / 2, 0);
      g.applyQuaternion(tilt);
      g.translate(x + sun.x * 4, -0.2, z + sun.z * 4);
      const seed = new Float32Array(g.attributes.position.count).fill(rng.next());
      g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
      geos.push(g);
    }
    const merged = mergeSimple(geos);
    geos.forEach((g) => g.dispose());
    this.track(merged);
    const mesh = new THREE.Mesh(merged, mat);
    mesh.renderOrder = 5;
    mesh.frustumCulled = false;
    this.group.add(mesh);
  }

  /** 漂浮微粒（海雪）：跟隨攝影機的無限循環粒子場 */
  private buildParticles(): void {
    const n = this.quality.particleCount;
    const rng = new SeededRandom(5);
    const pos = new Float32Array(n * 3);
    const seed = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = rng.next();
      pos[i * 3 + 1] = rng.next();
      pos[i * 3 + 2] = rng.next();
      seed[i] = rng.next();
    }
    const geo = this.track(new THREE.BufferGeometry());
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    const mat = this.track(
      new THREE.ShaderMaterial({
        uniforms: { ...COMMON_UNIFORMS(), ...this.particleUniforms },
        vertexShader: /* glsl */ `
          uniform float uTime;
          uniform float uBox;
          uniform vec3 uCam;
          uniform float uPixel;
          attribute float aSeed;
          varying float vAlpha;
          varying float vGold;
          void main() {
            vec3 drift = vec3(sin(uTime * 0.05 + aSeed * 30.0) * 0.6, -0.12 - aSeed * 0.1, 0.18) * uTime;
            vec3 p = position * uBox + drift;
            vec3 rel = mod(p - uCam + uBox * 0.5, uBox) - uBox * 0.5;
            vec3 wp = uCam + rel;
            wp.x += sin(uTime * 0.7 + aSeed * 20.0) * 0.15;
            wp.y = min(wp.y, -0.6);
            vec4 mv = viewMatrix * vec4(wp, 1.0);
            float d = -mv.z;
            float size = mix(0.035, 0.09, fract(aSeed * 13.7));
            gl_PointSize = clamp(size * 900.0 * uPixel / max(d, 0.5), 1.0, 14.0 * uPixel);
            float edge = 1.0 - smoothstep(uBox * 0.32, uBox * 0.5, length(rel));
            vAlpha = edge * smoothstep(0.4, 2.0, d) * (0.45 + 0.55 * sin(uTime * 1.5 + aSeed * 50.0) * 0.5 + 0.25);
            vGold = step(0.86, fract(aSeed * 91.3));
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: /* glsl */ `
          varying float vAlpha;
          varying float vGold;
          void main() {
            vec2 c = gl_PointCoord - 0.5;
            float r = length(c);
            float a = smoothstep(0.5, 0.0, r);
            vec3 col = mix(vec3(0.70, 0.95, 1.0), vec3(1.0, 0.86, 0.45), vGold);
            gl_FragColor = vec4(col * a * vAlpha * 0.9, 1.0);
          }`,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: false,
      }),
    );
    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    points.renderOrder = 6;
    this.group.add(points);
  }

  /** 從海底緩緩上升的氣泡 */
  private buildBubbles(): void {
    const n = this.quality.bubbleCount;
    const rng = new SeededRandom(91);
    const vents: THREE.Vector3[] = [];
    const ventSpots = [
      [-6, -12], [10, -26], [-20, -2], [18, 10], [-30, -40], [4, 4], [26, -50], [-12, 18], [34, -14], [-40, 10],
    ];
    for (const [x, z] of ventSpots) vents.push(new THREE.Vector3(x, terrainHeight(x, z), z));
    const pos = new Float32Array(n * 3);
    const data = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const v = vents[i % vents.length];
      pos[i * 3] = v.x + rng.gauss() * 0.4;
      pos[i * 3 + 1] = v.y;
      pos[i * 3 + 2] = v.z + rng.gauss() * 0.4;
      data[i * 3] = rng.range(0.9, 2.2); // 上升速度
      data[i * 3 + 1] = rng.next(); // 相位
      data[i * 3 + 2] = rng.range(0.05, 0.16); // 大小
    }
    const geo = this.track(new THREE.BufferGeometry());
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aData', new THREE.BufferAttribute(data, 3));
    const mat = this.track(
      new THREE.ShaderMaterial({
        uniforms: { ...COMMON_UNIFORMS(), uPixel: this.particleUniforms.uPixel },
        vertexShader: /* glsl */ `
          uniform float uTime;
          uniform float uPixel;
          attribute vec3 aData;
          varying float vAlpha;
          void main() {
            float travel = -position.y - 0.5;
            float t = fract(uTime * aData.x / travel + aData.y);
            vec3 wp = position;
            wp.y = position.y + t * travel;
            wp.x += sin(uTime * 3.0 + aData.y * 40.0) * 0.12 * t + sin(t * 9.0) * 0.3 * t;
            wp.z += cos(uTime * 2.6 + aData.y * 30.0) * 0.12 * t;
            vec4 mv = viewMatrix * vec4(wp, 1.0);
            float size = aData.z * (1.0 + t * 0.9);
            gl_PointSize = clamp(size * 900.0 * uPixel / max(-mv.z, 0.5), 1.0, 40.0 * uPixel);
            vAlpha = smoothstep(0.0, 0.05, t) * smoothstep(1.0, 0.9, t) * exp(-(-mv.z) * 0.02);
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: /* glsl */ `
          varying float vAlpha;
          void main() {
            vec2 c = gl_PointCoord - 0.5;
            float r = length(c);
            if (r > 0.5) discard;
            float rim = smoothstep(0.30, 0.47, r) * smoothstep(0.5, 0.46, r);
            float hi = smoothstep(0.16, 0.0, length(c - vec2(-0.15, -0.15)));
            float a = (rim * 0.85 + hi * 0.9 + 0.06) * vAlpha;
            gl_FragColor = vec4(vec3(0.78, 0.96, 1.0) * a, 1.0);
          }`,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: false,
      }),
    );
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    pts.renderOrder = 7;
    this.group.add(pts);
  }

  dispose(): void {
    this.group.removeFromParent();
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
  }
}

/** 合併同屬性結構的幾何（只需 position / normal / uv / aSeed） */
export function mergeSimple(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const nonIndexed = geos.map((g) => (g.index ? g.toNonIndexed() : g));
  const names = Object.keys(nonIndexed[0].attributes);
  const out = new THREE.BufferGeometry();
  for (const name of names) {
    const itemSize = nonIndexed[0].attributes[name].itemSize;
    let total = 0;
    for (const g of nonIndexed) total += g.attributes[name].count * itemSize;
    const arr = new Float32Array(total);
    let off = 0;
    for (const g of nonIndexed) {
      const a = g.attributes[name].array as Float32Array;
      arr.set(a, off);
      off += a.length;
    }
    out.setAttribute(name, new THREE.BufferAttribute(arr, itemSize));
  }
  nonIndexed.forEach((g, i) => {
    if (g !== geos[i]) g.dispose();
  });
  return out;
}
