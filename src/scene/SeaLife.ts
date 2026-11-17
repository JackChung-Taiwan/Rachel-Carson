import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { SeededRandom } from '../utils/random';
import { terrainHeight } from './Terrain';
import { patchMaterial } from './shaders/patchMaterial';
import type { QualitySettings } from '../core/Quality';

/** 程序化魚形：側扁的流線身體 + 尾鰭 + 背鰭，頭朝 +Z。 */
function fishGeometry(): THREE.BufferGeometry {
  const profile = [
    [0.0, 0.52], [0.05, 0.49], [0.1, 0.4], [0.135, 0.25], [0.14, 0.08], [0.12, -0.1],
    [0.085, -0.26], [0.045, -0.37], [0.02, -0.42], [0.0, -0.43],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const body = new THREE.LatheGeometry(profile, 14);
  body.rotateX(Math.PI / 2); // Y 軸 → Z 軸（頭朝 +Z）
  body.scale(0.55, 1.15, 1);
  body.deleteAttribute('uv');

  const tail = new THREE.BufferGeometry();
  const tv = new Float32Array([
    0, 0, -0.38, 0, 0.2, -0.66, 0, 0.02, -0.55,
    0, 0, -0.38, 0, 0.02, -0.55, 0, -0.2, -0.66,
  ]);
  tail.setAttribute('position', new THREE.BufferAttribute(tv, 3));
  tail.computeVertexNormals();
  const dorsal = new THREE.BufferGeometry();
  dorsal.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
    0, 0.15, 0.12, 0, 0.27, -0.06, 0, 0.13, -0.18,
  ]), 3));
  dorsal.computeVertexNormals();
  const merged = mergeGeometries([body.toNonIndexed(), tail, dorsal]);
  const pos = merged.attributes.position as THREE.BufferAttribute;
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const top = THREE.MathUtils.smoothstep(y, -0.05, 0.12);
    let v = 1.05 - top * 0.55;
    // 側線條紋
    v *= 1 - Math.exp(-((y - 0.02) ** 2) / 0.0006) * 0.25 * (z > -0.35 ? 1 : 0);
    // 眼睛
    const ex = Math.hypot(z - 0.36, y - 0.04);
    if (ex < 0.035) v = 0.05;
    col[i * 3] = v;
    col[i * 3 + 1] = v;
    col[i * 3 + 2] = v;
  }
  merged.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return merged;
}

function mantaGeometry(): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0.9);
  shape.bezierCurveTo(0.6, 0.85, 1.4, 0.35, 2.2, -0.25);
  shape.bezierCurveTo(1.5, -0.3, 0.8, -0.55, 0.25, -0.85);
  shape.lineTo(0, -0.95);
  shape.lineTo(-0.25, -0.85);
  shape.bezierCurveTo(-0.8, -0.55, -1.5, -0.3, -2.2, -0.25);
  shape.bezierCurveTo(-1.4, 0.35, -0.6, 0.85, 0, 0.9);
  const g = new THREE.ShapeGeometry(shape, 18);
  g.rotateX(-Math.PI / 2); // XY → XZ，頭朝 -Z，等一下翻轉
  g.rotateY(Math.PI);
  const pos = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    pos.setY(i, Math.max(0, 0.22 * (1 - Math.abs(x) / 2.2)) * (1 - Math.abs(z) * 0.5));
  }
  g.deleteAttribute('uv');
  g.computeVertexNormals();
  const tail = new THREE.CylinderGeometry(0.015, 0.04, 2.0, 4, 1);
  tail.rotateX(Math.PI / 2);
  tail.translate(0, 0.05, -1.8);
  tail.deleteAttribute('uv');
  const merged = mergeGeometries([g.toNonIndexed(), tail.toNonIndexed()]);
  const p2 = merged.attributes.position as THREE.BufferAttribute;
  const col = new Float32Array(p2.count * 3);
  for (let i = 0; i < p2.count; i++) {
    const x = p2.getX(i), z = p2.getZ(i);
    const edge = Math.abs(x) / 2.2;
    const v = 0.16 + edge * 0.08 + (z > 0.4 ? 0.05 : 0);
    col[i * 3] = v * 0.8;
    col[i * 3 + 1] = v * 0.95;
    col[i * 3 + 2] = v * 1.15;
  }
  merged.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return merged;
}

interface School {
  first: number;
  count: number;
  base: THREE.Vector3;
  amp: THREE.Vector3;
  speed: number;
  phase: number;
  radius: number;
  center: THREE.Vector3;
}

/**
 * 海洋生物：多群會群游的魚（簡化 boids：跟隨群中心 + 個體偏移 + 分離）與魟魚。
 */
