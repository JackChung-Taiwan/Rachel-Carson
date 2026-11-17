import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { fbm2, fbm3, noise2, smoothstep } from '../utils/noise';
import { SeededRandom } from '../utils/random';
import { patchMaterial } from './shaders/patchMaterial';
import { WORLD, inClearZone } from '../data/worldLayout';

export interface SphereCollider {
  center: THREE.Vector3;
  radius: number;
}

/** 海底高度函式（地形網格與碰撞共用，確保一致）。 */
export function terrainHeight(x: number, z: number): number {
  const r = Math.hypot(x, z);
  let h = -23.5;
  h += fbm2(x * 0.021, z * 0.021, 4) * 3.4;
  h += fbm2(x * 0.075 + 40, z * 0.075 - 13, 2) * 0.7;
  // 拱門下方稍微隆起的礁台
  const ax = x - WORLD.arch.x, az = z - WORLD.arch.z;
  h += Math.exp(-(ax * ax + az * az) / 140) * 1.6;
  // 外圍逐漸升高成峭壁，自然形成邊界
  const edge = smoothstep(58, 120, r);
  h += edge * edge * 34 + edge * fbm2(x * 0.05, z * 0.05, 3) * 9;
  return h;
}

function rockGeometry(seed: number, detail: number): THREE.BufferGeometry {
  let g: THREE.BufferGeometry = new THREE.IcosahedronGeometry(1, detail);
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  g = mergeVertices(g);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const n = fbm3(v.x * 1.25 + seed * 7.1, v.y * 1.25 + seed, v.z * 1.25 - seed * 3.3, 4);
    const ridges = Math.abs(fbm3(v.x * 2.6 - seed, v.y * 2.6, v.z * 2.6 + seed * 2, 3));
    const fine = fbm3(v.x * 7 + seed, v.y * 7, v.z * 7, 2);
    // 層狀岩理
    const strata = Math.sin(v.y * 9 + fbm3(v.x * 2, v.y, v.z * 2, 2) * 3) * 0.025;
    v.multiplyScalar(1 + n * 0.45 - ridges * 0.16 + fine * 0.05 + strata);
    v.y *= 0.72;
    if (v.y < -0.25) v.y = -0.25 + (v.y + 0.25) * 0.35;
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  const nrm = g.attributes.normal as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  const rockA = new THREE.Color(0.52, 0.48, 0.43);
  const rockB = new THREE.Color(0.34, 0.34, 0.35);
  const moss = new THREE.Color(0.30, 0.50, 0.30);
  const pinkAlgae = new THREE.Color(0.78, 0.42, 0.50);
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const up = nrm.getY(i);
    c.copy(rockA).lerp(rockB, fbm3(v.x * 3 + seed, v.y * 3, v.z * 3, 2) * 0.5 + 0.5);
    c.lerp(moss, smoothstep(0.35, 0.85, up) * 0.85);
    const spots = fbm3(v.x * 4.2 - seed, v.y * 4.2, v.z * 4.2 + 9, 2);
    c.lerp(pinkAlgae, smoothstep(0.22, 0.4, spots) * 0.7);
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return g;
}

/**
 * 海底地形：起伏沙地、岩石、外圍峭壁與岩石拱門，並產生碰撞體。
 */
export class SeabedTerrain {
  readonly group = new THREE.Group();
  readonly colliders: SphereCollider[] = [];
  private disposables: { dispose(): void }[] = [];

  constructor(causticLayers: number, lowDetail: boolean) {
    this.group.name = 'SeabedTerrain';
    this.buildGround(causticLayers, lowDetail);
    this.buildRocks(causticLayers, lowDetail);
    this.buildArch(causticLayers);
  }

