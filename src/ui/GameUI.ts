import { ICONS, GUIDE_AVATAR_SVG } from './icons';
import { KNOWLEDGE, type KnowledgeEntry, type KnowledgeId } from '../data/knowledge';
import { DIALOGUE, EXTENSION_ACTIVITIES, GUIDE_DISCLAIMER } from '../data/dialogue';
import { QUALITY_PRESETS, type QualityLevel } from '../core/Quality';
import type { Mission } from '../missions/MissionManager';

const $ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document): T => {
  const el = root.querySelector<T>(sel);
  if (!el) throw new Error(`找不到介面元素：${sel}`);
  return el;
};

export interface UIHandlers {
  onStart: () => void;
  onAudioToggle: () => void;
  onCardAction: (id: KnowledgeId) => void;
  onCardClose: () => void;
  onRestart: () => void;
  onFreeExplore: () => void;
  onResume: () => void;
  onHome: () => void;
  onQualityChange: (q: QualityLevel) => void;
  onMenu: () => void;
  onModalClosed: () => void;
}

export interface DialogButton {
  label: string;
  primary?: boolean;
  onClick: () => void;
}

/**
 * 所有 DOM 介面：首頁、任務面板、導覽對話、知識卡、結束畫面、選單與設定。
 */
export class GameUI {
  private dialogTimer = 0;
  private toastTimer = 0;
  private cardId: KnowledgeId | null = null;
  private quality: QualityLevel = 'high';
  private returnModal: 'home' | 'pause' = 'home';

  constructor(private readonly h: UIHandlers, private readonly touch: boolean) {
    document.body.classList.toggle('is-touch', touch);
    if (touch) {
      const panel = $('#mission-panel');
      const hud = $('#hud');
      new ResizeObserver(() => {
        hud.style.setProperty('--mission-panel-height', `${panel.offsetHeight}px`);
      }).observe(panel);
    }
    // 圖示
    document.querySelectorAll<HTMLElement>('[data-icon]').forEach((el) => {
      const name = el.dataset.icon as keyof typeof ICONS;
      if (ICONS[name]) el.insertAdjacentHTML('afterbegin', ICONS[name]);
    });
    document.querySelectorAll<HTMLElement>('.guide-avatar').forEach((el) => (el.innerHTML = GUIDE_AVATAR_SVG));

    $('#btn-start').addEventListener('click', () => this.h.onStart());
    document.querySelectorAll<HTMLButtonElement>('[data-audio-toggle]').forEach((button) => {
      button.addEventListener('click', () => this.h.onAudioToggle());
    });
    $('#btn-help').addEventListener('click', () => this.openModal('#help-modal', 'home'));
    $('#btn-quality').addEventListener('click', () => this.openModal('#quality-modal', 'home'));
    $('#btn-help-2').addEventListener('click', () => this.openModal('#help-modal', 'pause'));
    $('#btn-quality-2').addEventListener('click', () => this.openModal('#quality-modal', 'pause'));
    $('#btn-resume').addEventListener('click', () => this.h.onResume());
    $('#btn-restart-2').addEventListener('click', () => this.h.onRestart());
    $('#btn-home').addEventListener('click', () => this.h.onHome());
    $('#btn-menu').addEventListener('click', () => this.h.onMenu());
    $('#card-close').addEventListener('click', () => this.h.onCardClose());
    $('#card-action').addEventListener('click', () => {
      if (this.cardId) this.h.onCardAction(this.cardId);
    });
    $('#btn-restart').addEventListener('click', () => this.h.onRestart());
    $('#btn-free').addEventListener('click', () => this.h.onFreeExplore());
    document.querySelectorAll<HTMLElement>('[data-close]').forEach((b) =>
      b.addEventListener('click', () => this.closeModals()),
    );
    document.querySelectorAll<HTMLElement>('.modal').forEach((m) =>
      m.addEventListener('click', (e) => {
        if (e.target === m && (m.id === 'help-modal' || m.id === 'quality-modal')) this.closeModals();
      }),
    );

    // 結束畫面文字
    $('.end-guide-text').textContent = DIALOGUE.ending;
    $('.end-ext-heading').textContent = EXTENSION_ACTIVITIES.heading;
    $('.end-ext-list').innerHTML = EXTENSION_ACTIVITIES.items.map((t) => `<li>${t}</li>`).join('');
    $('#guide-dialog').title = GUIDE_DISCLAIMER;
    $('#interact-prompt kbd').textContent = touch ? '互動' : 'F';
  }

  // ---------- 畫面切換 ----------
  hideLoading(): void {
    $('#loading').classList.add('hidden');
  }

