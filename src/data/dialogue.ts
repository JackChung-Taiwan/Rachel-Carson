/**
 * 導覽對話。
 * 注意：以下為依據瑞秋卡森（Rachel Carson，1907–1964，美國海洋生物學家、作家）
 * 重視觀察與守護自然的科學精神所設計的「原創教學對話」，並非她本人的真實名言。
 */
export const GUIDE_NAME = '瑞秋卡森';
export const GUIDE_ROLE = '海洋導覽員';
export const GUIDE_DISCLAIMER = '導覽對話為依據瑞秋卡森的科學精神設計之原創教學內容，並非其本人真實語錄。';

export const DIALOGUE = {
  intro: '你好！我是瑞秋卡森。\n海洋中有許多值得我們認識的生命。\n今天，我們一起探索海底世界，找出需要守護的地方！',
  firstHintDesktop: '先找找看附近慢慢游動的海龜。用 WASD 游過去，把準星對準牠，按 F 打開知識卡。',
  firstHintTouch: '先找找看附近慢慢游動的海龜。用左邊的搖桿游過去，靠近後點「互動」打開知識卡。',
  afterTurtle: '觀察得很仔細！科學家會耐心記錄生物的樣子和行為。接下來，看看珊瑚旁的沙地上，有沒有不屬於海洋的東西？',
  afterBottle: '你把塑膠瓶帶離了海底！再往前看看，有一張廢棄漁網需要通報。',
  afterNet: '通報完成！接著去比較兩株顏色不同的珊瑚，找出白化的可能原因。',
  afterCoral: '觀察紀錄已收到。下一站是海草床，想想船要停在哪裡，才不會傷到小魚的家。',
  ending: '今天我們觀察了海洋生命，也發現了污染問題。真正的海洋守護，要從了解環境與日常行動開始。',
  freeExplore: '接下來可以自由探索：去看看岩石拱門、海帶森林和頭頂上游過的魟魚吧！',
} as const;

export const EXTENSION_ACTIVITIES = {
  heading: '回到 Minecraft Education，試著完成：',
  items: ['建造一座海洋研究站', '設計一個海洋垃圾回收區', '使用程式建立海洋生物展示區'],
} as const;
