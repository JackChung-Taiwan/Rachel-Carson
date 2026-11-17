import * as THREE from 'three';

/**
 * 清理完成特效：向外擴散的光環 + 圓形閃光粒子 + 上升氣泡（GPU 計算位置）。
 */
export class CleanupEffect {
  readonly group = new THREE.Group();
  private ring: THREE.Mesh;
  private ringMat: THREE.MeshBasicMaterial;
  private points: THREE.Points;
  private pointMat: THREE.ShaderMaterial;
  private t = -1;

  constructor() {
    const ringGeo = new THREE.TorusGeometry(1, 0.045, 8, 72);
    ringGeo.rotateX(Math.PI / 2);
    this.ringMat = new THREE.MeshBasicMaterial({
      color: 0x8ff6ff,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    });
    this.ring = new THREE.Mesh(ringGeo, this.ringMat);

    const n = 160;
    const vel = new Float32Array(n * 3);
    const seed = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const up = Math.random();
      const sp = 1.0 + Math.random() * 2.4;
      vel.set([Math.cos(a) * sp * (1 - up * 0.6), 0.8 + up * 3.2, Math.sin(a) * sp * (1 - up * 0.6)], i * 3);
      seed[i] = Math.random();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    geo.setAttribute('aVel', new THREE.BufferAttribute(vel, 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    this.pointMat = new THREE.ShaderMaterial({
      uniforms: { uT: { value: 0 }, uFade: { value: 0 } },
      vertexShader: /* glsl */ `
        uniform float uT;
        attribute vec3 aVel;
        attribute float aSeed;
        varying float vBubble;
        void main() {
          float drag = (1.0 - exp(-uT * 1.6)) / 1.6;
          vec3 p = aVel * drag + vec3(0.0, uT * 0.5 * aSeed, 0.0);
          p.x += sin(uT * 4.0 + aSeed * 30.0) * 0.08;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          vBubble = step(0.6, aSeed);
          float size = mix(0.07, 0.14, aSeed);
          gl_PointSize = clamp(size * 900.0 / -mv.z, 1.0, 48.0);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uFade;
        varying float vBubble;
        void main() {
          vec2 c = gl_PointCoord - 0.5;
          float r = length(c);
          if (r > 0.5) discard;
          float spark = smoothstep(0.5, 0.0, r);
          spark = spark * spark;
          float ring = smoothstep(0.32, 0.45, r) * smoothstep(0.5, 0.45, r);
          float a = mix(spark, ring + smoothstep(0.15, 0.0, length(c + 0.15)) * 0.8, vBubble);
          vec3 col = mix(vec3(0.75, 1.0, 0.95), vec3(0.8, 0.95, 1.0), vBubble);
          gl_FragColor = vec4(col * a * uFade, 1.0);
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(geo, this.pointMat);
    this.points.frustumCulled = false;
    this.group.add(this.ring, this.points);
    this.group.visible = false;
  }

  play(at: THREE.Vector3): void {
    this.group.position.copy(at);
    this.t = 0;
    this.group.visible = true;
  }

  get active(): boolean {
    return this.t >= 0;
  }

  update(dt: number): void {
    if (this.t < 0) return;
    this.t += dt;
    const t = this.t;
    const dur = 2.8;
    if (t > dur) {
      this.t = -1;
      this.group.visible = false;
      return;
    }
    const k = t / dur;
    this.ring.scale.setScalar(0.5 + Math.sqrt(k) * 5.5);
    this.ringMat.opacity = (1 - k) * 0.9;
    this.ring.position.y = 0.1 + k * 0.4;
    this.pointMat.uniforms.uT.value = t;
    this.pointMat.uniforms.uFade.value = Math.min(1, t * 6) * (1 - k) * 0.9;
  }

  dispose(): void {
    this.ring.geometry.dispose();
    this.ringMat.dispose();
    this.points.geometry.dispose();
    this.pointMat.dispose();
  }
}
