import * as THREE from 'three';
import { fishGeometry, mantaGeometry } from './SeaLife';
import { terrainHeight } from './Terrain';
import { patchMaterial } from './shaders/patchMaterial';

export type BonusSpecies = 'reef-fish' | 'silver-fish' | 'ray' | 'grouper';
export const HABITAT_LIMITS = { fish: 72, rays: 3, groupers: 2 } as const;

interface Fish {
  position: THREE.Vector3;
  home: THREE.Vector3;
  phase: number;
  active: boolean;
}

interface Visitor {
  mesh: THREE.Group;
  home: THREE.Vector3;
  phase: number;
  cooldown: number;
}

/** A small, bounded observation model. Predators only hunt player-added fish. */
export class BonusHabitat {
  readonly group = new THREE.Group();
  private readonly fish: Fish[] = [];
  private readonly rays: Visitor[] = [];
  private readonly groupers: Visitor[] = [];
  private readonly school: THREE.InstancedMesh;
  private readonly ring: THREE.Mesh;
  private readonly transform = new THREE.Object3D();
  private readonly direction = new THREE.Vector3();
  private readonly destination = new THREE.Vector3();
  private readonly mouth = new THREE.Vector3();
  private readonly desiredRotation = new THREE.Quaternion();
  private readonly rayGeometry = mantaGeometry();
  private readonly rayMaterial = patchMaterial(new THREE.MeshStandardMaterial({
    vertexColors: true, side: THREE.DoubleSide, roughness: 0.7,
  }), { wingFlap: { amp: 0.35, speed: 1.5 } });
  private readonly grouperGeometry: THREE.BufferGeometry;
  private readonly grouperMaterial: THREE.MeshStandardMaterial;
  private readonly eyeGeometry = new THREE.SphereGeometry(0.09, 10, 8);
  private readonly eyeMaterial = new THREE.MeshStandardMaterial({ color: 0x081c24, roughness: 0.2 });
  private readonly mouthGeometry = new THREE.TorusGeometry(0.22, 0.045, 6, 16);
  private readonly mouthMaterial = new THREE.MeshStandardMaterial({ color: 0xc2bd91 });
  private time = 0;
  private ringAge = 10;
  catches = 0;

