import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { SeededRandom } from '../utils/random';
import { fbm2, fbm3, smoothstep } from '../utils/noise';
import { terrainHeight, type SphereCollider } from './Terrain';
import { patchMaterial } from './shaders/patchMaterial';
import { WORLD, inClearZone } from '../data/worldLayout';
import type { QualitySettings } from '../core/Quality';

/** 為幾何體填入單一頂點色（或用函式依位置決定） */
function paint(g: THREE.BufferGeometry, fn: (x: number, y: number, z: number, out: THREE.Color) => void): void {
  const pos = g.attributes.position as THREE.BufferAttribute;
  const col = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    fn(pos.getX(i), pos.getY(i), pos.getZ(i), c);
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
}

function strip(rows: number, cols: number, fn: (s: number, w: number, out: THREE.Vector3) => void): THREE.BufferGeometry {
  const positions: number[] = [];
  const indices: number[] = [];
  const v = new THREE.Vector3();
  for (let r = 0; r <= rows; r++) {
    for (let c = 0; c <= cols; c++) {
      fn(r / rows, (c / cols) * 2 - 1, v);
      positions.push(v.x, v.y, v.z);
    }
  }
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const a = r * (cols + 1) + c;
      const b = a + cols + 1;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}

function clean(g: THREE.BufferGeometry): THREE.BufferGeometry {
  if (g.attributes.uv) g.deleteAttribute('uv');
  if (!g.index) g = mergeVertices(g);
  if (!g.attributes.normal) g.computeVertexNormals();
  return g;
}

/** 一株海帶：細長莖 + 許多向上漂浮的葉片（金綠色）。 */
function kelpGeometry(height: number, seed: number): THREE.BufferGeometry {
  const rng = new SeededRandom(seed);
  const parts: THREE.BufferGeometry[] = [];
  const bend = new THREE.Vector2(rng.range(-0.8, 0.8), rng.range(-0.8, 0.8));
  const stemAt = (t: number) =>
    new THREE.Vector3(bend.x * t * t + Math.sin(t * 7 + seed) * 0.15, t * height, bend.y * t * t + Math.cos(t * 5 + seed) * 0.15);
  const stemPts: THREE.Vector3[] = [];
  for (let i = 0; i <= 12; i++) stemPts.push(stemAt(i / 12));
  const stem = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(stemPts), 28, 0.07, 5, false);
  parts.push(clean(stem));

  const blades = Math.round(height * 2.1);
  for (let k = 0; k < blades; k++) {
    const t = 0.06 + (k / blades) * 0.92;
    const base = stemAt(t);
    const ang = k * 2.39996 + rng.range(-0.3, 0.3);
    const dir = new THREE.Vector3(Math.cos(ang), 0, Math.sin(ang));
    const side = new THREE.Vector3(-dir.z, 0, dir.x);
    const len = (1.7 + rng.range(0, 1.2)) * (0.7 + Math.sin(t * Math.PI) * 0.5);
    const width = 0.3 + rng.range(0, 0.16);
    const lift = rng.range(0.5, 0.95);
    const ruffle = rng.range(0, 10);
    parts.push(
      strip(6, 2, (s, w, out) => {
        const shape = Math.pow(Math.sin(Math.min(s * 1.08, 1) * Math.PI * 0.92 + 0.12), 0.8);
        out.copy(base)
          .addScaledVector(dir, s * len * 0.85)
          .addScaledVector(new THREE.Vector3(0, 1, 0), s * len * lift + s * s * 0.35)
          .addScaledVector(side, w * width * shape);
        out.y += Math.sin(s * 9 + w * 2 + ruffle) * 0.05 * Math.abs(w);
      }),
    );
  }
  // 頂端的氣囊與葉叢
  for (let k = 0; k < 3; k++) {
    const b = new THREE.SphereGeometry(0.11, 6, 5);
    const p = stemAt(0.25 + k * 0.28);
    b.translate(p.x + 0.12, p.y, p.z);
    parts.push(clean(b));
  }
  const merged = mergeGeometries(parts);
  parts.forEach((p) => p.dispose());
  const dark = new THREE.Color(0.22, 0.26, 0.07);
  const mid = new THREE.Color(0.46, 0.54, 0.13);
  const gold = new THREE.Color(0.90, 0.76, 0.26);
  paint(merged, (x, y, z, c) => {
    const t = y / height;
    c.copy(dark).lerp(mid, smoothstep(0.0, 0.45, t)).lerp(gold, smoothstep(0.45, 1.0, t) * 0.8);
    c.multiplyScalar(0.85 + fbm3(x * 2, y * 0.5, z * 2, 2) * 0.35);
  });
  return merged;
}

