import * as THREE from 'three';
import { WORLD } from '../data/worldLayout';
import { terrainHeight } from './Terrain';

/** 龜殼材質：以 Voronoi 畫出盾片紋路（原創 shader 注入）。 */
function shellMaterial(): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.55, metalness: 0.05 });
  mat.customProgramCacheKey = () => 'turtle-shell';
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vShellPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvShellPos = position;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vShellPos;
        vec2 sh2(vec2 p){ p = vec2(dot(p, vec2(127.1,311.7)), dot(p, vec2(269.5,183.3))); return fract(sin(p)*43758.5453); }`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        {
          vec2 p = vShellPos.xz / (1.0 + max(vShellPos.y, 0.0) * 0.6) * vec2(2.3, 1.9);
          vec2 ip = floor(p), fp = fract(p);
          float f1 = 9.0, f2 = 9.0; vec2 cell = vec2(0.0);
          for (int j=-1;j<=1;j++) for (int i=-1;i<=1;i++) {
            vec2 g = vec2(float(i), float(j));
            vec2 o = 0.5 + 0.35 * (sh2(ip + g) - 0.5);
            float d = length(g + o - fp);
            if (d < f1) { f2 = f1; f1 = d; cell = ip + g; } else if (d < f2) f2 = d;
          }
          float edge = smoothstep(0.03, 0.12, f2 - f1);
          vec3 amber = vec3(0.62, 0.42, 0.18);
          vec3 olive = vec3(0.36, 0.30, 0.13);
          vec3 cellCol = mix(olive, amber, sh2(cell * 3.1).x * 0.7 + 0.15);
          // 盾片中心向外的放射紋
          cellCol *= 0.8 + 0.35 * smoothstep(0.55, 0.0, f1);
          vec3 seam = vec3(0.12, 0.09, 0.05);
          float rim = smoothstep(0.02, 0.0, vShellPos.y);
          diffuseColor.rgb = mix(seam, cellCol, edge);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.30, 0.25, 0.12), rim * 0.6);
        }`,
      );
  };
  return mat;
}

/**
 * 程序化海龜：龜殼、腹甲、頭頸、四隻鰭肢，會沿橢圓路徑緩慢游動並拍動前鰭。
 */
export class Turtle {
  readonly group = new THREE.Group();
  /** 互動判定用：世界座標中心與半徑 */
  readonly hitCenter = new THREE.Vector3();
  readonly hitRadius = 2.6;
  private body = new THREE.Group();
  private head = new THREE.Group();
  private flippers: { pivot: THREE.Group; front: boolean; side: number }[] = [];
  private disposables: { dispose(): void }[] = [];
  private angle = 0.6;
  private paused = false;

