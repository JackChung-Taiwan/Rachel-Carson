import * as THREE from 'three';
import { OceanScene } from '../scene/OceanScene';
import { PlayerController } from '../player/PlayerController';
import { TouchControls } from '../player/TouchControls';
import { InteractionManager } from '../interactions/InteractionManager';
import { MissionManager } from '../missions/MissionManager';
import { GameUI } from '../ui/GameUI';
import { KNOWLEDGE, type KnowledgeId } from '../data/knowledge';
import { DIALOGUE } from '../data/dialogue';
import { WORLD } from '../data/worldLayout';
import { isTouchDevice, loadQuality, saveQuality, type QualityLevel } from './Quality';
import { FpsMeter } from './FpsMeter';
import type { BonusSpecies } from '../scene/BonusHabitat';
import { Ambience } from '../audio/Ambience';

export type GameState = 'home' | 'intro' | 'playing' | 'card' | 'paused' | 'ended' | 'habitat';

/**
 * 遊戲主流程：狀態機、主迴圈、輸入整合、任務與介面串接。
 */
export class Game {
  readonly ocean: OceanScene;
  readonly player: PlayerController;
  readonly interactions = new InteractionManager();
  readonly missions = new MissionManager();
  readonly ui: GameUI;
  readonly touch: TouchControls;
  readonly fps = new FpsMeter();
  private readonly ambience: Ambience;
  readonly isTouch: boolean;
  state: GameState = 'home';

  private clock = new THREE.Clock();
  private suppressPauseOnUnlock = false;
  private intro = { t: -1, from: new THREE.Vector3(), fromYaw: 0, fromPitch: 0 };
  private showFps: boolean;
  private tmpV = new THREE.Vector3();
  private endTimer = 0;
  private running = false;
  private pausedAt = 0;

