import type { SiteId } from './worldLayout';

/**
 * 知識卡內容。新增生物或污染物時，在這裡加一筆資料，
 * 並在 InteractionManager 註冊對應的 3D 物件即可。
 */
export type KnowledgeId = 'turtle' | 'plastic-bottle' | SiteId;

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
  icon: 'turtle' | 'bottle' | 'net' | 'coral' | 'grass';
  question?: { text: string; options: readonly { text: string; correct: boolean; feedback: string }[] };
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
  'ghost-net': {
    id: 'ghost-net', name: '廢棄漁網', englishName: 'Ghost Net',
    missionTitle: '廢棄漁網通報員',
    intro: '沙地上的漁網已經沒有人使用，魚和海龜卻仍可能被網線纏住。',
    science: '在真實海域發現廢棄漁網時，記下位置並通報，由受過訓練的人員處理。',
    actionLabel: '標記位置並通報', doneLabel: '已標記並通報', promptVerb: '調查廢棄漁網', icon: 'net',
  },
  'coral-survey': {
    id: 'coral-survey', name: '珊瑚觀測點', englishName: 'Coral Survey Site',
    missionTitle: '珊瑚白化觀察員',
    intro: '比較眼前的兩株珊瑚：一株有顏色，另一株變白了。',
    science: '珊瑚體內的小藻類提供養分與顏色。珊瑚白化時仍可能活著，環境好轉後有機會恢復。',
    actionLabel: '提交觀察紀錄', doneLabel: '已提交觀察紀錄', promptVerb: '觀察珊瑚', icon: 'coral',
    question: { text: '哪一種變化可能引發大量珊瑚白化？', options: [
      { text: '海水長時間過熱', correct: true, feedback: '答對了！高溫會讓珊瑚失去體內的小藻類。' },
      { text: '魚群從附近游過', correct: false, feedback: '魚群經過是自然現象。想想什麼變化會讓整片珊瑚礁承受壓力。' },
    ] },
  },
  'seagrass-bed': {
    id: 'seagrass-bed', name: '海草床', englishName: 'Seagrass Meadow',
    missionTitle: '海草棲地守護員',
    intro: '海草的葉片能讓小魚躲藏，根則能幫忙穩住海床。',
    science: '船錨落下或拖動時可能拔起海草。停船前，先查清當地允許停泊的位置。',
    actionLabel: '標記海草保護區', doneLabel: '已標記海草保護區', promptVerb: '守護海草床', icon: 'grass',
    question: { text: '船要在附近停留，哪裡比較安全？', options: [
      { text: '直接把錨丟進海草最密的地方', correct: false, feedback: '船錨可能扯斷葉片或拔起海草。再看看另一個停船地點。' },
      { text: '使用核准的繫泊浮標', correct: true, feedback: '答對了！使用核准的浮標可以避免把錨丟進海草床。' },
    ] },
  },
};
