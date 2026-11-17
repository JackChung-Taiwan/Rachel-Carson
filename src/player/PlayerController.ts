import * as THREE from 'three';
import { WORLD } from '../data/worldLayout';
import { terrainHeight, type SphereCollider } from '../scene/Terrain';

/** 由觸控或其他輸入來源提供的移動指令 */
export interface ExternalInput {
  moveX: number; // -1 ~ 1（左右）
  moveY: number; // -1 ~ 1（前後，正值向前）
  vertical: number; // -1 ~ 1（下降/上升）
  sprint: boolean;
}

/**
 * 玩家游動控制：
 * - 桌機：WASD 移動、滑鼠轉視角（Pointer Lock，或按住拖曳）、Q/E 下降/上升、Shift 加速。
 * - 手機：由 TouchControls 提供 ExternalInput 與視角增量。
 * - 碰撞：海底地形高度、岩石/拱門球體、可游動半徑與海面上限。
 */
export class PlayerController {
  readonly position = new THREE.Vector3();
  readonly velocity = new THREE.Vector3();
  yaw = 0;
  pitch = 0;
  enabled = false;
  /** 滑鼠靈敏度 */
  lookSensitivity = 0.0022;
  readonly external: ExternalInput = { moveX: 0, moveY: 0, vertical: 0, sprint: false };

  private keys = new Set<string>();
  private dragging = false;
  private lastPointer = { x: 0, y: 0 };
  private tmpForward = new THREE.Vector3();
  private tmpRight = new THREE.Vector3();
  private wish = new THREE.Vector3();
  private colliders: SphereCollider[] = [];
  private bobTime = 0;

  constructor(private readonly camera: THREE.PerspectiveCamera, private readonly canvas: HTMLCanvasElement) {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', () => this.keys.clear());
    document.addEventListener('mousemove', this.onMouseMove);
    canvas.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mouseup', () => (this.dragging = false));
  }

  setColliders(c: SphereCollider[]): void {
    this.colliders = c;
  }

  get isPointerLocked(): boolean {
    return document.pointerLockElement === this.canvas;
  }

  reset(): void {
    const s = WORLD.start;
    this.position.set(s.x, s.y, s.z);
    this.yaw = s.yaw;
    this.pitch = s.pitch;
    this.velocity.set(0, 0, 0);
    this.keys.clear();
    this.applyCamera();
  }

  teleport(pos: THREE.Vector3, lookAt?: THREE.Vector3): void {
    this.position.copy(pos);
    this.velocity.set(0, 0, 0);
    if (lookAt) {
      const d = lookAt.clone().sub(pos);
      this.yaw = Math.atan2(-d.x, -d.z);
      this.pitch = Math.atan2(d.y, Math.hypot(d.x, d.z));
    }
    this.resolveCollisions();
    this.applyCamera();
  }

  addLook(dx: number, dy: number): void {
    this.yaw -= dx;
    this.pitch = THREE.MathUtils.clamp(this.pitch - dy, -1.35, 1.35);
  }