export class SeaLife {
  readonly group = new THREE.Group();
  private fishMesh: THREE.InstancedMesh;
  private schools: School[] = [];
  private pos: Float32Array;
  private vel: Float32Array;
  private offsets: Float32Array;
  private mantas: { mesh: THREE.Mesh; r: number; cx: number; cz: number; y: number; speed: number; phase: number }[] = [];
  private disposables: { dispose(): void }[] = [];
  private m = new THREE.Matrix4();
  private v1 = new THREE.Vector3();
  private v2 = new THREE.Vector3();
  private up = new THREE.Vector3(0, 1, 0);
  private scaleV = new THREE.Vector3();
  private quat = new THREE.Quaternion();
  private scales: Float32Array;

  constructor(q: QualitySettings) {
    this.group.name = 'SeaLife';
    const rng = new SeededRandom(808);
    const n = q.fishCount;
    const geo = fishGeometry();
    const phases = new Float32Array(n);
    for (let i = 0; i < n; i++) phases[i] = rng.next();
    geo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phases, 1));
    const mat = patchMaterial(
      new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.15, side: THREE.DoubleSide }),
      { fishWiggle: { amp: 0.11, speed: 9 } },
    );
    this.disposables.push(geo, mat);
    this.fishMesh = new THREE.InstancedMesh(geo, mat, n);
    this.fishMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.fishMesh.frustumCulled = false;
    this.group.add(this.fishMesh);

    // 群組設定：主群（銀藍沙丁魚）會在開場鏡頭前方游過
    const defs = [
      { frac: 0.5, base: [-1, -11.5, 12], amp: [16, 2.5, 9], speed: 0.11, radius: 4.5, colors: [0xbfe6ff, 0xd8f2ff, 0x9fd0f0], scale: [0.42, 0.56] },
      { frac: 0.2, base: [9, -18.5, -8], amp: [9, 1.2, 7], speed: 0.16, radius: 2.6, colors: [0xffd84a, 0xffe36e, 0xffc23a], scale: [0.45, 0.6] },
      { frac: 0.18, base: [-19, -15, -6], amp: [10, 3, 10], speed: 0.13, radius: 3.0, colors: [0xff9a4a, 0x5ad1ff, 0xff7f6a], scale: [0.5, 0.66] },
      { frac: 0.12, base: [-12, -17, 22], amp: [7, 1.5, 6], speed: 0.19, radius: 2.2, colors: [0x7af0d0, 0x48b8ff], scale: [0.4, 0.52] },
    ];
    this.pos = new Float32Array(n * 3);
    this.vel = new Float32Array(n * 3);
    this.offsets = new Float32Array(n * 3);
    this.scales = new Float32Array(n);
    let idx = 0;
    const color = new THREE.Color();
    defs.forEach((d, si) => {
      const count = si === defs.length - 1 ? n - idx : Math.round(n * d.frac);
      const school: School = {
        first: idx,
        count,
        base: new THREE.Vector3(...(d.base as [number, number, number])),
        amp: new THREE.Vector3(...(d.amp as [number, number, number])),
        speed: d.speed,
        phase: rng.range(0, 6.28),
        radius: d.radius,
        center: new THREE.Vector3(),
      };
      this.schools.push(school);
      this.schoolCenter(school, 0, school.center);
      for (let i = 0; i < count; i++, idx++) {
        const ox = rng.gauss() * d.radius * 0.6, oy = rng.gauss() * d.radius * 0.28, oz = rng.gauss() * d.radius * 0.6;
        this.offsets.set([ox, oy, oz], idx * 3);
        this.pos.set([school.center.x + ox, school.center.y + oy, school.center.z + oz], idx * 3);
        this.vel.set([1, 0, 0], idx * 3);
        this.scales[idx] = rng.range(d.scale[0], d.scale[1]);
        color.set(rng.pick(d.colors));
        this.fishMesh.setColorAt(idx, color);
      }
    });
    if (this.fishMesh.instanceColor) this.fishMesh.instanceColor.needsUpdate = true;

    // 魟魚（Medium/High）
    if (q.mantaCount > 0) {
      const mg = mantaGeometry();
      const mm = patchMaterial(
        new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, side: THREE.DoubleSide }),
        { wingFlap: { amp: 0.11, speed: 1.4 } },
      );
      this.disposables.push(mg, mm);
      for (let i = 0; i < q.mantaCount; i++) {
        const mesh = new THREE.Mesh(mg, mm);
        mesh.scale.setScalar(1.6 + i * 0.3);
        mesh.frustumCulled = false;
        this.group.add(mesh);
        this.mantas.push({ mesh, r: 26 + i * 14, cx: -4 + i * 10, cz: -6 - i * 8, y: -6.5 - i * 1.8, speed: 0.05 - i * 0.012, phase: i * 2.4 });
      }
    }
    this.update(0, 0.016);
  }

  private schoolCenter(s: School, t: number, out: THREE.Vector3): THREE.Vector3 {
    const a = t * s.speed + s.phase;
    out.set(
      s.base.x + Math.sin(a) * s.amp.x,
      s.base.y + Math.sin(a * 2.0 + 1.3) * s.amp.y,
      s.base.z + Math.sin(a * 0.9 + 0.7) * Math.cos(a * 0.5) * s.amp.z,
    );
    const floor = terrainHeight(out.x, out.z) + 2.5;
    if (out.y < floor) out.y = floor;
    return out;
  }

  update(time: number, dt: number): void {
    const step = Math.min(dt, 0.05);
    const { pos, vel, offsets } = this;
    for (const s of this.schools) {
      this.schoolCenter(s, time, s.center);
      const end = s.first + s.count;
      for (let i = s.first; i < end; i++) {
        const k = i * 3;
        const wob = time * 0.6 + i * 1.7;
        const tx = s.center.x + offsets[k] + Math.sin(wob) * 0.6;
        const ty = s.center.y + offsets[k + 1] + Math.sin(wob * 1.3) * 0.25;
        const tz = s.center.z + offsets[k + 2] + Math.cos(wob * 0.9) * 0.6;
        // 轉向目標
        let ax = (tx - pos[k]) * 1.4, ay = (ty - pos[k + 1]) * 1.4, az = (tz - pos[k + 2]) * 1.4;
        // 與相鄰個體分離（只檢查少數鄰居以節省效能）
        for (let j = 1; j <= 2; j++) {
          const o = s.first + ((i - s.first + j * 7) % s.count);
          const ko = o * 3;
          const dx = pos[k] - pos[ko], dy = pos[k + 1] - pos[ko + 1], dz = pos[k + 2] - pos[ko + 2];
          const d2 = dx * dx + dy * dy + dz * dz + 0.01;
          if (d2 < 0.8) {
            ax += (dx / d2) * 0.6;
            ay += (dy / d2) * 0.6;
            az += (dz / d2) * 0.6;
          }
        }
        vel[k] += ax * step;
        vel[k + 1] += ay * step;
        vel[k + 2] += az * step;
        const damp = Math.exp(-step * 1.2);
        vel[k] *= damp;
        vel[k + 1] *= damp;
        vel[k + 2] *= damp;
        let sp = Math.hypot(vel[k], vel[k + 1], vel[k + 2]);
        const minSp = 0.8, maxSp = 4.5;
        if (sp < minSp || sp > maxSp) {
          const f = (sp < minSp ? minSp : maxSp) / Math.max(sp, 1e-4);
          vel[k] *= f;
          vel[k + 1] *= f;
          vel[k + 2] *= f;
          sp = minSp;
        }
        pos[k] += vel[k] * step;
        pos[k + 1] += vel[k + 1] * step;
        pos[k + 2] += vel[k + 2] * step;

        this.v1.set(pos[k], pos[k + 1], pos[k + 2]);
        this.v2.set(pos[k] + vel[k], pos[k + 1] + vel[k + 1] * 0.5, pos[k + 2] + vel[k + 2]);
        this.m.lookAt(this.v2, this.v1, this.up);
        this.quat.setFromRotationMatrix(this.m);
        this.scaleV.setScalar(this.scales[i]);
        this.m.compose(this.v1, this.quat, this.scaleV);
        this.fishMesh.setMatrixAt(i, this.m);
      }
    }
    this.fishMesh.instanceMatrix.needsUpdate = true;

    for (const m of this.mantas) {
      const a = time * m.speed + m.phase;
      const x = m.cx + Math.cos(a) * m.r;
      const z = m.cz + Math.sin(a) * m.r * 0.7;
      const y = m.y + Math.sin(a * 3) * 1.2;
      const nx = m.cx + Math.cos(a + 0.01) * m.r;
      const nz = m.cz + Math.sin(a + 0.01) * m.r * 0.7;
      m.mesh.position.set(x, y, z);
      m.mesh.rotation.set(0, Math.atan2(nx - x, nz - z), 0);
      m.mesh.rotateZ(-0.25);
    }
  }

  /** 取得主魚群中心（給首頁鏡頭使用） */
  getMainSchoolCenter(out: THREE.Vector3): THREE.Vector3 {
    return out.copy(this.schools[0].center);
  }

  dispose(): void {
    this.group.removeFromParent();
    this.disposables.forEach((d) => d.dispose());
    this.disposables = [];
  }
}
