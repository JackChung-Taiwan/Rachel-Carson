export type QualityLevel = 'low' | 'medium' | 'high';

export interface QualitySettings {
  level: QualityLevel;
  label: string;
  description: string;
  /** 最大 Pixel Ratio */
  maxPixelRatio: number;
  /** 解析度縮放（Low 會再降低） */
  renderScale: number;
  msaaSamples: number;
  bloom: boolean;
  fishCount: number;
  mantaCount: number;
  kelpCount: number;
  seagrassTufts: number;
  coralCount: number;
  particleCount: number;
  bubbleCount: number;
  lightShafts: number;
  /** 水下光紋（caustics）層數：1 = 簡化、2 = 完整 */
  causticLayers: number;
}

export const QUALITY_PRESETS: Record<QualityLevel, QualitySettings> = {
  low: {
    level: 'low',
    label: '低 Low',
    description: '減少魚群與粒子、降低解析度、簡化水下光束。適合較舊的手機或電腦。',
    maxPixelRatio: 1,
    renderScale: 0.75,
    msaaSamples: 0,
    bloom: false,
    fishCount: 70,
    mantaCount: 0,
    kelpCount: 90,
    seagrassTufts: 450,
    coralCount: 110,
    particleCount: 900,
    bubbleCount: 60,
    lightShafts: 8,
    causticLayers: 1,
  },
  medium: {
    level: 'medium',
    label: '中 Medium',
    description: '標準魚群、海帶與光照。適合一般筆電與新款手機。',
    maxPixelRatio: 1.5,
    renderScale: 1,
    msaaSamples: 4,
    bloom: false,
    fishCount: 170,
    mantaCount: 1,
    kelpCount: 170,
    seagrassTufts: 1000,
    coralCount: 200,
    particleCount: 2400,
    bubbleCount: 140,
    lightShafts: 16,
    causticLayers: 2,
  },
  high: {
    level: 'high',
    label: '高 High',
    description: '較完整的水下光影（柔光暈染）、更多粒子與海洋生物。適合獨立顯示卡桌機。',
    maxPixelRatio: 2,
    renderScale: 1,
    msaaSamples: 4,
    bloom: true,
    fishCount: 300,
    mantaCount: 2,
    kelpCount: 250,
    seagrassTufts: 1700,
    coralCount: 300,
    particleCount: 4200,
    bubbleCount: 260,
    lightShafts: 26,
    causticLayers: 2,
  },
};

const STORAGE_KEY = 'rcom.quality';

export function isTouchDevice(): boolean {
  const forced = new URLSearchParams(location.search).get('touch');
  if (forced === '1') return true;
  if (forced === '0') return false;
  return (
    (typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches) ||
    navigator.maxTouchPoints > 0
  );
}

export function loadQuality(): QualityLevel {
  const fromUrl = new URLSearchParams(location.search).get('quality');
  if (fromUrl === 'low' || fromUrl === 'medium' || fromUrl === 'high') return fromUrl;
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'low' || saved === 'medium' || saved === 'high') return saved;
  } catch {
    /* localStorage 可能被停用 */
  }
  return isTouchDevice() ? 'low' : 'high';
}

export function saveQuality(level: QualityLevel): void {
  try {
    localStorage.setItem(STORAGE_KEY, level);
  } catch {
    /* ignore */
  }
}