  private onKeyDown = (e: KeyboardEvent) => {
    if (!this.enabled) return;
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
    this.keys.add(e.code);
    if (['Space', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
  };

  private onMouseDown = (e: MouseEvent) => {
    if (!this.enabled || this.isPointerLocked) return;
    this.dragging = true;
    this.lastPointer.x = e.clientX;
    this.lastPointer.y = e.clientY;
  };

  private onMouseMove = (e: MouseEvent) => {
    if (!this.enabled) return;
    if (this.isPointerLocked) {
      this.addLook(e.movementX * this.lookSensitivity, e.movementY * this.lookSensitivity);
    } else if (this.dragging) {
      const dx = e.clientX - this.lastPointer.x;
      const dy = e.clientY - this.lastPointer.y;
      this.lastPointer.x = e.clientX;
      this.lastPointer.y = e.clientY;
      this.addLook(dx * 0.004, dy * 0.004);
    }
  };

  update(dt: number): void {
    const k = this.keys;
    let mx = 0, my = 0, mv = 0;
    let sprint = false;
    if (this.enabled) {
      if (k.has('KeyW') || k.has('ArrowUp')) my += 1;
      if (k.has('KeyS') || k.has('ArrowDown')) my -= 1;
      if (k.has('KeyD') || k.has('ArrowRight')) mx += 1;
      if (k.has('KeyA') || k.has('ArrowLeft')) mx -= 1;
      if (k.has('KeyE') || k.has('Space')) mv += 1;
      if (k.has('KeyQ')) mv -= 1;
      sprint = k.has('ShiftLeft') || k.has('ShiftRight');
      mx += this.external.moveX;
      my += this.external.moveY;
      mv += this.external.vertical;
      sprint = sprint || this.external.sprint;
    }
    mx = THREE.MathUtils.clamp(mx, -1, 1);
    my = THREE.MathUtils.clamp(my, -1, 1);
    mv = THREE.MathUtils.clamp(mv, -1, 1);

    // 前進方向跟著視線（包含俯仰），像真正游泳一樣
    const cp = Math.cos(this.pitch);
    this.tmpForward.set(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp);
    this.tmpRight.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    this.wish.set(0, 0, 0).addScaledVector(this.tmpForward, my).addScaledVector(this.tmpRight, mx);
    this.wish.y += mv;
    if (this.wish.lengthSq() > 1) this.wish.normalize();
    const speed = sprint ? 11 : 5.2;
    // 水中加速度與阻力
    const accel = 1 - Math.exp(-dt * 3.2);
    this.velocity.x += (this.wish.x * speed - this.velocity.x) * accel;
    this.velocity.y += (this.wish.y * speed - this.velocity.y) * accel;
    this.velocity.z += (this.wish.z * speed - this.velocity.z) * accel;
    this.position.addScaledVector(this.velocity, dt);
    this.resolveCollisions();

    this.bobTime += dt;
    this.applyCamera();
  }

  private resolveCollisions(): void {
    const p = this.position;
    const radius = 0.9;
    for (const c of this.colliders) {
      const dx = p.x - c.center.x, dy = p.y - c.center.y, dz = p.z - c.center.z;
      const min = c.radius + radius;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 < min * min) {
        const d = Math.sqrt(d2) || 0.0001;
        const push = (min - d) / d;
        p.x += dx * push;
        p.y += dy * push;
        p.z += dz * push;
        // 移除朝向岩石的速度分量（沿表面滑動）
        const nx = dx / d, ny = dy / d, nz = dz / d;
        const vn = this.velocity.x * nx + this.velocity.y * ny + this.velocity.z * nz;
        if (vn < 0) {
          this.velocity.x -= vn * nx;
          this.velocity.y -= vn * ny;
          this.velocity.z -= vn * nz;
        }
      }
    }
    // 邊界
    const r = Math.hypot(p.x, p.z);
    if (r > WORLD.boundsRadius) {
      p.x *= WORLD.boundsRadius / r;
      p.z *= WORLD.boundsRadius / r;
    }
    const floor = terrainHeight(p.x, p.z) + WORLD.floorClearance;
    if (p.y < floor) {
      p.y = floor;
      if (this.velocity.y < 0) this.velocity.y = 0;
    }
    if (p.y > WORLD.ceilingY) {
      p.y = WORLD.ceilingY;
      if (this.velocity.y > 0) this.velocity.y = 0;
    }
  }

  applyCamera(): void {
    const bob = Math.sin(this.bobTime * 1.1) * 0.04;
    this.camera.position.set(this.position.x, this.position.y + bob, this.position.z);
    this.camera.rotation.set(this.pitch, this.yaw, Math.sin(this.bobTime * 0.7) * 0.006, 'YXZ');
  }

  /** 是否正在移動（供 UI 判斷） */
  get speed(): number {
    return this.velocity.length();
  }

  pressKey(code: string, down: boolean): void {
    if (down) this.keys.add(code);
    else this.keys.delete(code);
  }
}