  private buildGround(causticLayers: number, lowDetail: boolean): void {
    const size = 320;
    const segs = lowDetail ? 170 : 260;
    const g = new THREE.PlaneGeometry(size, size, segs, segs);
    g.rotateX(-Math.PI / 2);
    const pos = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      pos.setY(i, terrainHeight(x, z));
    }
    g.computeVertexNormals();
    const nrm = g.attributes.normal as THREE.BufferAttribute;
    const colors = new Float32Array(pos.count * 3);
    const sandLight = new THREE.Color(0.70, 0.62, 0.47);
    const sandDark = new THREE.Color(0.47, 0.43, 0.35);
    const algae = new THREE.Color(0.30, 0.42, 0.28);
    const rock = new THREE.Color(0.30, 0.31, 0.32);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const n = fbm2(x * 0.05 + 3, z * 0.05 - 7, 3);
      c.copy(sandLight).lerp(sandDark, smoothstep(-0.3, 0.5, n) * 0.6 + noise2(x * 0.4, z * 0.4) * 0.08);
      c.lerp(algae, smoothstep(0.25, 0.55, fbm2(x * 0.03 - 11, z * 0.03 + 5, 3)) * 0.55);
      const slope = 1 - nrm.getY(i);
      c.lerp(rock, smoothstep(0.08, 0.3, slope));
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const mat = patchMaterial(
      new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 }),
      { caustics: true, causticLayers, sandRipples: true },
    );
    const mesh = new THREE.Mesh(g, mat);
    mesh.name = 'ground';
    this.group.add(mesh);
    this.disposables.push(g, mat);
  }

  private buildRocks(causticLayers: number, lowDetail: boolean): void {
    const rng = new SeededRandom(2024);
    const variants = 5;
    const detail = lowDetail ? 3 : 4;
    const geos = Array.from({ length: variants }, (_, i) => rockGeometry(i * 1.37 + 0.5, detail));
    const mat = patchMaterial(
      new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0, flatShading: true }),
      { caustics: true, causticLayers },
    );
    this.disposables.push(mat, ...geos);

    type R = { x: number; z: number; s: number; sy: number; rot: number; sink: number };
    const placements: R[][] = Array.from({ length: variants }, () => []);
    const add = (x: number, z: number, s: number, sy = 1, sink = 0.25) => {
      placements[rng.int(0, variants - 1)].push({ x, z, s, sy, rot: rng.range(0, Math.PI * 2), sink });
    };

    // 散布在沙地上的岩石（大小混合）
    let tries = 0;
    let placed = 0;
    while (placed < 95 && tries < 2000) {
      tries++;
      const x = rng.range(-75, 75), z = rng.range(-75, 75);
      if (Math.hypot(x, z) > 80 || inClearZone(x, z, 2)) continue;
      const big = rng.next() < 0.18;
      add(x, z, big ? rng.range(2.4, 4.6) : rng.range(0.5, 1.7), rng.range(0.7, 1.2));
      placed++;
      // 小石頭群
      if (rng.next() < 0.5) {
        for (let k = 0; k < 3; k++) {
          const px = x + rng.gauss() * 2, pz = z + rng.gauss() * 2;
          if (!inClearZone(px, pz, 1)) add(px, pz, rng.range(0.25, 0.7));
        }
      }
    }
    // 外圍的大型岩壁
    for (let i = 0; i < 70; i++) {
      const a = (i / 70) * Math.PI * 2 + rng.range(-0.04, 0.04);
      const r = rng.range(78, 112);
      add(Math.cos(a) * r, Math.sin(a) * r, rng.range(7, 15), rng.range(0.9, 1.7), 0.35);
    }
    // 起點附近的特色礁岩（開場即可看見）
    add(-9, 6, 3.6, 1.2);
    add(9.5, -4, 2.8, 1.1);
    add(-26, 18, 4.5, 1.3);
    add(22, -6, 3.2, 1.0);
    add(20, 9, 1.4, 0.9);
    add(13, 9.5, 0.9, 0.9);

    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const sc = new THREE.Vector3();
    const p = new THREE.Vector3();
    placements.forEach((list, vi) => {
      if (!list.length) return;
      const inst = new THREE.InstancedMesh(geos[vi], mat, list.length);
      list.forEach((r, i) => {
        const y = terrainHeight(r.x, r.z) - r.s * r.sy * r.sink;
        e.set(rng.range(-0.15, 0.15), r.rot, rng.range(-0.15, 0.15));
        q.setFromEuler(e);
        sc.set(r.s * rng.range(0.85, 1.25), r.s * r.sy, r.s * rng.range(0.85, 1.25));
        p.set(r.x, y, r.z);
        m.compose(p, q, sc);
        inst.setMatrixAt(i, m);
        if (r.s >= 1.2) {
          this.colliders.push({
            center: new THREE.Vector3(r.x, y + r.s * r.sy * 0.15, r.z),
            radius: r.s * Math.min(sc.x, sc.z) / r.s * 0.82,
          });
        }
      });
      inst.instanceMatrix.needsUpdate = true;
      inst.computeBoundingSphere();
      this.group.add(inst);
    });
  }

  /** 岩石拱門：沿著不規則拱形曲線的管狀岩石，再以雜訊雕刻表面。 */
  private buildArch(causticLayers: number): void {
    const { x, z, rotY, span, height } = WORLD.arch;
    const base = terrainHeight(x, z);
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      const a = Math.PI * t;
      pts.push(new THREE.Vector3(-Math.cos(a) * span, Math.sin(a) * height + Math.sin(t * 9) * 0.3 - 1.5, Math.sin(t * 5.0) * 0.8));
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    let g: THREE.BufferGeometry = new THREE.TubeGeometry(curve, 90, 2.3, 18, false);
    g.deleteAttribute('uv');
    g = mergeVertices(g, 1e-3);
    g.computeVertexNormals();
    const pos = g.attributes.position as THREE.BufferAttribute;
    const nrm = g.attributes.normal as THREE.BufferAttribute;
    const v = new THREE.Vector3();
    const n = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      n.fromBufferAttribute(nrm, i);
      // 兩端（底座）加粗
      const foot = smoothstep(2.0, -1.5, v.y) * 1.4;
      const d = fbm3(v.x * 0.45, v.y * 0.45, v.z * 0.45, 4) * 1.1 + foot;
      v.addScaledVector(n, d);
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    g.computeVertexNormals();
    const colors = new Float32Array(pos.count * 3);
    const c = new THREE.Color();
    const rockA = new THREE.Color(0.40, 0.37, 0.35);
    const moss = new THREE.Color(0.20, 0.38, 0.27);
    const pink = new THREE.Color(0.66, 0.36, 0.44);
    const nr = g.attributes.normal as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      c.copy(rockA).multiplyScalar(0.8 + fbm3(v.x, v.y, v.z, 2) * 0.3);
      c.lerp(moss, smoothstep(0.3, 0.8, nr.getY(i)) * 0.8);
      c.lerp(pink, smoothstep(0.2, 0.42, fbm3(v.x * 0.9 + 4, v.y * 0.9, v.z * 0.9, 2)) * 0.6);
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const mat = patchMaterial(
      new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }),
      { caustics: true, causticLayers },
    );
    const mesh = new THREE.Mesh(g, mat);
    mesh.position.set(x, base, z);
    mesh.rotation.y = rotY;
    mesh.name = 'rockArch';
    this.group.add(mesh);
    this.disposables.push(g, mat);

    mesh.updateMatrixWorld(true);
    for (let i = 0; i <= 22; i++) {
      const p = curve.getPoint(i / 22).applyMatrix4(mesh.matrixWorld);
      this.colliders.push({ center: p, radius: 2.6 });
    }
  }

  dispose(): void {
    this.group.removeFromParent();
    this.disposables.forEach((d) => d.dispose());
    this.disposables = [];
  }
}