  constructor(container: HTMLElement) {
    this.isTouch = isTouchDevice();
    const params = new URLSearchParams(location.search);
    this.showFps = params.has('fps');
    const quality = loadQuality();
    this.ocean = new OceanScene(container, quality);
    const canvas = this.ocean.renderer.domElement;
    this.player = new PlayerController(this.ocean.camera, canvas);
    this.player.setColliders(this.ocean.terrain.colliders);
    this.player.reset();
    this.ambience = new Ambience(() => this.ocean.camera.position);

    this.ui = new GameUI(
      {
        onStart: () => {
          this.ambience.start();
          this.startIntro();
        },
        onAudioToggle: () => this.toggleAudio(),
        onHabitat: () => this.openHabitat(),
        onHabitatClose: () => this.closeHabitat(),
        onAddLife: (species) => this.addLife(species),
        onCardAction: (id) => this.cardAction(id),
        onCardClose: () => this.closeCard(),
        onRestart: () => this.restart(),
        onFreeExplore: () => this.freeExplore(),
        onResume: () => this.resume(),
        onHome: () => this.goHome(),
        onQualityChange: (q) => this.setQuality(q),
        onMenu: () => this.pause(),
        onModalClosed: () => {
          if (this.state === 'paused' && !this.ui.pauseVisible) this.ui.showPause(true);
        },
      },
      this.isTouch,
    );
    this.ui.setQuality(quality);
    this.ui.setAudio(this.ambience.muted, this.ambience.available);
    this.touch = new TouchControls(document.getElementById('touch-controls')!, this.player, () => this.tryInteract());

    // 互動目標
    const { turtle, bottle } = this.ocean;
    this.interactions.register({
      id: 'turtle',
      center: turtle.hitCenter,
      radius: turtle.hitRadius,
      rayRange: 11,
      proximity: 4.5,
      isEnabled: () => true,
    });
    this.interactions.register({
      id: 'plastic-bottle',
      center: bottle.hitCenter,
      radius: bottle.hitRadius,
      rayRange: 9,
      proximity: 4,
      isEnabled: () => !bottle.cleaned,
    });

    for (const site of this.ocean.conservation.entries) {
      this.interactions.register({
        id: site.id,
        center: site.center,
        radius: 1.7,
        rayRange: 9,
        proximity: 4,
        isEnabled: () => this.missions.current?.target === site.id,
      });
    }

    this.missions.onChange((list) => this.ui.renderMissions(list, this.missions.progressText));
    this.missions.onAllCompleted(() => {
      this.endTimer = window.setTimeout(() => this.showEnd(), 2600);
    });

    this.bindInput(canvas);
    window.addEventListener('resize', () => this.ocean.resize());
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.ui.showWebGLError('WebGL context lost（顯示卡資源不足或驅動程式重新啟動）。');
    });
  }

  start(): void {
    this.ui.hideLoading();
    this.ui.showHome(true);
    this.running = true;
    this.clock.start();
    this.ocean.renderer.setAnimationLoop(() => this.frame());
  }

  // ---------------- 輸入 ----------------
  private bindInput(canvas: HTMLCanvasElement): void {
    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyB' && !e.repeat && !e.ctrlKey && !e.altKey && !e.metaKey) this.openHabitat();
      if (e.code === 'KeyM' && !e.repeat && !e.ctrlKey && !e.altKey && !e.metaKey) this.toggleAudio();
      if (e.code === 'KeyF' && !e.repeat) {
        if (this.state === 'playing') this.tryInteract();
        else if (this.state === 'card') {
          // F 也可以關閉/完成卡片之外，避免誤觸：不處理
        }
      }
      if (e.code === 'Escape') {
        if (this.state === 'habitat') this.closeHabitat();
        else if (this.state === 'card') this.closeCard();
        else if (this.ui.modalOpen) this.ui.closeModals();
        else if (this.state === 'playing') this.pause();
        else if (this.state === 'paused' && performance.now() - this.pausedAt > 400) this.resume();
      }
      if (e.code === 'Enter' && this.state === 'intro' && this.intro.t < 0) this.beginPlaying();
    });
    canvas.addEventListener('click', () => {
      if (this.state === 'playing') this.ambience.start();
      if (this.state === 'playing' && !this.isTouch && !this.player.isPointerLocked) this.requestLock();
    });
    document.addEventListener('pointerlockchange', () => {
      const locked = this.player.isPointerLocked;
      document.body.classList.toggle('pointer-locked', locked);
      if (!locked && this.state === 'playing' && !this.suppressPauseOnUnlock) this.pause();
      this.suppressPauseOnUnlock = false;
    });
    document.addEventListener('pointerlockerror', () => {
      /* 某些環境（例如 iframe 或自動化測試）不允許鎖定滑鼠，改用拖曳轉視角 */
    });
  }

  private toggleAudio(): void {
    this.ambience.toggle();
    this.ui.setAudio(this.ambience.muted, this.ambience.available);
  }

  private requestLock(): void {
    if (this.isTouch) return;
    const canvas = this.ocean.renderer.domElement;
    try {
      const r = canvas.requestPointerLock() as unknown as Promise<void> | undefined;
      if (r && typeof r.catch === 'function') r.catch(() => undefined);
    } catch {
      /* 不支援時以拖曳轉視角 */
    }
  }

  private releaseLock(): void {
    if (this.player.isPointerLocked) {
      this.suppressPauseOnUnlock = true;
      document.exitPointerLock();
    }
  }

  // ---------------- 流程 ----------------
  private startIntro(): void {
    this.ui.showHome(false);
    this.ui.showHUD(true);
    this.state = 'intro';
    this.player.enabled = false;
    // 從首頁鏡頭平滑移到起點
    this.intro.t = 0;
    this.intro.from.copy(this.ocean.camera.position);
    const e = new THREE.Euler().setFromQuaternion(this.ocean.camera.quaternion, 'YXZ');
    this.intro.fromYaw = e.y;
    this.intro.fromPitch = e.x;
    this.player.reset();
    this.ui.showDialog(DIALOGUE.intro, {
      buttons: [{ label: '出發探索', primary: true, onClick: () => this.beginPlaying() }],
    });
  }

  private beginPlaying(): void {
    if (this.state !== 'intro') return;
    this.intro.t = -1;
    this.player.reset();
    this.state = 'playing';
    this.player.enabled = true;
    this.touch.setVisible(this.isTouch);
    this.requestLock();
    this.ui.showDialog(this.isTouch ? DIALOGUE.firstHintTouch : DIALOGUE.firstHintDesktop, { autoHideMs: 12000 });
  }

  tryInteract(): void {
    if (this.state !== 'playing') return;
    const target = this.interactions.current;
    if (!target) {
      this.ui.toast('附近沒有可以互動的目標，靠近一點試試看。', 2200, 'info');
      return;
    }
    this.openCard(target.id);
  }

  openCard(id: KnowledgeId): void {
    const mission = this.missions.byTarget(id);
    this.state = 'card';
    this.player.enabled = false;
    this.player.velocity.multiplyScalar(0.2);
    this.releaseLock();
    if (id === 'turtle') this.ocean.turtle.setPaused(true);
    this.ui.setPrompt(null);
    this.ui.showCard(KNOWLEDGE[id], mission?.completed ?? false);
  }

  private closeCard(): void {
    this.ui.hideCard();
    this.ocean.turtle.setPaused(false);
    if (this.state === 'card') {
      this.state = 'playing';
      this.player.enabled = true;
      this.requestLock();
    }
  }

  private cardAction(id: KnowledgeId): void {
    if (id === 'turtle') {
      const changed = this.missions.complete('observe-turtle');
      this.closeCard();
      if (changed) {
        this.ui.toast(`任務完成：海洋生物觀察員　${this.missions.progressText}`, 3000);
        if (!this.missions.allCompleted) this.ui.showDialog(DIALOGUE.afterTurtle, { autoHideMs: 11000 });
      }
    } else if (id === 'plastic-bottle') {
      const bottle = this.ocean.bottle;
      if (bottle.cleaned) return this.closeCard();
      bottle.clean();
      this.ocean.cleanupEffect.play(bottle.hitCenter);
      this.missions.complete('clean-plastic');
      this.closeCard();
      this.ui.toast(`清理完成！塑膠瓶已從海底移除　${this.missions.progressText}`, 3000);
      if (!this.missions.allCompleted) this.ui.showDialog(DIALOGUE.afterBottle, { autoHideMs: 9000 });
    } else {
      const mission = this.missions.current;
      if (!mission || mission.target !== id || !this.missions.complete(mission.id)) return;
      this.ocean.conservation.record(id);
      this.closeCard();
      this.ui.toast(`任務完成：${mission.title}　${this.missions.progressText}`, 3000);
      const nextHint = id === 'ghost-net' ? DIALOGUE.afterNet : id === 'coral-survey' ? DIALOGUE.afterCoral : null;
      if (nextHint) this.ui.showDialog(nextHint, { autoHideMs: 10500 });
    }
    if (this.missions.allCompleted) {
      this.ui.hideDialog();
      window.setTimeout(() => this.ui.toast('恭喜！你完成了所有海洋守護任務！', 2600, 'celebrate'), 1500);
    }
  }

  private showEnd(): void {
    if (!this.missions.allCompleted) return;
    if (this.state === 'card') this.ui.hideCard();
    this.state = 'ended';
    this.player.enabled = false;
    this.releaseLock();
    this.touch.setVisible(false);
    this.ui.setPrompt(null);
    this.ui.showPause(false);
    this.ui.showEnd(true);
  }

  private freeExplore(): void {
    this.ui.showEnd(false);
    this.state = 'playing';
    this.player.enabled = true;
    this.touch.setVisible(this.isTouch);
    this.requestLock();
    this.ui.showDialog('觀察站已解鎖！點右側的魚形按鈕（電腦也可按 B），加入魚群、魟魚或大型石斑魚，看看牠們怎麼互動。', { autoHideMs: 9000 });
    this.ui.setHabitatUnlocked(true);
  }

  restart(): void {
    window.clearTimeout(this.endTimer);
    this.ui.showEnd(false);
    this.ui.showPause(false);
    this.ui.hideCard();
    this.ui.closeModals();
    this.ui.showPause(false);
    this.missions.reset();
    this.ocean.bottle.reset();
    this.ocean.conservation.reset();
    this.ocean.habitat.reset();
    this.ui.showHabitat(false);
    this.ui.setHabitatUnlocked(false);
    this.ocean.turtle.setPaused(false);
    this.touch.setVisible(false);
    this.ui.showHUD(true);
    this.state = 'intro';
    this.intro.t = -1;
    this.player.enabled = false;
    this.player.reset();
    this.ui.showDialog(DIALOGUE.intro, {
      buttons: [{ label: '出發探索', primary: true, onClick: () => this.beginPlaying() }],
    });
  }

  pause(): void {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.pausedAt = performance.now();
    this.player.enabled = false;
    this.releaseLock();
    this.ui.showPause(true);
  }

  resume(): void {
    if (this.state !== 'paused') return;
    this.ui.showPause(false);
    this.state = 'playing';
    this.player.enabled = true;
    this.requestLock();
  }

  goHome(): void {
    window.clearTimeout(this.endTimer);
    this.releaseLock();
    this.ui.showPause(false);
    this.ui.showEnd(false);
    this.ui.hideCard();
    this.ui.hideDialog();
    this.ui.showHUD(false);
    this.touch.setVisible(false);
    this.missions.reset();
    this.ocean.bottle.reset();
    this.ocean.conservation.reset();
    this.ocean.habitat.reset();
    this.ui.showHabitat(false);
    this.ui.setHabitatUnlocked(false);
    this.player.enabled = false;
    this.state = 'home';
    this.ui.showHome(true);
  }

  private openHabitat(): void {
    if (!this.missions.allCompleted || !['playing', 'ended', 'paused'].includes(this.state)) return;
    if (this.state === 'ended') {
      this.ui.showEnd(false);
      this.ui.showHUD(true);
      this.ui.setHabitatUnlocked(true);
    }
    this.ui.showPause(false);
    this.state = 'habitat';
    this.player.enabled = false;
    this.player.velocity.set(0, 0, 0);
    this.releaseLock();
    this.ui.hideDialog();
    this.ui.setPrompt(null);
    this.ui.setTargetMarker({ visible: false });
    this.touch.setVisible(false);
    this.ui.renderHabitat(this.ocean.habitat);
    this.ui.showHabitat(true);
  }

  private closeHabitat(): void {
    if (this.state !== 'habitat') return;
    this.ui.showHabitat(false);
    this.state = 'playing';
    this.player.enabled = true;
    this.touch.setVisible(this.isTouch);
    this.requestLock();
  }

  private addLife(species: BonusSpecies): void {
    if (this.state !== 'habitat' || !this.missions.allCompleted) return;
    this.ocean.habitat.add(species, this.ocean.camera);
    this.ui.renderHabitat(this.ocean.habitat);
  }

  setQuality(q: QualityLevel): void {
    saveQuality(q);
    this.ocean.setQuality(q);
    this.ui.setQuality(q);
  }

  // ---------------- 主迴圈 ----------------
  private frame(): void {
    if (!this.running) return;
    const dt = Math.min(this.clock.getDelta(), 0.25);
    this.fps.tick(dt);
    const sdt = Math.min(dt, 0.05);
    const cam = this.ocean.camera;

    if (this.state === 'home') {
      // 首頁：緩慢環繞的電影鏡頭
      const t = this.ocean.elapsed * 0.05;
      cam.position.set(Math.sin(t) * 6, -13 + Math.sin(t * 1.7) * 1.2, 38 + Math.cos(t) * 4);
      this.tmpV.set(Math.sin(t * 0.7) * 8, -15, 0);
      cam.lookAt(this.tmpV);
    } else if (this.state === 'intro' && this.intro.t >= 0) {
      this.intro.t = Math.min(this.intro.t + sdt / 1.6, 1);
      const k = this.intro.t * this.intro.t * (3 - 2 * this.intro.t);
      const s = WORLD.start;
      cam.position.lerpVectors(this.intro.from, this.tmpV.set(s.x, s.y, s.z), k);
      cam.rotation.set(
        THREE.MathUtils.lerp(this.intro.fromPitch, s.pitch, k),
        THREE.MathUtils.lerp(this.intro.fromYaw, s.yaw, k),
        0,
        'YXZ',
      );
    } else {
      // 低 FPS 時分段更新，避免移動變慢或穿越碰撞
      let remain = dt;
      while (remain > 1e-4) {
        const step = Math.min(remain, 1 / 30);
        this.player.update(step);
        remain -= step;
      }
    }

    this.ocean.update(sdt, this.state === 'playing' || this.state === 'habitat');
    if (this.missions.allCompleted) this.ui.renderHabitat(this.ocean.habitat);

    if (this.state === 'playing') {
      const target = this.interactions.update(cam);
      this.ui.setPrompt(target ? target.id : null);
      this.ui.setCrosshairActive(!!target);
      this.ui.setLockHint(!this.isTouch && !this.player.isPointerLocked && !this.ui.dialogVisible);
      this.updateTargetMarker(!!target);
    } else {
      this.ui.setLockHint(false);
      this.ui.setTargetMarker({ visible: false });
    }

    this.ocean.render();
    if (this.showFps) {
      const info = this.ocean.getRendererInfo();
      this.ui.setFPS(`${this.fps.fps.toFixed(0)} FPS · ${this.fps.frameMs.toFixed(1)} ms · ${info.size} · ${this.ocean.quality.level}`);
    }
  }

  private updateTargetMarker(hasTarget: boolean): void {
    const m = this.missions.current;
    if (!m || hasTarget) {
      this.ui.setTargetMarker({ visible: false });
      return;
    }
    const it = this.interactions.get(m.target);
    if (!it || !it.isEnabled()) {
      this.ui.setTargetMarker({ visible: false });
      return;
    }
    const cam = this.ocean.camera;
    const dist = it.center.distanceTo(cam.position);
    const p = this.tmpV.copy(it.center).project(cam);
    const w = window.innerWidth, h = window.innerHeight;
    const behind = p.z > 1;
    let x = (p.x * 0.5 + 0.5) * w;
    let y = (-p.y * 0.5 + 0.5) * h;
    const margin = 70;
    const onScreen = !behind && x > margin && x < w - margin && y > margin && y < h - margin;
    let angle = 0;
    if (!onScreen) {
      let dx = x - w / 2, dy = y - h / 2;
      if (behind) {
        dx = -dx;
        dy = -dy;
        if (Math.abs(dx) < 1 && Math.abs(dy) < 1) dy = 1;
      }
      angle = Math.atan2(dy, dx);
      const sx = (w / 2 - margin) / Math.max(Math.abs(Math.cos(angle)), 1e-3);
      const sy = (h / 2 - margin) / Math.max(Math.abs(Math.sin(angle)), 1e-3);
      const r = Math.min(sx, sy);
      x = w / 2 + Math.cos(angle) * r;
      y = h / 2 + Math.sin(angle) * r;
    }
    const name = KNOWLEDGE[m.target].name === '海洋塑膠垃圾' ? '塑膠瓶' : KNOWLEDGE[m.target].name;
    this.ui.setTargetMarker({ visible: true, x, y, onScreen, angle, label: `${name} ${Math.round(dist)} 公尺` });
  }

  // ---------------- 除錯 / 自動化測試 ----------------
  debugTeleport(target: KnowledgeId | 'bottle' | 'start'): void {
    if (target === 'start') {
      this.player.reset();
      return;
    }
    const it = this.interactions.get(target === 'bottle' ? 'plastic-bottle' : target)!;
    const c = it.center;
    const from = this.tmpV.copy(this.ocean.camera.position).sub(c).setY(0);
    if (from.lengthSq() < 1e-3) from.set(0, 0, 1);
    from.normalize().multiplyScalar(target === 'turtle' ? 5.5 : 4.2);
    const pos = new THREE.Vector3(c.x + from.x, c.y + (target === 'turtle' ? 1.2 : 2.2), c.z + from.z);
    this.player.teleport(pos, c.clone());
  }
}
