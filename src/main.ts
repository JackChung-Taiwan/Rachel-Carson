import './styles/main.css';
import { detectWebGL } from './core/webgl';

/**
 * 進入點：先檢查 WebGL，再動態載入 3D 遊戲（避免不支援的裝置看到空白畫面）。
 */
async function boot(): Promise<void> {
  const support = detectWebGL();
  if (!support.ok) {
    showFatal(`偵測不到 WebGL（${support.reason ?? 'unknown'}）。`);
    return;
  }
  try {
    const [{ Game }, { installDebugHook }] = await Promise.all([import('./core/Game'), import('./debug/debugHook')]);
    const container = document.getElementById('scene-container')!;
    const game = new Game(container);
    installDebugHook(game);
    // 讓第一個畫面先渲染完成再移除載入畫面
    requestAnimationFrame(() => game.start());
  } catch (err) {
    console.error(err);
    showFatal(err instanceof Error ? err.message : String(err));
  }
}

function showFatal(detail: string): void {
  document.getElementById('loading')?.classList.add('hidden');
  document.getElementById('home')?.classList.add('hidden');
  const box = document.getElementById('webgl-error');
  if (box) {
    box.classList.remove('hidden');
    const d = box.querySelector('.error-detail');
    if (d) d.textContent = `技術資訊：${detail}`;
  }
}

void boot();
