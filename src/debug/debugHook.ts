import type { KnowledgeId } from '../data/knowledge';
import type { Game } from '../core/Game';
import * as THREE from 'three';
import type { QualityLevel } from '../core/Quality';
import { terrainHeight } from '../scene/Terrain';

declare global {
  interface Window {
    __oceanDebug?: ReturnType<typeof createDebugApi>;
  }
}

function createDebugApi(game: Game) {
  return {
    /** 目前遊戲狀態 */
    state: () => game.state,
    progress: () => `${game.missions.completedCount}/${game.missions.total}`,
    missions: () => game.missions.list.map((m) => ({ id: m.id, completed: m.completed })),
    currentTarget: () => game.interactions.current?.id ?? null,
    habitat: () => game.ocean.habitat.counts,
    recordedSites: () => game.ocean.conservation.entries.filter(({ beacon }) => beacon.visible).map(({ id }) => id),
    bottleVisible: () => game.ocean.bottle.group.visible && !game.ocean.bottle.cleaned,
    teleport: (t: KnowledgeId | 'bottle' | 'start') => game.debugTeleport(t),
    interact: () => game.tryInteract(),
    playerPosition: () => game.player.position.toArray().map((v) => +v.toFixed(2)),
    view: () => ({ yaw: +game.player.yaw.toFixed(3), pitch: +game.player.pitch.toFixed(3) }),
    /** 玩家距離海底的高度 */
    groundClearance: () => {
      const p = game.player.position;
      return +(p.y - terrainHeight(p.x, p.z)).toFixed(2);
    },
    /** 直接設定位置（仍會經過碰撞與邊界限制） */
    teleportRaw: (x: number, y: number, z: number) => game.player.teleport(new THREE.Vector3(x, y, z)),
    /** 直接完成所有任務（測試結束畫面用） */
    completeAll: () => {
      for (const mission of game.missions.list) {
        game.missions.complete(mission.id);
        game.ocean.conservation.record(mission.target);
      }
      game.ocean.bottle.clean();
    },
    look: (yaw: number, pitch: number) => {
      game.player.yaw = yaw;
      game.player.pitch = pitch;
    },
    fps: () => ({ fps: +game.fps.fps.toFixed(1), frameMs: +game.fps.frameMs.toFixed(2), worstMs: +game.fps.worstMs.toFixed(1) }),
    renderer: () => game.ocean.getRendererInfo(),
    quality: () => game.ocean.quality.level,
    setQuality: (q: QualityLevel) => game.setQuality(q),
    isTouch: () => game.isTouch,
  };
}

/** 只在開發模式或網址加上 ?debug=1 時開放，方便自動化測試。 */
export function installDebugHook(game: Game): void {
  const params = new URLSearchParams(location.search);
  if (!import.meta.env.DEV && !params.has('debug')) return;
  window.__oceanDebug = createDebugApi(game);
}