  showHome(v: boolean): void {
    $('#home').classList.toggle('hidden', !v);
    document.body.classList.toggle('at-home', v);
  }

  showHUD(v: boolean): void {
    $('#hud').classList.toggle('hidden', !v);
  }

  showWebGLError(detail: string): void {
    $('#loading').classList.add('hidden');
    $('#home').classList.add('hidden');
    $('#webgl-error').classList.remove('hidden');
    $('.error-detail').textContent = detail ? `技術資訊：${detail}` : '';
  }

  // ---------- 任務面板 ----------
  renderMissions(missions: readonly Mission[], progressText: string): void {
    $('#mission-list').innerHTML = missions
      .map(
        (m) => `<li class="${m.completed ? 'done' : ''}" data-mission="${m.id}">
          <span class="check" aria-hidden="true">${m.completed ? '[✓]' : '[ ]'}</span>
          <span class="m-text"><span class="m-label">${m.label}</span><span class="m-title">${m.title}</span></span>
          <span class="sr-only">${m.completed ? '已完成' : '未完成'}</span>
        </li>`,
      )
      .join('');
    const prog = $('#mission-progress');
    prog.textContent = progressText;
    prog.classList.remove('bump');
    void prog.offsetWidth;
    prog.classList.add('bump');
  }

  // ---------- 導覽對話 ----------
  showDialog(text: string, opts: { buttons?: DialogButton[]; autoHideMs?: number } = {}): void {
    const d = $('#guide-dialog');
    $('.guide-text', d).textContent = text;
    const actions = $('.guide-actions', d);
    actions.innerHTML = '';
    for (const b of opts.buttons ?? []) {
      const btn = document.createElement('button');
      btn.className = `btn ${b.primary ? 'btn-primary' : 'btn-ghost'}`;
      btn.textContent = b.label;
      btn.addEventListener('click', b.onClick);
      actions.appendChild(btn);
    }
    if (!opts.buttons?.length) {
      const btn = document.createElement('button');
      btn.className = 'btn btn-ghost btn-sm';
      btn.textContent = '知道了';
      btn.addEventListener('click', () => this.hideDialog());
      actions.appendChild(btn);
    }
    d.classList.toggle('blocking', !!opts.buttons?.length);
    d.classList.remove('hidden');
    window.clearTimeout(this.dialogTimer);
    if (opts.autoHideMs) this.dialogTimer = window.setTimeout(() => this.hideDialog(), opts.autoHideMs);
  }

  hideDialog(): void {
    $('#guide-dialog').classList.add('hidden');
  }

  get dialogVisible(): boolean {
    return !$('#guide-dialog').classList.contains('hidden');
  }

  // ---------- 提示 ----------
  setPrompt(id: KnowledgeId | null): void {
    const p = $('#interact-prompt');
    if (!id) {
      p.classList.add('hidden');
      return;
    }
    const e = KNOWLEDGE[id];
    $('.ip-text', p).textContent = this.touch ? `點一下，${e.promptVerb}` : `按 F ${e.promptVerb}`;
    p.classList.remove('hidden');
  }

  setCrosshairActive(v: boolean): void {
    $('#crosshair').classList.toggle('active', v);
  }

  setLockHint(v: boolean): void {
    $('#lock-hint').classList.toggle('hidden', !v);
  }