/** 一叢海草 */
function seagrassGeometry(seed: number): THREE.BufferGeometry {
  const rng = new SeededRandom(seed);
  const parts: THREE.BufferGeometry[] = [];
  const n = 9;
  for (let i = 0; i < n; i++) {
    const a = rng.range(0, Math.PI * 2);
    const r = rng.range(0, 0.25);
    const h = rng.range(0.5, 1.5);
    const lean = new THREE.Vector3(Math.cos(a), 0, Math.sin(a)).multiplyScalar(rng.range(0.1, 0.45));
    const bx = Math.cos(a) * r, bz = Math.sin(a) * r;
    const side = new THREE.Vector3(-Math.sin(a + 1.2), 0, Math.cos(a + 1.2));
    const w = rng.range(0.025, 0.05);
    parts.push(
      strip(4, 1, (s, ww, out) => {
        out.set(bx, s * h, bz).addScaledVector(lean, s * s * h).addScaledVector(side, ww * w * (1 - s * 0.85));
      }),
    );
  }
  const merged = mergeGeometries(parts);
  parts.forEach((p) => p.dispose());
  const base = new THREE.Color(0.24, 0.42, 0.18);
  const tip = new THREE.Color(0.70, 0.82, 0.36);
  paint(merged, (_x, y, _z, c) => c.copy(base).lerp(tip, Math.min(y / 1.3, 1)));
  return merged;
}

function branchCoralGeometry(seed: number): THREE.BufferGeometry {
  const rng = new SeededRandom(seed);
  const parts: THREE.BufferGeometry[] = [];
  const grow = (from: THREE.Vector3, dir: THREE.Vector3, len: number, rad: number, depth: number) => {
    const to = from.clone().addScaledVector(dir, len);
    const g = new THREE.CylinderGeometry(rad * 0.7, rad, len, 5, 1, true);
    g.translate(0, len / 2, 0);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir));
    g.translate(from.x, from.y, from.z);
    parts.push(clean(g));
    if (depth <= 0) {
      const tip = new THREE.SphereGeometry(rad * 0.85, 5, 3);
      tip.translate(to.x, to.y, to.z);
      parts.push(clean(tip));
      return;
    }
    const kids = rng.next() < 0.3 ? 3 : 2;
    for (let i = 0; i < kids; i++) {
      const nd = dir.clone().add(new THREE.Vector3(rng.range(-0.8, 0.8), rng.range(0.1, 0.6), rng.range(-0.8, 0.8))).normalize();
      grow(to, nd, len * rng.range(0.6, 0.85), rad * 0.72, depth - 1);
    }
  };
  for (let i = 0; i < 3; i++) {
    grow(new THREE.Vector3(rng.range(-0.15, 0.15), 0, rng.range(-0.15, 0.15)),
      new THREE.Vector3(rng.range(-0.4, 0.4), 1, rng.range(-0.4, 0.4)).normalize(), 0.45, 0.09, 3);
  }
  const merged = mergeGeometries(parts);
  parts.forEach((p) => p.dispose());
  paint(merged, (_x, y, _z, c) => c.setScalar(0.55 + Math.min(y / 1.4, 1) * 0.55));
  return merged;
}

function brainCoralGeometry(seed: number): THREE.BufferGeometry {
  let g: THREE.BufferGeometry = new THREE.SphereGeometry(0.7, 40, 20, 0, Math.PI * 2, 0, Math.PI * 0.55);
  g = clean(g);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const groove = Math.abs(Math.sin(fbm3(v.x * 2 + seed, v.y * 2, v.z * 2, 2) * 14));
    v.multiplyScalar(1 + groove * 0.06);
    v.y *= 0.75;
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  paint(g, (x, y, z, c) => {
    const groove = Math.abs(Math.sin(fbm3(x * 2 + seed, y * 2 / 0.75, z * 2, 2) * 14));
    c.setScalar(0.55 + groove * 0.5);
  });
  return g;
}

