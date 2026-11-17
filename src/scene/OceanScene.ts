import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { QUALITY_PRESETS, type QualityLevel, type QualitySettings } from '../core/Quality';
import { installUnderwaterFog } from './shaders/installFog';
import { globalUniforms } from './shaders/uniforms';
import { OceanEnvironment } from './OceanEnvironment';
import { SeabedTerrain } from './Terrain';
import { Vegetation } from './Vegetation';
import { SeaLife } from './SeaLife';
import { Turtle } from './Turtle';
import { PlasticBottle } from './PlasticBottle';
import { CleanupEffect } from './CleanupEffect';

/**
 * 3D 海洋場景總管：Renderer、後製、場景物件，以及依畫質重建可變內容。
 */
export class OceanScene {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly terrain: SeabedTerrain;
  readonly turtle: Turtle;
  readonly bottle: PlasticBottle;
  readonly cleanupEffect = new CleanupEffect();
  quality: QualitySettings;

  private composer!: EffectComposer;
  private bloom: UnrealBloomPass | null = null;
  private environment!: OceanEnvironment;
  private vegetation!: Vegetation;
  private sealife!: SeaLife;
  private time = 0;

  constructor(private readonly container: HTMLElement, level: QualityLevel) {
    installUnderwaterFog();
    this.quality = QUALITY_PRESETS[level];
    this.renderer = new THREE.WebGLRenderer({
      antialias: false,
      powerPreference: 'high-performance',
      alpha: false,
      stencil: false,
    });
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.info.autoReset = false;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.domElement.id = 'game-canvas';
    this.renderer.domElement.setAttribute('aria-label', '3D 海底探索畫面');
    container.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(68, 1, 0.1, 520);
    this.scene.fog = new THREE.FogExp2(0x0a4a6a, globalUniforms.uFogDensity.value);
    this.scene.background = new THREE.Color(0x02101e);

    this.terrain = new SeabedTerrain(this.quality.causticLayers, this.quality.level === 'low');
    this.scene.add(this.terrain.group);
    this.turtle = new Turtle();
    this.scene.add(this.turtle.group);
    this.bottle = new PlasticBottle();
    this.scene.add(this.bottle.group);
    this.scene.add(this.cleanupEffect.group);

    this.buildQualityDependent();
    this.resize();
  }

  /** 依畫質建立：環境（光束、粒子、氣泡）、植物、魚群、後製 */
  private buildQualityDependent(): void {
    const q = this.quality;
    this.environment = new OceanEnvironment(q);
    this.scene.add(this.environment.group);
    this.vegetation = new Vegetation(q, this.terrain.colliders);
    this.scene.add(this.vegetation.group);
    this.sealife = new SeaLife(q);
    this.scene.add(this.sealife.group);

    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(Math.max(size.x, 1), Math.max(size.y, 1), {
      type: THREE.HalfFloatType,
      samples: this.renderer.capabilities.isWebGL2 ? q.msaaSamples : 0,
    });
    this.composer = new EffectComposer(this.renderer, rt);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = null;
    if (q.bloom) {
      this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.38, 0.55, 0.82);
      this.composer.addPass(this.bloom);
    }
    this.composer.addPass(new OutputPass());
  }

  setQuality(level: QualityLevel): void {
    if (level === this.quality.level) return;
    this.quality = QUALITY_PRESETS[level];
    this.environment.dispose();
    this.vegetation.dispose();
    this.sealife.dispose();
    this.composer.dispose();
    this.composer.renderTarget1.dispose();
    this.composer.renderTarget2.dispose();
    this.bloom?.dispose();
    this.buildQualityDependent();
    this.resize();
  }

  get pixelRatio(): number {
    const q = this.quality;
    return Math.min(window.devicePixelRatio || 1, q.maxPixelRatio) * q.renderScale;
  }

  resize(): void {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    const pr = this.pixelRatio;
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.composer.setPixelRatio(pr);
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    // 直式手機畫面加寬視角，避免太狹窄
    this.camera.fov = w / h < 0.8 ? 80 : 68;
    this.camera.updateProjectionMatrix();
    this.environment.setPixelRatio(pr);
  }

  getMainSchoolCenter(out: THREE.Vector3): THREE.Vector3 {
    return this.sealife.getMainSchoolCenter(out);
  }

  update(dt: number): void {
    this.time += dt;
    globalUniforms.uTime.value = this.time;
    this.environment.update(this.camera);
    this.sealife.update(this.time, dt);
    this.turtle.update(this.time, dt);
    this.bottle.update(this.time, dt);
    this.cleanupEffect.update(dt);
  }

  render(): void {
    this.renderer.info.reset();
    this.composer.render();
  }

  get elapsed(): number {
    return this.time;
  }

  getRendererInfo(): { calls: number; triangles: number; pixelRatio: number; size: string } {
    const s = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    return {
      calls: this.renderer.info.render.calls,
      triangles: this.renderer.info.render.triangles,
      pixelRatio: this.pixelRatio,
      size: `${s.x}x${s.y}`,
    };
  }
}
