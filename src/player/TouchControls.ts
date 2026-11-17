import type { PlayerController } from './PlayerController';

/**
 * 手機觸控：左側虛擬搖桿移動、右側滑動轉視角、上升/下降按鈕、互動按鈕。
 */
export class TouchControls {
  private joyId: number | null = null;
  private joyCenter = { x: 0, y: 0 };
  private lookId: number | null = null;
  private lookLast = { x: 0, y: 0 };
  private readonly radius = 52;
  enabled = false;

  constructor(
    private readonly root: HTMLElement,
    private readonly player: PlayerController,
    private readonly onInteract: () => void,
  ) {
    const joy = root.querySelector<HTMLElement>('#joystick')!;
    const knob = root.querySelector<HTMLElement>('#joystick-knob')!;
    const look = root.querySelector<HTMLElement>('#look-zone')!;
    const up = root.querySelector<HTMLElement>('#btn-up')!;
    const down = root.querySelector<HTMLElement>('#btn-down')!;
    const act = root.querySelector<HTMLElement>('#btn-interact')!;

    joy.addEventListener('pointerdown', (e) => {
      if (!this.enabled || this.joyId !== null) return;
      e.preventDefault();
      this.joyId = e.pointerId;
      joy.setPointerCapture(e.pointerId);
      const r = joy.getBoundingClientRect();
      this.joyCenter.x = r.left + r.width / 2;
      this.joyCenter.y = r.top + r.height / 2;
      this.updateJoy(e.clientX, e.clientY, knob);
    });
    joy.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.joyId) return;
      e.preventDefault();
      this.updateJoy(e.clientX, e.clientY, knob);
    });
    const endJoy = (e: PointerEvent) => {
      if (e.pointerId !== this.joyId) return;
      this.joyId = null;
      knob.style.transform = 'translate(-50%, -50%)';
      this.player.external.moveX = 0;
      this.player.external.moveY = 0;
      this.player.external.sprint = false;
    };
    joy.addEventListener('pointerup', endJoy);
    joy.addEventListener('pointercancel', endJoy);

    look.addEventListener('pointerdown', (e) => {
      if (!this.enabled || this.lookId !== null) return;
      this.lookId = e.pointerId;
      look.setPointerCapture(e.pointerId);
      this.lookLast.x = e.clientX;
      this.lookLast.y = e.clientY;
    });
    look.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.lookId) return;
      e.preventDefault();
      const dx = e.clientX - this.lookLast.x;
      const dy = e.clientY - this.lookLast.y;
      this.lookLast.x = e.clientX;
      this.lookLast.y = e.clientY;
      this.player.addLook(dx * 0.0055, dy * 0.0055);
    });
    const endLook = (e: PointerEvent) => {
      if (e.pointerId === this.lookId) this.lookId = null;
    };
    look.addEventListener('pointerup', endLook);
    look.addEventListener('pointercancel', endLook);

    const hold = (el: HTMLElement, value: number) => {
      const start = (e: PointerEvent) => {
        e.preventDefault();
        el.classList.add('pressed');
        el.setPointerCapture(e.pointerId);
        this.player.external.vertical = value;
      };
      const end = () => {
        el.classList.remove('pressed');
        if (this.player.external.vertical === value) this.player.external.vertical = 0;
      };
      el.addEventListener('pointerdown', start);
      el.addEventListener('pointerup', end);
      el.addEventListener('pointercancel', end);
      el.addEventListener('lostpointercapture', end);
    };
    hold(up, 1);
    hold(down, -1);
    act.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (this.enabled) this.onInteract();
    });
    root.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  private updateJoy(x: number, y: number, knob: HTMLElement): void {
    let dx = x - this.joyCenter.x;
    let dy = y - this.joyCenter.y;
    const d = Math.hypot(dx, dy);
    if (d > this.radius) {
      dx = (dx / d) * this.radius;
      dy = (dy / d) * this.radius;
    }
    knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    const nx = dx / this.radius;
    const ny = -dy / this.radius;
    const dead = 0.12;
    this.player.external.moveX = Math.abs(nx) < dead ? 0 : nx;
    this.player.external.moveY = Math.abs(ny) < dead ? 0 : ny;
    // 推到底自動加速
    this.player.external.sprint = d >= this.radius * 0.98;
  }

  setVisible(v: boolean): void {
    this.enabled = v;
    this.root.classList.toggle('hidden', !v);
    if (!v) {
      this.player.external.moveX = 0;
      this.player.external.moveY = 0;
      this.player.external.vertical = 0;
      this.player.external.sprint = false;
    }
  }
}
