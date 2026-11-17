import type { KnowledgeId } from '../data/knowledge';

export type MissionId = 'observe-turtle' | 'clean-plastic';

export interface Mission {
  id: MissionId;
  /** 任務面板顯示的文字 */
  label: string;
  /** 任務名稱 */
  title: string;
  /** 對應的知識卡 / 互動目標 */
  target: KnowledgeId;
  completed: boolean;
}

type Listener = (missions: readonly Mission[]) => void;

/**
 * 任務狀態管理：完成、重置、進度與事件通知。
 * 未來新增任務時，只要在 createMissions 增加資料。
 */
export class MissionManager {
  private missions: Mission[] = MissionManager.createMissions();
  private listeners = new Set<Listener>();
  private allDoneListeners = new Set<() => void>();

  static createMissions(): Mission[] {
    return [
      { id: 'observe-turtle', label: '觀察海龜', title: '海洋生物觀察員', target: 'turtle', completed: false },
      { id: 'clean-plastic', label: '調查海洋垃圾', title: '海洋污染調查員', target: 'plastic-bottle', completed: false },
    ];
  }

  get list(): readonly Mission[] {
    return this.missions;
  }

  get completedCount(): number {
    return this.missions.filter((m) => m.completed).length;
  }

  get total(): number {
    return this.missions.length;
  }

  get allCompleted(): boolean {
    return this.completedCount === this.total;
  }

  get progressText(): string {
    return `任務進度：${this.completedCount}/${this.total}`;
  }

  isCompleted(id: MissionId): boolean {
    return this.missions.find((m) => m.id === id)?.completed ?? false;
  }

  byTarget(target: KnowledgeId): Mission | undefined {
    return this.missions.find((m) => m.target === target);
  }

  /** 下一個尚未完成的任務 */
  get current(): Mission | undefined {
    return this.missions.find((m) => !m.completed);
  }

  complete(id: MissionId): boolean {
    const m = this.missions.find((x) => x.id === id);
    if (!m || m.completed) return false;
    m.completed = true;
    this.emit();
    if (this.allCompleted) this.allDoneListeners.forEach((l) => l());
    return true;
  }

  reset(): void {
    this.missions = MissionManager.createMissions();
    this.emit();
  }

  onChange(l: Listener): () => void {
    this.listeners.add(l);
    l(this.missions);
    return () => this.listeners.delete(l);
  }

  onAllCompleted(l: () => void): void {
    this.allDoneListeners.add(l);
  }

  private emit(): void {
    this.listeners.forEach((l) => l(this.missions));
  }
}