  toast(html: string, ms = 2600, kind: 'info' | 'success' | 'celebrate' = 'success'): void {
    const t = $('#toast');
    t.className = `toast-${kind}`;
    t.innerHTML = `<span class="toast-icon">${kind === 'info' ? ICONS.search : ICONS.check}</span><span>${html}</span>`;
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => t.classList.add('hidden'), ms);
  }

  /** 目標方向指示：x,y 為畫面座標；onScreen=false 時顯示在邊緣並指向目標 */
  setTargetMarker(state: { visible: boolean; x?: number; y?: number; onScreen?: boolean; angle?: number; label?: string }): void {
    const m = $('#target-marker');
    if (!state.visible) {
      m.classList.add('hidden');
      return;
    }
    m.classList.remove('hidden');
    m.classList.toggle('offscreen', !state.onScreen);
    m.style.transform = `translate(${state.x}px, ${state.y}px)`;
    $('.tm-arrow', m).style.transform = `translate(-50%, -50%) rotate(${state.angle ?? 0}rad)`;
    $('.tm-label', m).textContent = state.label ?? '';
  }

  setFPS(text: string | null): void {
    const f = $('#fps');
    f.classList.toggle('hidden', text === null);
    if (text) f.textContent = text;
  }

  setAudio(muted: boolean, available: boolean): void {
    const enabled = available && !muted;
    const label = !available ? '配樂無法使用' : muted ? '開啟配樂' : '關閉配樂';
    document.querySelectorAll<HTMLButtonElement>('[data-audio-toggle]').forEach((button) => {
      button.disabled = !available;
      button.title = label;
      button.setAttribute('aria-label', '海底配樂');
      button.setAttribute('aria-pressed', String(enabled));
      const text = button.classList.contains('icon-btn') ? '' : `配樂｜${enabled ? '開啟' : available ? '靜音' : '無法使用'}`;
      button.innerHTML = ICONS[enabled ? 'speaker' : 'muted'] + text;
    });
  }

  // ---------- 知識卡 ----------
  showCard(entry: KnowledgeEntry, completed: boolean): void {
    this.cardId = entry.id;
    const c = $('#knowledge-card');
    $('.card-icon', c).innerHTML = ICONS[entry.icon];
    $('.card-mission', c).textContent = `任務：${entry.missionTitle}`;
    $('#card-name').textContent = entry.name;
    $('.card-en', c).textContent = entry.englishName;
    $('.card-intro', c).textContent = entry.intro;
    $('.card-science-text', c).textContent = entry.science;
    const action = $<HTMLButtonElement>('#card-action');
    action.textContent = completed ? entry.doneLabel : entry.actionLabel;
    const question = entry.question;
    action.disabled = completed || !!question;
    const choices = $('#card-choices');
    const feedback = $('#card-feedback');
    choices.replaceChildren();
    feedback.textContent = '';
    $('#card-question').classList.toggle('hidden', !question || completed);
    if (question && !completed) {
      $('#card-question-title').textContent = question.text;
      question.options.forEach((option, index) => {
        const choice = document.createElement('button');
        choice.type = 'button';
        choice.className = 'btn btn-ghost';
        choice.textContent = option.text;
        choice.dataset.choice = String(index);
        choice.addEventListener('click', () => {
          choices.querySelectorAll('button').forEach((btn) => btn.setAttribute('aria-pressed', String(btn === choice)));
          feedback.textContent = option.feedback;
          action.disabled = !option.correct;
        });
        choices.append(choice);
      });
    }
    $('#card-close').textContent = completed ? '關閉' : '稍後再看';
    $('#card-overlay').classList.remove('hidden');
    window.setTimeout(() => (completed ? $('#card-close') : choices.querySelector('button') ?? action).focus(), 50);
  }

  hideCard(): void {
    this.cardId = null;
    $('#card-overlay').classList.add('hidden');
  }

  get cardOpen(): boolean {
    return this.cardId !== null;
  }

  // ---------- 結束畫面 / 選單 ----------
  showEnd(v: boolean): void {
    $('#end-screen').classList.toggle('hidden', !v);
    if (v) window.setTimeout(() => $('#btn-free').focus(), 50);
  }

  showPause(v: boolean): void {
    $('#pause-menu').classList.toggle('hidden', !v);
  }

  get pauseVisible(): boolean {
    return !$('#pause-menu').classList.contains('hidden');
  }

  openModal(sel: '#help-modal' | '#quality-modal', from: 'home' | 'pause'): void {
    this.returnModal = from;
    if (sel === '#quality-modal') this.renderQuality();
    $('#pause-menu').classList.add('hidden');
    $(sel).classList.remove('hidden');
  }

  get modalOpen(): boolean {
    return !$('#help-modal').classList.contains('hidden') || !$('#quality-modal').classList.contains('hidden');
  }

  closeModals(): void {
    $('#help-modal').classList.add('hidden');
    $('#quality-modal').classList.add('hidden');
    if (this.returnModal === 'pause') $('#pause-menu').classList.remove('hidden');
    this.h.onModalClosed();
  }

  setQuality(q: QualityLevel): void {
    this.quality = q;
    $('#home-quality-note').textContent = `目前畫質：${QUALITY_PRESETS[q].label}`;
    this.renderQuality();
  }

  private renderQuality(): void {
    const box = $('#quality-options');
    box.innerHTML = '';
    (['low', 'medium', 'high'] as QualityLevel[]).forEach((lv) => {
      const p = QUALITY_PRESETS[lv];
      const b = document.createElement('button');
      b.className = `quality-option${lv === this.quality ? ' selected' : ''}`;
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', String(lv === this.quality));
      b.dataset.quality = lv;
      b.innerHTML = `<span class="q-radio" aria-hidden="true"></span><span class="q-text"><strong>${p.label}</strong><span>${p.description}</span></span>`;
      b.addEventListener('click', () => {
        this.h.onQualityChange(lv);
      });
      box.appendChild(b);
    });
  }
}
