/**
 * 海底世界的配置資料（座標單位：公尺，海面 y = 0）。
 * 要新增景點或任務目標時，從這裡調整即可。
 */
export const SITE_POSITIONS = {
  'ghost-net': { x: 21, z: -6 },
  'coral-survey': { x: 6, z: -21 },
  'seagrass-bed': { x: -10, z: -30 },
} as const;
export type SiteId = keyof typeof SITE_POSITIONS;

export const WORLD = {
  /** 可游動範圍半徑 */
  boundsRadius: 100,
  /** 玩家最高可到的深度（避免游出海面） */
  ceilingY: -1.6,
  /** 與海底保持的最小距離 */
  floorClearance: 1.3,
  start: { x: 0, y: -14.5, z: 34, yaw: 0, pitch: -0.1 },
  turtlePath: { cx: 1, cy: -15.5, cz: 13, rx: 9, rz: 6.5, speed: 0.085 },
  bottle: { x: 15.5, z: 6.5, rotY: 0.7 },
  arch: { x: -19, z: -6, rotY: 0.95, span: 9, height: 9.5 },
  /** 海帶森林區塊（中心、半徑、密度權重） */
  kelpForests: [
    { x: -4, z: -38, r: 30, w: 1.6 },
    { x: -40, z: 2, r: 20, w: 1.0 },
    { x: 36, z: -18, r: 22, w: 1.0 },
    { x: 26, z: 44, r: 16, w: 0.6 },
    { x: -30, z: 46, r: 16, w: 0.6 },
    { x: 46, z: 22, r: 14, w: 0.45 },
  ],
  /** 珊瑚礁區塊 */
  reefs: [
    { x: 12, z: 4, r: 9, w: 1.2 },
    { x: -15, z: -1, r: 10, w: 1.2 },
    { x: -9, z: 22, r: 8, w: 0.9 },
    { x: 9, z: -16, r: 9, w: 0.9 },
    { x: 24, z: 22, r: 8, w: 0.6 },
  ],
  /** 不放置大型植物/岩石的區域（起點、海龜路徑、垃圾、拱門通道） */
  clearZones: [
    ...Object.values(SITE_POSITIONS).map((point) => ({ ...point, r: 4.4 })),
    { x: 0, z: 34, r: 7 },
    { x: 1, z: 13, r: 12 },
    { x: 15.5, z: 6.5, r: 3.2 },
    { x: -19, z: -6, r: 5.5 },
  ],
} as const;

export function inClearZone(x: number, z: number, pad = 0): boolean {
  for (const c of WORLD.clearZones) {
    const dx = x - c.x, dz = z - c.z;
    if (dx * dx + dz * dz < (c.r + pad) * (c.r + pad)) return true;
  }
  return false;
}