function tubeSpongeGeometry(seed: number): THREE.BufferGeometry {
  const rng = new SeededRandom(seed);
  const parts: THREE.BufferGeometry[] = [];
  const n = rng.int(3, 5);
  for (let i = 0; i < n; i++) {
    const h = rng.range(0.6, 1.5);
    const r = rng.range(0.1, 0.18);
    const outer = new THREE.CylinderGeometry(r * 1.15, r * 0.9, h, 12, 3, true);
    outer.translate(0, h / 2, 0);
    const inner = new THREE.CylinderGeometry(r * 0.9, r * 0.7, h * 0.98, 12, 1, true);
    inner.scale(-1, 1, 1); // 讓內壁朝內
    inner.translate(0, h / 2, 0);
    const tiltQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(rng.range(-0.25, 0.25), 0, rng.range(-0.25, 0.25)));
    const off = new THREE.Vector3(rng.range(-0.25, 0.25), 0, rng.range(-0.25, 0.25));
    for (const p of [outer, inner]) {
      p.applyQuaternion(tiltQ);
      p.translate(off.x, 0, off.z);
    }
    const o = clean(outer);
    paint(o, (_x, y, _z, c) => c.setScalar(0.7 + (y / 1.5) * 0.4));
    const inn = clean(inner);
    paint(inn, () => c0.setScalar(0.25));
    parts.push(o, inn);
  }
  const merged = mergeGeometries(parts);
  parts.forEach((p) => p.dispose());
  return merged;
}
const c0 = new THREE.Color();

function seaFanGeometry(seed: number): THREE.BufferGeometry {
  const rng = new SeededRandom(seed);
  const parts: THREE.BufferGeometry[] = [];
  const grow = (x: number, y: number, ang: number, len: number, rad: number, depth: number) => {
    const x2 = x + Math.sin(ang) * len, y2 = y + Math.cos(ang) * len;
    const g = new THREE.CylinderGeometry(rad * 0.75, rad, len, 4, 1, true);
    g.translate(0, len / 2, 0);
    g.rotateZ(-ang);
    g.translate(x, y, rng.range(-0.02, 0.02));
    parts.push(clean(g));
    if (depth <= 0) return;
    grow(x2, y2, ang + rng.range(-0.6, -0.2), len * 0.78, rad * 0.75, depth - 1);
    grow(x2, y2, ang + rng.range(0.2, 0.6), len * 0.78, rad * 0.75, depth - 1);
  };
  grow(0, 0, 0, 0.35, 0.05, 5);
  const merged = mergeGeometries(parts);
  parts.forEach((p) => p.dispose());
  paint(merged, (_x, y, _z, c) => c.setScalar(0.65 + Math.min(y / 1.6, 1) * 0.45));
  return merged;
}

function anemoneGeometry(seed: number): THREE.BufferGeometry {
  const rng = new SeededRandom(seed);
  const parts: THREE.BufferGeometry[] = [];
  const base = new THREE.CylinderGeometry(0.22, 0.28, 0.25, 12, 1);
  base.translate(0, 0.12, 0);
  parts.push(clean(base));
  for (let i = 0; i < 46; i++) {
    const a = rng.range(0, Math.PI * 2);
    const r = Math.sqrt(rng.next()) * 0.2;
    const len = rng.range(0.35, 0.6);
    const g = new THREE.ConeGeometry(0.025, len, 4, 2);
    g.translate(0, len / 2, 0);
    g.rotateZ(-Math.cos(a) * (0.3 + r * 2));
    g.rotateX(Math.sin(a) * (0.3 + r * 2));
    g.translate(Math.cos(a) * r, 0.24, Math.sin(a) * r);
    parts.push(clean(g));
  }
  const merged = mergeGeometries(parts);
  parts.forEach((p) => p.dispose());
  paint(merged, (_x, y, _z, c) => c.setScalar(y < 0.26 ? 0.55 : 0.75 + Math.min((y - 0.26) / 0.5, 1) * 0.5));
  return merged;
}

/**
 * 植物與珊瑚：海帶森林、海草草原、各式珊瑚與海葵。
 */
export class Vegetation {
  readonly group = new THREE.Group();
  private disposables: { dispose(): void }[] = [];

  constructor(private readonly q: QualitySettings, private readonly colliders: SphereCollider[]) {
    this.group.name = 'Vegetation';
    this.buildKelp();
    this.buildSeagrass();
    this.buildCorals();
  }

  private blocked(x: number, z: number, pad: number): boolean {
    if (inClearZone(x, z, pad)) return true;
    for (const c of this.colliders) {
      const dx = x - c.center.x, dz = z - c.center.z;
      if (dx * dx + dz * dz < (c.radius * 0.9 + pad) ** 2) return true;
    }
    return false;
  }