  constructor() {
    const geometry = fishGeometry();
    const phases = Float32Array.from({ length: HABITAT_LIMITS.fish }, () => Math.random());
    geometry.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phases, 1));
    this.school = new THREE.InstancedMesh(geometry, patchMaterial(
      new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.42, metalness: 0.15 }),
      { fishWiggle: { amp: 0.12, speed: 9 } },
    ), HABITAT_LIMITS.fish);
    this.school.count = 0;
    this.school.frustumCulled = false;
    this.school.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.group.add(this.school);

    this.grouperGeometry = fishGeometry();
    this.grouperGeometry.scale(6.2, 3.6, 4.7);
    this.grouperMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, color: 0x83b8a9, roughness: 0.6, side: THREE.DoubleSide });
    this.grouperMaterial.onBeforeCompile = (shader) => {
      shader.vertexShader = 'varying vec3 habitatPosition;\n' + shader.vertexShader.replace(
        '#include <begin_vertex>', '#include <begin_vertex>\nhabitatPosition = position;\ntransformed.x += sin(position.z * 2.4 + 1.5) * 0.03;',
      );
      shader.fragmentShader = 'varying vec3 habitatPosition;\n' + shader.fragmentShader.replace(
        '#include <color_fragment>', '#include <color_fragment>\nvec3 spots = sin(habitatPosition * vec3(13.,18.,11.));\ndiffuseColor.rgb *= 0.72 + 0.28 * smoothstep(-0.45,0.25,spots.x*spots.y*spots.z);',
      );
    };
    this.ring = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.035, 6, 24), new THREE.MeshBasicMaterial({
      color: 0xb9fce9, transparent: true, opacity: 0, depthWrite: false,
    }));
    this.ring.visible = false;
    this.group.add(this.ring);
  }

  get counts() {
    return { fish: this.fish.filter((fish) => fish.active).length, rays: this.rays.length, groupers: this.groupers.length, catches: this.catches };
  }

  canAdd(species: BonusSpecies): boolean {
    const counts = this.counts;
    if (species === 'ray') return counts.rays < HABITAT_LIMITS.rays;
    if (species === 'grouper') return counts.groupers < HABITAT_LIMITS.groupers;
    return counts.fish < HABITAT_LIMITS.fish;
  }

  add(species: BonusSpecies, camera: THREE.Camera): number {
    if (!this.canAdd(species)) return 0;
    camera.getWorldDirection(this.direction);
    const home = camera.position.clone().addScaledVector(this.direction, species === 'grouper' ? 11 : 8);
    // Leave plenty of room for each animal's swim radius, above the seabed.
    const horizontal = Math.hypot(home.x, home.z);
    if (horizontal > 76) { home.x *= 76 / horizontal; home.z *= 76 / horizontal; }
    home.y = THREE.MathUtils.clamp(home.y, terrainHeight(home.x, home.z) + 5, -6);
    if (species === 'ray' || species === 'grouper') {
      const mesh = new THREE.Group();
      if (species === 'ray') {
        mesh.add(new THREE.Mesh(this.rayGeometry, this.rayMaterial));
        mesh.scale.setScalar(0.8);
      } else {
        mesh.add(new THREE.Mesh(this.grouperGeometry, this.grouperMaterial));
        for (const side of [-1, 1]) {
          const eye = new THREE.Mesh(this.eyeGeometry, this.eyeMaterial);
          eye.position.set(side * 0.35, 0.2, 1.58);
          mesh.add(eye);
        }
        const mouth = new THREE.Mesh(this.mouthGeometry, this.mouthMaterial);
        mouth.position.set(0, -0.08, 2.35);
        mesh.add(mouth);
      }
      mesh.position.copy(home);
      const visitor = { mesh, home, phase: Math.random() * Math.PI * 2, cooldown: 3 };
      (species === 'ray' ? this.rays : this.groupers).push(visitor);
      this.group.add(mesh);
      return 1;
    }
    const amount = Math.min(12, HABITAT_LIMITS.fish - this.counts.fish);
    const color = new THREE.Color(species === 'reef-fish' ? 0xffbc55 : 0xb8eeff);
    for (let i = 0; i < amount; i++) {
      let index = this.fish.findIndex((fish) => !fish.active);
      if (index < 0) index = this.fish.length;
      this.fish[index] = { position: home.clone().add(new THREE.Vector3((Math.random() - 0.5) * 4, Math.random() - 0.5, (Math.random() - 0.5) * 4)), home: home.clone(), phase: Math.random() * Math.PI * 2, active: true };
      this.school.setColorAt(index, color);
    }
    this.school.count = this.fish.length;
    if (this.school.instanceColor) this.school.instanceColor.needsUpdate = true;
    this.update(0);
    return amount;
  }

  update(dt: number): void {
    if (!this.school.count && !this.rays.length && !this.groupers.length) return;
    this.time += dt;
    const t = this.time;
    const step = Math.min(dt, 0.05);
    for (const fish of this.fish) {
      if (!fish.active) continue;
      const a = t * 0.6 + fish.phase;
      this.destination.set(fish.home.x + Math.cos(a) * 3, fish.home.y + Math.sin(a * 1.4) * 0.8, fish.home.z + Math.sin(a) * 3);
      for (const predator of this.groupers) {
        this.direction.copy(fish.position).sub(predator.mesh.position);
        const distance = this.direction.length();
        if (distance < 6 && distance > 0.001) this.destination.addScaledVector(this.direction, (6 - distance) * 0.6 / distance);
      }
      this.direction.copy(this.destination).sub(fish.position).clampLength(0, 3.5 * step);
      fish.position.add(this.direction);
      fish.position.y = Math.max(fish.position.y, terrainHeight(fish.position.x, fish.position.z) + 1.5);
    }
    for (const predator of this.groupers) {
      predator.cooldown -= step;
      let prey: Fish | undefined;
      let nearest = 26 * 26;
      if (predator.cooldown <= 0) {
        for (const fish of this.fish) {
          if (!fish.active) continue;
          const distance = fish.position.distanceToSquared(predator.mesh.position);
          if (distance < nearest) { nearest = distance; prey = fish; }
        }
      }
      this.destination.copy(prey?.position ?? predator.home);
      if (!prey) this.destination.add(new THREE.Vector3(Math.cos(t * 0.26 + predator.phase) * 4, Math.sin(t * 0.5) * 0.5, Math.sin(t * 0.26 + predator.phase) * 4));
      this.direction.copy(this.destination).sub(predator.mesh.position);
      if (this.direction.lengthSq() > 0.001) {
        this.direction.normalize();
        this.desiredRotation.setFromUnitVectors(new THREE.Vector3(0, 0, 1), this.direction);
        predator.mesh.quaternion.slerp(this.desiredRotation, 1 - Math.exp(-step * 2.5));
        predator.mesh.position.addScaledVector(this.direction, step * (prey ? 4.8 : 1.8));
      }
      predator.mesh.position.y = Math.max(predator.mesh.position.y, terrainHeight(predator.mesh.position.x, predator.mesh.position.z) + 2);
      predator.mesh.children[0].rotation.y = Math.sin(t * (prey ? 7 : 3) + predator.phase) * 0.045;
      this.mouth.set(0, 0, 2.3).applyQuaternion(predator.mesh.quaternion).add(predator.mesh.position);
      if (prey && this.mouth.distanceTo(prey.position) < 1.15) {
        prey.active = false;
        predator.cooldown = 6;
        this.catches++;
        this.ring.position.copy(prey.position);
        this.ring.rotation.copy(predator.mesh.rotation);
        this.ringAge = 0;
      }
    }
    for (const visitor of this.rays) {
      const a = t * 0.28 + visitor.phase;
      visitor.mesh.position.set(visitor.home.x + Math.cos(a) * 4, visitor.home.y + Math.sin(t * 0.6 + visitor.phase) * 0.7, visitor.home.z + Math.sin(a) * 4);
      visitor.mesh.position.y = Math.max(visitor.mesh.position.y, terrainHeight(visitor.mesh.position.x, visitor.mesh.position.z) + 2);
      visitor.mesh.rotation.set(0, -a, Math.sin(t * 0.8 + visitor.phase) * 0.1);
    }
    this.fish.forEach((fish, index) => {
      this.transform.position.copy(fish.position);
      this.transform.rotation.set(0, -t * 0.6 - fish.phase, Math.sin(t * 3 + fish.phase) * 0.12);
      this.transform.scale.setScalar(fish.active ? 0.8 : 0);
      this.transform.updateMatrix();
      this.school.setMatrixAt(index, this.transform.matrix);
    });
    this.school.instanceMatrix.needsUpdate = true;
    this.ringAge += step;
    this.ring.visible = this.ringAge < 0.8;
    this.ring.scale.setScalar(1 + this.ringAge * 1.8);
    (this.ring.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 1 - this.ringAge / 0.8);
  }

  reset(): void {
    for (const visitor of [...this.rays, ...this.groupers]) this.group.remove(visitor.mesh);
    this.rays.length = 0;
    this.groupers.length = 0;
    this.fish.length = 0;
    this.school.count = 0;
    this.catches = 0;
    this.ring.visible = false;
    this.ringAge = 10;
    this.time = 0;
  }
}
