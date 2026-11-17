import * as THREE from 'three';
import { terrainHeight } from './Terrain';

import { SITE_POSITIONS } from '../data/worldLayout';

function makeNet(group: THREE.Group) {
  const positions: number[] = [];
  const point = (x: number, z: number) =>
    [x, 0.52 + 0.27 * Math.sin(x * 1.8 + z * 2) + 0.12 * z, z];
  for (let x = -2; x <= 2; x += 0.4) {
    for (let z = -1.2; z < 1.19; z += 0.4) {
      positions.push(...point(x, z), ...point(x, z + 0.4));
      if (x < 1.99) positions.push(...point(x, z), ...point(x + 0.4, z));
    }
  }
  const mesh = new THREE.BufferGeometry();
  mesh.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  group.add(new THREE.LineSegments(mesh, new THREE.LineBasicMaterial({ color: 0xeab86e })));
  const float = new THREE.SphereGeometry(0.22, 12, 8);
  const orange = new THREE.MeshStandardMaterial({ color: 0xf48842 });
  for (const x of [-1.8, -0.6, 0.6, 1.8]) {
    const bead = new THREE.Mesh(float, orange);
    bead.position.set(x, point(x, -1.2)[1], -1.2);
    group.add(bead);
  }
}

function makeCorals(group: THREE.Group) {
  for (const [offset, color] of [[-1.25, 0xff857d], [1.25, 0xf6efd9]] as const) {
    const material = new THREE.MeshStandardMaterial({ color, roughness: 0.9 });
    const branch = (from: THREE.Vector3, to: THREE.Vector3, radius: number) => {
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.6, radius, from.distanceTo(to), 8), material);
      stem.position.copy(from).lerp(to, 0.5);
      stem.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize());
      group.add(stem);
    };
    const trunk = new THREE.Vector3(offset, 0.72, 0);
    branch(new THREE.Vector3(offset, 0, 0), trunk, 0.22);
    for (let i = 0; i < 6; i++) {
      const a = i * Math.PI / 3;
      const tip = new THREE.Vector3(offset + Math.cos(a) * 0.66, 1.25 + (i % 3) * 0.16, Math.sin(a) * 0.57);
      branch(trunk, tip, 0.14);
      branch(tip, tip.clone().add(new THREE.Vector3(Math.cos(a + 0.5) * 0.24, 0.37, Math.sin(a + 0.5) * 0.26)), 0.092);
      branch(tip, tip.clone().add(new THREE.Vector3(-Math.cos(a) * 0.2, 0.29, -Math.sin(a) * 0.2)), 0.078);
    }
  }
}

function makeSeagrass(group: THREE.Group) {
  const positions: number[] = [];
  for (let i = 0; i < 88; i++) {
    const a = i * 2.39996;
    const r = 2.6 * Math.sqrt(i / 88);
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const h = 0.45 + (i % 9) * 0.11;
    positions.push(x - 0.09, 0, z, x + 0.09, 0, z, x - 0.11, h * 0.55, z + 0.19,
      x + 0.09, 0, z, x + 0.08, h * 0.55, z + 0.19, x - 0.11, h * 0.55, z + 0.19,
      x - 0.11, h * 0.55, z + 0.19, x + 0.08, h * 0.55, z + 0.19, x - 0.15, h, z + 0.44);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  group.add(new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: 0x53af61, side: THREE.DoubleSide })));
}

export class ConservationSites {
  readonly group = new THREE.Group();
  readonly entries = (['ghost-net', 'coral-survey', 'seagrass-bed'] as const).map((id) => {
    const { x, z } = SITE_POSITIONS[id];
    const station = new THREE.Group();
    station.position.set(x, terrainHeight(x, z), z);
    const build = { 'ghost-net': makeNet, 'coral-survey': makeCorals, 'seagrass-bed': makeSeagrass };
    build[id](station);
    const beacon = new THREE.Group();
    const material = new THREE.MeshStandardMaterial({ color: 0x66ffe3, emissive: 0x258774 });
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.11, 1.15, 8), material);
    const light = new THREE.Mesh(new THREE.OctahedronGeometry(0.29), material);
    stem.position.y = 0.58;
    light.position.y = 1.27;
    beacon.position.set(0, 0, 0.9);
    beacon.add(stem, light);
    beacon.visible = false;
    station.add(beacon);
    this.group.add(station);
    const center = station.position.clone().add(new THREE.Vector3(0, 1.25, 0));
    return { id, center, beacon };
  });

  record(id: string): void {
    const site = this.entries.find((entry) => entry.id === id);
    if (site) site.beacon.visible = true;
  }

  reset(): void {
    this.entries.forEach(({ beacon }) => { beacon.visible = false; });
  }
}