  private buildKelp(): void {
    const rng = new SeededRandom(314);
    const heights = [13, 17, 21];
    const geos = heights.map((h, i) => kelpGeometry(h, 10 + i * 7));
    const mat = patchMaterial(
      new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.6, metalness: 0 }),
      { sway: { height: 20, amp: 1.7 }, translucency: new THREE.Color(0.45, 0.55, 0.14), caustics: false },
    );
    this.disposables.push(mat, ...geos);
    const forests = WORLD.kelpForests;
    const totalW = forests.reduce((s, f) => s + f.w * f.r, 0);
    const per: { x: number; z: number; s: number; rot: number }[][] = heights.map(() => []);
    let placed = 0, tries = 0;
    while (placed < this.q.kelpCount && tries < this.q.kelpCount * 30) {
      tries++;
      let pick = rng.next() * totalW;
      let f: (typeof forests)[number] = forests[0];
      for (const ff of forests) {
        pick -= ff.w * ff.r;
        if (pick <= 0) { f = ff; break; }
      }
      const a = rng.range(0, Math.PI * 2);
      const rr = Math.sqrt(rng.next()) * f.r;
      const x = f.x + Math.cos(a) * rr, z = f.z + Math.sin(a) * rr;
      if (Math.hypot(x, z) > 92 || this.blocked(x, z, 1.2)) continue;
      const vi = rng.int(0, heights.length - 1);
      const ground = terrainHeight(x, z);
      let s = rng.range(0.85, 1.2);
      const maxTop = -1.8;
      if (ground + heights[vi] * s > maxTop) s = Math.max(0.4, (maxTop - ground) / heights[vi]);
      per[vi].push({ x, z, s, rot: rng.range(0, Math.PI * 2) });
      placed++;
    }
    const m = new THREE.Matrix4();
    const qq = new THREE.Quaternion();
    const p = new THREE.Vector3();
    const sc = new THREE.Vector3();
    per.forEach((list, vi) => {
      if (!list.length) return;
      const inst = new THREE.InstancedMesh(geos[vi], mat, list.length);
      list.forEach((k, i) => {
        qq.setFromAxisAngle(new THREE.Vector3(0, 1, 0), k.rot);
        p.set(k.x, terrainHeight(k.x, k.z) - 0.3, k.z);
        sc.setScalar(k.s);
        m.compose(p, qq, sc);
        inst.setMatrixAt(i, m);
      });
      inst.computeBoundingSphere();
      this.group.add(inst);
    });
  }

  private buildSeagrass(): void {
    const rng = new SeededRandom(99);
    const geos = [seagrassGeometry(1), seagrassGeometry(2), seagrassGeometry(3)];
    const mat = patchMaterial(
      new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.7 }),
      { sway: { height: 1.4, amp: 0.28 }, translucency: new THREE.Color(0.15, 0.3, 0.1) },
    );
    this.disposables.push(mat, ...geos);
    const lists: THREE.Matrix4[][] = geos.map(() => []);
    let placed = 0, tries = 0;
    while (placed < this.q.seagrassTufts && tries < this.q.seagrassTufts * 20) {
      tries++;
      // 起點前方較密，讓前景有細節
      const near = rng.next() < 0.35;
      const x = near ? rng.range(-25, 30) : rng.range(-80, 80);
      const z = near ? rng.range(-10, 40) : rng.range(-80, 80);
      if (Math.hypot(x, z) > 85) continue;
      const meadow = fbm2(x * 0.04 + 50, z * 0.04, 3);
      if (meadow < -0.05 && rng.next() > 0.15) continue;
      if (this.blocked(x, z, 0.3)) continue;
      const m = new THREE.Matrix4().compose(
        new THREE.Vector3(x, terrainHeight(x, z) - 0.05, z),
        new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rng.range(0, 6.28)),
        new THREE.Vector3().setScalar(rng.range(0.7, 1.5)),
      );
      lists[rng.int(0, geos.length - 1)].push(m);
      placed++;
    }
    lists.forEach((list, i) => {
      if (!list.length) return;
      const inst = new THREE.InstancedMesh(geos[i], mat, list.length);
      list.forEach((m, k) => inst.setMatrixAt(k, m));
      inst.computeBoundingSphere();
      this.group.add(inst);
    });
  }

  private buildCorals(): void {
    const rng = new SeededRandom(4242);
    const layers = this.q.causticLayers;
    type Kind = { geo: THREE.BufferGeometry; mat: THREE.MeshStandardMaterial; weight: number; palette: number[]; scale: [number, number] };
    const solid = patchMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 }), {
      caustics: true,
      causticLayers: layers,
      glow: 0.22,
    });
    const swaying = patchMaterial(
      new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, side: THREE.DoubleSide }),
      { sway: { height: 1.6, amp: 0.12 }, translucency: new THREE.Color(0.25, 0.1, 0.15), glow: 0.2 },
    );
    const kinds: Kind[] = [
      { geo: branchCoralGeometry(1), mat: solid, weight: 3, palette: [0xff7a8a, 0xff9a5a, 0xc77dff, 0xffc94a], scale: [0.8, 1.6] },
      { geo: branchCoralGeometry(2), mat: solid, weight: 2, palette: [0xff6f91, 0xffa36c, 0x9b8cff], scale: [0.8, 1.5] },
      { geo: brainCoralGeometry(3), mat: solid, weight: 2.2, palette: [0x9ad3a0, 0xb58cd9, 0xe0b878, 0x7fc8c8], scale: [0.8, 1.7] },
      { geo: tubeSpongeGeometry(4), mat: solid, weight: 1.6, palette: [0xffa040, 0xffd23f, 0xa070ff, 0xff6a5c], scale: [0.8, 1.4] },
      { geo: seaFanGeometry(5), mat: swaying, weight: 1.4, palette: [0xe0457b, 0xb455e0, 0xff7043], scale: [1.0, 1.9] },
      { geo: anemoneGeometry(6), mat: swaying, weight: 1.4, palette: [0xff8fc8, 0xffffff, 0x9ef0ff, 0xffb070], scale: [0.9, 1.6] },
    ];
    this.disposables.push(solid, swaying, ...kinds.map((k) => k.geo));
    const totalW = kinds.reduce((s, k) => s + k.weight, 0);
    const lists: { m: THREE.Matrix4; c: THREE.Color }[][] = kinds.map(() => []);
    const reefs = WORLD.reefs;
    const reefW = reefs.reduce((s, r) => s + r.w, 0);
    let placed = 0, tries = 0;
    while (placed < this.q.coralCount && tries < this.q.coralCount * 30) {
      tries++;
      let x: number, z: number;
      if (rng.next() < 0.78) {
        let pick = rng.next() * reefW;
        let reef: (typeof reefs)[number] = reefs[0];
        for (const r of reefs) {
          pick -= r.w;
          if (pick <= 0) { reef = r; break; }
        }
        const a = rng.range(0, Math.PI * 2);
        const rr = Math.sqrt(rng.next()) * reef.r;
        x = reef.x + Math.cos(a) * rr;
        z = reef.z + Math.sin(a) * rr;
      } else {
        x = rng.range(-60, 60);
        z = rng.range(-60, 60);
      }
      // 起點與海龜路徑保持開闊；塑膠瓶旁保留珊瑚礁，凸顯污染與美麗海洋的對比
      const dB = Math.hypot(x - WORLD.bottle.x, z - WORLD.bottle.z);
      if (dB < 2.2) continue;
      if (inClearZone(x, z, 0) && dB > 9) continue;
      let pick = rng.next() * totalW;
      let ki = 0;
      for (let i = 0; i < kinds.length; i++) {
        pick -= kinds[i].weight;
        if (pick <= 0) { ki = i; break; }
      }
      const k = kinds[ki];
      const s = rng.range(k.scale[0], k.scale[1]);
      const m = new THREE.Matrix4().compose(
        new THREE.Vector3(x, terrainHeight(x, z) - 0.08, z),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(rng.range(-0.1, 0.1), rng.range(0, 6.28), rng.range(-0.1, 0.1))),
        new THREE.Vector3().setScalar(s),
      );
      const c = new THREE.Color(rng.pick(k.palette));
      c.offsetHSL(rng.range(-0.02, 0.02), 0, rng.range(-0.06, 0.04));
      lists[ki].push({ m, c });
      placed++;
    }
    lists.forEach((list, i) => {
      if (!list.length) return;
      const inst = new THREE.InstancedMesh(kinds[i].geo, kinds[i].mat, list.length);
      list.forEach((it, j) => {
        inst.setMatrixAt(j, it.m);
        inst.setColorAt(j, it.c);
      });
      inst.computeBoundingSphere();
      this.group.add(inst);
    });
  }

  dispose(): void {
    this.group.removeFromParent();
    this.disposables.forEach((d) => d.dispose());
    this.disposables = [];
  }
}