  constructor() {
    this.group.name = 'Turtle';
    const skin = new THREE.MeshStandardMaterial({ color: 0x6f7d5a, roughness: 0.7 });
    const skinLight = new THREE.MeshStandardMaterial({ color: 0xc9b98a, roughness: 0.75 });
    const shellMat = shellMaterial();
    const dark = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.2 });
    this.disposables.push(skin, skinLight, shellMat, dark);

    const shellGeo = new THREE.SphereGeometry(1, 64, 32, 0, Math.PI * 2, 0, Math.PI / 2);
    shellGeo.scale(0.82, 0.42, 1.0);
    const shell = new THREE.Mesh(shellGeo, shellMat);
    const plastronGeo = new THREE.SphereGeometry(1, 32, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
    plastronGeo.scale(0.78, 0.16, 0.95);
    const plastron = new THREE.Mesh(plastronGeo, skinLight);
    this.body.add(shell, plastron);

    // 頭與頸
    const neckGeo = new THREE.CylinderGeometry(0.17, 0.22, 0.4, 12);
    neckGeo.rotateX(Math.PI / 2);
    const neck = new THREE.Mesh(neckGeo, skin);
    neck.position.set(0, 0.02, 0.95);
    const headGeo = new THREE.SphereGeometry(1, 24, 16);
    headGeo.scale(0.24, 0.2, 0.32);
    const headMesh = new THREE.Mesh(headGeo, skin);
    headMesh.position.set(0, 0.04, 0.22);
    const eyeGeo = new THREE.SphereGeometry(0.035, 8, 6);
    const eyeL = new THREE.Mesh(eyeGeo, dark);
    eyeL.position.set(0.17, 0.09, 0.32);
    const eyeR = eyeL.clone();
    eyeR.position.x = -0.17;
    // 頭頂鱗片色塊
    const capGeo = new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2.4);
    capGeo.scale(0.2, 0.12, 0.26);
    const cap = new THREE.Mesh(capGeo, shellMat);
    cap.position.set(0, 0.1, 0.22);
    this.head.add(headMesh, eyeL, eyeR, cap);
    this.head.position.set(0, 0.02, 1.08);
    this.body.add(neck, this.head);

    // 鰭肢
    const makeFlipper = (len: number, width: number) => {
      const g = new THREE.SphereGeometry(1, 20, 10);
      g.scale(len / 2, 0.05, width / 2);
      g.translate(len / 2 - 0.05, 0, 0);
      // 後掠
      const pos = g.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        pos.setZ(i, pos.getZ(i) - x * x * 0.35);
      }
      g.computeVertexNormals();
      this.disposables.push(g);
      return g;
    };
    const frontGeo = makeFlipper(1.25, 0.42);
    const rearGeo = makeFlipper(0.55, 0.32);
    for (const side of [1, -1]) {
      const fp = new THREE.Group();
      const fm = new THREE.Mesh(frontGeo, skin);
      fm.scale.x = side;
      fp.add(fm);
      fp.position.set(0.62 * side, -0.02, 0.5);
      fp.rotation.y = -0.35 * side;
      this.body.add(fp);
      this.flippers.push({ pivot: fp, front: true, side });
      const rp = new THREE.Group();
      const rm = new THREE.Mesh(rearGeo, skin);
      rm.scale.x = side;
      rp.add(rm);
      rp.position.set(0.48 * side, -0.03, -0.72);
      rp.rotation.y = 0.6 * side;
      this.body.add(rp);
      this.flippers.push({ pivot: rp, front: false, side });
    }
    const tailGeo = new THREE.ConeGeometry(0.08, 0.3, 8);
    tailGeo.rotateX(-Math.PI / 2);
    const tail = new THREE.Mesh(tailGeo, skin);
    tail.position.set(0, -0.02, -1.05);
    this.body.add(tail);
    this.disposables.push(shellGeo, plastronGeo, neckGeo, headGeo, eyeGeo, capGeo, tailGeo);

    this.body.scale.setScalar(1.25);
    this.group.add(this.body);
    this.update(0, 0);
  }

  /** 玩家觀察時，海龜會放慢、稍作停留 */
  setPaused(p: boolean): void {
    this.paused = p;
  }

  update(time: number, dt: number): void {
    const P = WORLD.turtlePath;
    this.angle += dt * P.speed * (this.paused ? 0.15 : 1);
    const a = this.angle;
    const x = P.cx + Math.cos(a) * P.rx;
    const z = P.cz + Math.sin(a) * P.rz;
    let y = P.cy + Math.sin(a * 2.0) * 1.1 + Math.sin(time * 0.8) * 0.15;
    y = Math.max(y, terrainHeight(x, z) + 2.0);
    // 切線方向（逆時針游動）
    const tx = -Math.sin(a) * P.rx;
    const tz = Math.cos(a) * P.rz;
    this.group.position.set(x, y, z);
    this.group.rotation.y = Math.atan2(tx, tz);
    this.body.rotation.z = Math.sin(time * 0.6) * 0.06;
    this.body.rotation.x = -Math.cos(a * 2.0) * 0.12;

    const stroke = time * 1.5;
    for (const f of this.flippers) {
      if (f.front) {
        f.pivot.rotation.z = Math.sin(stroke) * 0.55 * f.side;
        f.pivot.rotation.x = Math.cos(stroke) * 0.25;
      } else {
        f.pivot.rotation.z = Math.sin(stroke + 1.2) * 0.2 * f.side;
      }
    }
    this.head.rotation.y = Math.sin(time * 0.4) * 0.18;
    this.head.rotation.x = Math.sin(time * 0.33) * 0.08;
    this.hitCenter.copy(this.group.position);
  }

  dispose(): void {
    this.group.removeFromParent();
    this.disposables.forEach((d) => d.dispose());
  }
}
