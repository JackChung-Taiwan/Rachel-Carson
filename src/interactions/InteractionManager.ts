import * as THREE from 'three';
import type { KnowledgeId } from '../data/knowledge';

export interface Interactable {
  id: KnowledgeId;
  /** 目前在世界中的中心位置 */
  center: THREE.Vector3;
  /** 射線命中半徑 */
  radius: number;
  /** 準星射線的最大互動距離 */
  rayRange: number;
  /** 不需瞄準、靠近即可互動的距離（手機友善） */
  proximity: number;
  isEnabled: () => boolean;
}

/**
 * 互動偵測：從畫面中央（準星）發出射線，命中可互動物件的包圍球即為目標；
 * 若沒有瞄準任何物件，則選擇「非常靠近且大致在前方」的物件，方便手機與低年級學生操作。
 */
export class InteractionManager {
  private items: Interactable[] = [];
  private ray = new THREE.Ray();
  private sphere = new THREE.Sphere();
  private hit = new THREE.Vector3();
  private dir = new THREE.Vector3();
  current: Interactable | null = null;
  currentDistance = 0;

  register(item: Interactable): void {
    this.items.push(item);
  }

  get(id: KnowledgeId): Interactable | undefined {
    return this.items.find((i) => i.id === id);
  }

  update(camera: THREE.Camera): Interactable | null {
    camera.getWorldDirection(this.dir);
    this.ray.set(camera.position, this.dir);
    let best: Interactable | null = null;
    let bestD = Infinity;
    for (const it of this.items) {
      if (!it.isEnabled()) continue;
      this.sphere.set(it.center, it.radius);
      const p = this.ray.intersectSphere(this.sphere, this.hit);
      if (p) {
        const d = p.distanceTo(camera.position);
        if (d <= it.rayRange && d < bestD) {
          best = it;
          bestD = d;
        }
      }
    }
    if (!best) {
      for (const it of this.items) {
        if (!it.isEnabled()) continue;
        const d = it.center.distanceTo(camera.position);
        if (d > it.proximity + it.radius) continue;
        const to = it.center.clone().sub(camera.position).normalize();
        if (to.dot(this.dir) < 0.2 && d > it.radius + 0.6) continue;
        if (d < bestD) {
          best = it;
          bestD = d;
        }
      }
    }
    this.current = best;
    this.currentDistance = best ? bestD : 0;
    return best;
  }
}
