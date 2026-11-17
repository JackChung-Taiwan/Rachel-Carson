import { createAbyssalSoundscape } from './abyssalSoundscape.js';

const STORAGE_KEY = 'ocean-mission-audio-muted';
const CLASSROOM_VOLUME = 0.30;

function readMuted(): boolean {
  try { return localStorage.getItem(STORAGE_KEY) === 'true'; }
  catch { return false; }
}

export class Ambience {
  private context?: AudioContext;
  private sound?: ReturnType<typeof createAbyssalSoundscape>;
  private timer?: number;
  private fadeTimer?: number;
  private requested = false;
  muted = readMuted();
  available = typeof window.AudioContext === 'function';

  constructor(private readonly position: () => { x: number; y: number; z: number }) {
    document.addEventListener('visibilitychange', () => { void this.sync(); });
  }

  start(): void {
    this.requested = true;
    void this.sync();
  }

  toggle(): void {
    if (!this.available) return;
    this.muted = !this.muted;
    try { localStorage.setItem(STORAGE_KEY, String(this.muted)); }
    catch { /* Continue when storage is unavailable. */ }
    this.start();
  }

  private async sync(): Promise<void> {
    window.clearTimeout(this.fadeTimer);
    if (!this.available || !this.requested) return;
    if (this.muted || document.hidden) {
      const context = this.context;
      if (!context || !this.sound) return;
      window.clearInterval(this.timer);
      this.timer = undefined;
      const gain = this.sound.gain;
      const time = context.currentTime;
      gain.cancelScheduledValues(time);
      gain.setTargetAtTime(0, time, 0.025);
      if (document.hidden) {
        await context.suspend().catch(() => undefined);
      } else {
        this.fadeTimer = window.setTimeout(() => {
          if (this.muted) void context.suspend().catch(() => undefined);
        }, 140);
      }
      return;
    }

    try {
      if (!this.context) {
        this.context = new AudioContext({ latencyHint: 'playback' });
        this.sound = createAbyssalSoundscape(this.context, this.position);
      }
      const context = this.context;
      await context.resume();
      if (this.muted || document.hidden || !this.sound || context.state !== 'running') return;
      const time = context.currentTime;
      this.sound.gain.cancelScheduledValues(time);
      this.sound.gain.setTargetAtTime(CLASSROOM_VOLUME, time, 0.16);
      if (this.timer === undefined) this.timer = window.setInterval(this.sound.tick, 100);
    } catch {
      // Different browsers can defer playback until the next user gesture.
      // Close a partially constructed graph and let the next gesture retry.
      if (!this.sound && this.context) {
        void this.context.close().catch(() => undefined);
        this.context = undefined;
      }
    }
  }
}
