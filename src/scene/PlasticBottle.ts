import * as THREE from 'three';
import { WORLD } from '../data/worldLayout';
import { terrainHeight } from './Terrain';
import { globalUniforms } from './shaders/uniforms';

/**
 * 海底的塑膠瓶（任務 2 目標）：半透明瓶身、紅白標籤、藍色瓶蓋，旁邊有柔和的提示光圈。
 */
export class PlasticBottle {
  readonly group = new THREE.Group();
  readonly hitCenter = new THREE.Vector3();
  readonly hitRadius = 1.8;
  private bottle = new THREE.Group();
  private ring: THREE.Mesh;
  private disposables: { dispose(): void }[] = [];
  private removing = 0;
  private _cleaned = false;

  constructor() {
    this.group.name = 'PlasticBottle';
    const L = 1.0; // 為了讓學生容易辨識，尺寸略為放大
    const profile: THREE.Vector2[] = [
      [0.0, 0], [0.17, 0.0], [0.2, 0.03], [0.2, 0.08], [0.185, 0.12], [0.2, 0.16], [0.2, 0.55],
      [0.19, 0.6], [0.15, 0.7], [0.09, 0.8], [0.07, 0.86], [0.07, 0.9],
    ].map(([r, y]) => new THREE.Vector2(r * L, y * L));
    const bodyGeo = new THREE.LatheGeometry(profile, 32);
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0xbfeaff,
      roughness: 0.12,
      metalness: 0.0,
      transparent: true,
      opacity: 0.62,
      emissive: 0x2a6f88,
      emissiveIntensity: 0.25,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.renderOrder = 2;
    const labelGeo = new THREE.CylinderGeometry(0.205 * L, 0.205 * L, 0.24 * L, 32, 1, true);
    labelGeo.translate(0, 0.36 * L, 0);
    const labelMat = new THREE.MeshStandardMaterial({ color: 0xe8423f, roughness: 0.5, side: THREE.DoubleSide });
    const label = new THREE.Mesh(labelGeo, labelMat);
    const stripeGeo = new THREE.CylinderGeometry(0.207 * L, 0.207 * L, 0.05 * L, 32, 1, true);
    stripeGeo.translate(0, 0.36 * L, 0);
    const stripeMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5, side: THREE.DoubleSide });
    const stripe = new THREE.Mesh(stripeGeo, stripeMat);
    const capGeo = new THREE.CylinderGeometry(0.085 * L, 0.085 * L, 0.09 * L, 20);
    capGeo.translate(0, 0.94 * L, 0);
    const capMat = new THREE.MeshStandardMaterial({ color: 0x1f6fe0, roughness: 0.4 });
    const cap = new THREE.Mesh(capGeo, capMat);
    this.bottle.add(body, label, stripe, cap);
    // 平躺在沙地上、稍微埋入
    this.bottle.rotation.set(Math.PI / 2 - 0.12, 0, 0.1);
    this.bottle.position.y = 0.17;

    // 提示光圈（加法混色、緩慢脈動）
    const ringGeo = new THREE.RingGeometry(0.9, 1.6, 48);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.ShaderMaterial({
      uniforms: { uTime: globalUniforms.uTime },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform float uTime; varying vec2 vUv;
        void main(){
          float r = length(vUv - 0.5) * 2.0;
          float band = smoothstep(0.55, 0.75, r) * smoothstep(1.0, 0.8, r);
          float pulse = 0.55 + 0.45 * sin(uTime * 2.2);
          gl_FragColor = vec4(vec3(0.45, 0.95, 1.0) * band * pulse * 0.55, 1.0);
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.ring = new THREE.Mesh(ringGeo, ringMat);
    this.ring.position.y = 0.06;
    this.group.add(this.bottle, this.ring);

    const { x, z, rotY } = WORLD.bottle;
    this.group.position.set(x, terrainHeight(x, z), z);
    this.group.rotation.y = rotY;
    this.hitCenter.copy(this.group.position).setY(this.group.position.y + 0.4);
    this.disposables.push(bodyGeo, bodyMat, labelGeo, labelMat, stripeGeo, stripeMat, capGeo, capMat, ringGeo, ringMat);
  }

  get cleaned(): boolean {
    return this._cleaned;
  }

  /** 開始清理動畫：瓶子縮小、上浮並消失 */
  clean(): void {
    if (this._cleaned) return;
    this._cleaned = true;
    this.removing = 0.0001;
    this.ring.visible = false;
  }

  reset(): void {
    this._cleaned = false;
    this.removing = 0;
    this.group.visible = true;
    this.ring.visible = true;
    this.bottle.scale.setScalar(1);
    this.bottle.position.y = 0.17;
  }

  update(time: number, dt: number): void {
    if (this.removing > 0) {
      this.removing += dt;
      const t = Math.min(this.removing / 0.8, 1);
      const s = 1 - t * t;
      this.bottle.scale.setScalar(Math.max(s, 0.001));
      this.bottle.position.y = 0.17 + t * 1.2;
      if (t >= 1) {
        this.group.visible = false;
        this.removing = 0;
      }
    } else if (!this._cleaned) {
      this.bottle.position.y = 0.17 + Math.sin(time * 0.9) * 0.015;
    }
  }

  dispose(): void {
    this.group.removeFromParent();
    this.disposables.forEach((d) => d.dispose());
  }
}
