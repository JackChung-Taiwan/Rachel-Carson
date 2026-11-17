/** 檢查瀏覽器是否能建立 WebGL（優先 WebGL2）。 */
export function detectWebGL(): { ok: boolean; webgl2: boolean; reason?: string } {
  try {
    const canvas = document.createElement('canvas');
    const gl2 = canvas.getContext('webgl2');
    if (gl2) return { ok: true, webgl2: true };
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (gl) return { ok: true, webgl2: false };
    return { ok: false, webgl2: false, reason: 'no-context' };
  } catch (err) {
    return { ok: false, webgl2: false, reason: String(err) };
  }
}
