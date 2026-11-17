/** 以 requestAnimationFrame 間隔計算 FPS 與影格時間（每 0.5 秒更新一次）。 */
export class FpsMeter {
  fps = 0;
  frameMs = 0;
  worstMs = 0;
  private frames = 0;
  private acc = 0;
  private worst = 0;

  tick(dtSeconds: number): void {
    this.frames++;
    this.acc += dtSeconds;
    this.worst = Math.max(this.worst, dtSeconds);
    if (this.acc >= 0.5) {
      this.fps = this.frames / this.acc;
      this.frameMs = (this.acc / this.frames) * 1000;
      this.worstMs = this.worst * 1000;
      this.frames = 0;
      this.acc = 0;
      this.worst = 0;
    }
  }
}
