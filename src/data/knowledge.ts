/**
 * 知識卡內容。新增生物或污染物時，在這裡加一筆資料，
 * 並在 InteractionManager 註冊對應的 3D 物件即可。
 */
export type KnowledgeId = 'turtle' | 'plastic-bottle';

export interface KnowledgeEntry {
  id: KnowledgeId;
  /** 名稱 */
  name: string;
  /** 英文名稱（輔助學習） */
  englishName: string;
  /** 所屬任務名稱 */
  missionTitle: string;
  /** 介紹 */
  intro: string;
  /** 科學知識 */
  science: string;
  /** 主要按鈕文字 */
  actionLabel: string;
  /** 完成後按鈕文字 */
  doneLabel: string;
  /** 互動提示（例如：觀察海龜） */
  promptVerb: string;
  /** 卡片圖示（SVG，非 Emoji） */
  icon: 'turtle' | 'bottle';
}

export const KNOWLEDGE: Record<KnowledgeId, KnowledgeEntry> = {
  turtle: {
    id: 'turtle',
    name: '海龜',
    englishName: 'Sea Turtle',
    missionTitle: '海洋生物觀察員',
    intro: '海龜是重要的海洋生物，牠們需要健康的海洋環境才能生存。',
    science: '海龜可能誤食塑膠垃圾，也可能被廢棄漁網纏住。',
    actionLabel: '完成觀察',
    doneLabel: '已完成觀察',
    promptVerb: '觀察海龜',
    icon: 'turtle',
  },
  'plastic-bottle': {
    id: 'plastic-bottle',
    name: '海洋塑膠垃圾',
    englishName: 'Marine Plastic Debris',
    missionTitle: '海洋污染調查員',
    intro: '塑膠垃圾進入海洋後，可能長時間留在環境中。',
    science: '海洋動物可能誤食塑膠碎片，或被塑膠垃圾纏住。',
    actionLabel: '清理垃圾',
    doneLabel: '已清理',
    promptVerb: '調查塑膠瓶',
    icon: 'bottle',
  },
};
