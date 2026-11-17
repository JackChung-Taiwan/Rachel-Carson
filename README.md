# 瑞秋卡森：海洋環境守護行動

**Rachel Carson: Ocean Conservation Mission**：《麥塊 AI 科學實驗王 2》補充單元，MVP V1.0

這是一個在瀏覽器中執行的 3D 海底探索教學遊戲，適合國小三年級到國中學生。學生可以在程序化生成的海底世界自由游動，跟著「瑞秋卡森」導覽角色完成五項科學任務：觀察海龜、清理塑膠瓶、通報廢棄漁網、辨識珊瑚白化與守護海草棲地。

- 技術：Three.js（WebGLRenderer）＋ TypeScript ＋ Vite，搭配 HTML / CSS
- 場景、生物、植物全部由程式即時生成，不使用外部 3D 模型或貼圖檔
- 支援桌機（鍵盤＋滑鼠）以及手機、平板（觸控）
- 全繁體中文介面

---

## 快速開始

需要 Node.js 18 以上版本（建議 20）。

```bash
npm install        # 安裝依賴
npm run dev        # 開發伺服器 http://localhost:5173/
npm run build      # 型別檢查（tsc）並建置到 dist/
npm run preview    # 預覽建置結果 http://localhost:4173/
```

`dist/` 預設使用相對路徑（`base: './'`），可以直接放到任何靜態網站主機或子路徑，不會出現空白畫面。

### 網址參數

| 參數 | 說明 |
|---|---|
| `?quality=low\|medium\|high` | 強制使用指定畫質 |
| `?fps=1` | 顯示 FPS／解析度資訊 |
| `?touch=1` / `?touch=0` | 強制開啟或關閉觸控介面 |
| `?debug=1` | 開放 `window.__oceanDebug` 測試介面（開發模式 `npm run dev` 會自動開放） |

---

## 操作方式

| 動作 | 電腦 | 手機／平板 |
|---|---|---|
| 游動 | `W` `A` `S` `D`（或方向鍵） | 左側虛擬搖桿（推到底會自動加速） |
| 轉動視角 | 滑鼠（點擊畫面鎖定滑鼠；不能鎖定時可以按住拖曳） | 右側畫面滑動 |
| 下降／上升 | `Q` / `E` | 「下降」/「上升」按鈕 |
| 加速 | `Shift` | 搖桿推到底 |
| 互動 | `F`（準星對準目標） | 「互動」按鈕 |
| 選單 | `ESC`（退出滑鼠鎖定並開啟選單） | 右上角選單按鈕 |

互動偵測會從畫面中央的準星發出射線（ray-sphere）。如果沒有對準任何物件，靠得夠近也能互動，比較適合低年級學生和手機操作。畫面上的青色圓圈和距離（例如「海龜 18 公尺」）會指出目前任務目標的方向。

---

## 教學任務

| # | 任務名稱 | 面板項目 | 完成條件 |
|---|---|---|---|
| 1 | 海洋生物觀察員 | 觀察海龜 | 找到海龜 → 按 F／互動打開知識卡 → 按「完成觀察」→ 進度 1/5 |
| 2 | 海洋污染調查員 | 調查海洋垃圾 | 找到珊瑚旁沙地上的塑膠瓶 → 打開知識卡 → 按「清理垃圾」→ 塑膠瓶消失並出現清理特效 → 進度 2/5 |
| 3 | 廢棄漁網通報員 | 通報廢棄漁網 | 找到漁網 → 標記位置並通報 → 進度 3/5 |
| 4 | 珊瑚白化觀察員 | 辨識珊瑚白化 | 比較兩株珊瑚 → 判斷白化原因 → 提交觀察 → 進度 4/5 |
| 5 | 海草棲地守護員 | 守護海草棲地 | 找到海草床 → 選擇合適的停船方式 → 標記保護區 → 進度 5/5、顯示結束畫面 |

結束畫面有兩個按鈕：「重新探索」會重置任務並放回塑膠瓶，「繼續自由探索」會關閉結束畫面，讓學生繼續逛海底。

> **關於導覽對話**：遊戲中瑞秋卡森（Rachel Carson，1907–1964，美國海洋生物學家、作家）的對話，是依照她重視觀察、守護自然的科學精神寫成的**原創教學內容，不是她本人說過的話**。首頁和導覽框都有這段說明。導覽頭像是原創平面插畫，不是真人照片。

---

## 畫質設定

| 項目 | Low | Medium | High |
|---|---|---|---|
| Pixel Ratio 上限 × 解析度縮放 | 1 × 0.75 | 1.5 × 1 | 2 × 1 |
| MSAA 抗鋸齒 | 無 | 4x | 4x |
| 柔光暈染（Bloom） | 無 | 無 | 有 |
| 魚 / 魟魚 | 70 / 0 | 170 / 1 | 300 / 2 |
| 海帶 / 海草叢 / 珊瑚 | 90 / 450 / 110 | 170 / 1000 / 200 | 250 / 1700 / 300 |
| 漂浮微粒 / 氣泡 | 900 / 60 | 2400 / 140 | 4200 / 260 |
| 光束數 / 光紋層數 | 8 / 1（簡化） | 16 / 2 | 26 / 2 |

觸控裝置第一次開啟時會預設使用 Low，桌機預設 High。設定會存在 localStorage，遊戲中也可以從選單即時切換，不必重新載入。

如果裝置無法啟動 WebGL，畫面會顯示中文錯誤說明（例如更新瀏覽器、開啟硬體加速），不會只剩空白畫面。WebGL context 遺失時也會顯示同樣的提示。

---

## 部署到 GitHub Pages

專案已附上 `.github/workflows/deploy.yml`：

1. 把專案推送到 GitHub 儲存庫的 `main` 分支。
2. 到 **Settings → Pages → Build and deployment**，Source 選 **GitHub Actions**。
3. Workflow 會執行 `npm ci && npm run build`，並在建置時自動帶入 `VITE_BASE=/<儲存庫名稱>/`，不用手動填寫儲存庫名稱。
4. 如果使用自訂網域或 `<user>.github.io` 儲存庫，可以在 **Settings → Secrets and variables → Actions → Variables** 新增 `PAGES_BASE`（例如 `/` 或 `./`）來覆寫。

手動指定 base 的方式：

```bash
VITE_BASE=/my-repo/ npm run build   # 或 BASE_PATH=/my-repo/ npm run build
```

沒有設定時預設是相對路徑 `./`，部署到任何子路徑都能正常顯示。

---

## 專案結構

```
rachel-carson-ocean-mission/
├─ index.html                 # 所有 UI 結構（首頁、HUD、知識卡、結束畫面、選單、錯誤提示）
├─ vite.config.ts             # base 路徑可由 VITE_BASE / BASE_PATH 設定，預設 './'
├─ public/favicon.svg
├─ .github/workflows/deploy.yml
├─ src/
│  ├─ main.ts                 # 進入點：先檢查 WebGL，再動態載入遊戲
│  ├─ core/
│  │  ├─ Game.ts              # 遊戲狀態機、主迴圈、輸入整合、任務與 UI 串接
│  │  ├─ Quality.ts           # Low / Medium / High 參數與偵測
│  │  ├─ FpsMeter.ts
│  │  └─ webgl.ts             # WebGL 支援檢查
│  ├─ scene/
│  │  ├─ OceanScene.ts        # Renderer、後製（RenderPass / Bloom / OutputPass）、依畫質重建
│  │  ├─ OceanEnvironment.ts  # 水色背景球、海面（Snell's window）、光束、微粒、氣泡、燈光
│  │  ├─ Terrain.ts           # 地形高度函式、沙地、岩石、外圍峭壁、岩石拱門、碰撞球
│  │  ├─ Vegetation.ts        # 海帶森林、海草、分枝珊瑚、腦珊瑚、管狀海綿、海扇、海葵
│  │  ├─ SeaLife.ts           # 魚群（簡化 boids，GPU 擺尾）、魟魚
│  │  ├─ Turtle.ts            # 程序化海龜（盾片 shader、鰭肢動畫）
│  │  ├─ PlasticBottle.ts     # 任務用塑膠瓶與提示光圈
│  │  ├─ CleanupEffect.ts     # 清理完成特效
│  │  └─ shaders/
│  │     ├─ glsl.ts           # 水色、霧化與紅光吸收、caustics（Voronoi）
│  │     ├─ installFog.ts     # 以水下霧化取代 Three.js 內建 fog chunk
│  │     ├─ patchMaterial.ts  # 對 MeshStandardMaterial 注入 caustics、搖擺、透光、擺尾
│  │     └─ uniforms.ts
│  ├─ player/
│  │  ├─ PlayerController.ts  # 游動、Pointer Lock、碰撞與邊界
│  │  └─ TouchControls.ts     # 虛擬搖桿、滑動視角、上升/下降/互動按鈕
│  ├─ interactions/InteractionManager.ts  # 準星射線＋鄰近互動偵測
│  ├─ missions/MissionManager.ts          # 任務狀態、進度與事件
│  ├─ ui/GameUI.ts, ui/icons.ts           # DOM 介面與 SVG 圖示、導覽頭像
│  ├─ data/
│  │  ├─ knowledge.ts         # 知識卡內容
│  │  ├─ dialogue.ts          # 導覽對話與延伸學習
│  │  └─ worldLayout.ts       # 世界配置（起點、海龜路徑、塑膠瓶、拱門、森林、珊瑚礁）
│  ├─ debug/debugHook.ts      # window.__oceanDebug（僅 dev 或 ?debug=1）
│  └─ styles/main.css
├─ tests/
│  ├─ e2e.mjs                 # Playwright 端對端測試（桌機＋手機＋效能＋WebGL 失敗）
│  └─ shot.mjs                # 快速截圖工具
└─ screenshots/               # 測試截圖與 test-results.json
```

### 擴充方式

- **新增知識卡或生物**：在 `src/data/knowledge.ts` 加一筆資料，在場景中建立 3D 物件，再到 `Game.ts` 用 `interactions.register()` 註冊。
- **新增任務**：在 `MissionManager.createMissions()` 加一筆資料（`target` 對應知識卡 id）。
- **調整世界配置**：修改 `src/data/worldLayout.ts`，例如起點、森林、珊瑚礁位置。
- **調整水色和霧**：修改 `src/scene/shaders/glsl.ts` 的 `oceanWaterColor`，以及 `uniforms.ts` 的 `uFogDensity`。

---

## 測試

```bash
npm run build && npm run preview     # 另開終端機
npm run test:e2e                     # 需先安裝 Playwright 瀏覽器：npx playwright install chromium
# 若系統有 Chrome，可以設定 CHROME=/usr/bin/google-chrome
```

測試會自動執行以下項目，並把截圖和 `screenshots/test-results.json` 輸出到 `screenshots/`：

- 首頁文字與按鈕
- 開場對話
- 3D 渲染
- WASD / Q / E / Shift / 滑鼠視角
- 地形碰撞、邊界、海面上限
- ESC 選單
- 海龜與塑膠瓶任務、進度、清理特效、恭喜提示、結束畫面與兩個按鈕
- 畫質切換
- 手機（390×844 觸控）搖桿、滑動、上升／下降、互動
- 橫向手機排版
- WebGL 停用時的錯誤提示
- Console 錯誤
- FPS 量測

詳細結果請看交付報告和 `screenshots/test-results.json`。

## 已知限制（MVP V1.0）

- 效能數據是在**沒有 GPU 的雲端主機**上，用 SwiftShader（CPU 軟體繪圖）測得，無法代表 RTX 4060 Ti 或實體手機的表現。「1080p / 60 FPS」與「手機 30 FPS」目標仍需在實機上量測，可以用 `?fps=1` 查看。
- 尚未在實體 iPhone / iPad（Safari）及 Android 手機上測試，觸控是用 Chrome 行動裝置模擬加 CDP 觸控事件驗證。
- 海龜沿固定橢圓路徑游動，不是生態模擬；魚群是簡化的群游演算法。
- 碰撞使用地形高度加上岩石球體近似，植物可以穿過。
- 不含音效。

## 授權與參考

- 本專案程式碼為原創撰寫。
- 視覺方向參考 [Abyssal Garden](https://github.com/noniv/abyssal-garden)（© 2026 Maksymilian Dendura，**MIT License**），包括水色漸層、霧化、光束、caustics、海帶森林、微粒等呈現方式。原作使用 WebGPU 與 WGSL，本專案改用 Three.js / WebGL 與 GLSL 重新設計與實作，沒有複製原作程式碼。
- 依賴套件：three（MIT）、vite（MIT）、typescript（Apache-2.0）。

- [NOAA：廢棄漁具與生物纏繞](https://marinedebris.noaa.gov/what-marine-debris/derelict-fishing-gear)
- [NOAA：珊瑚白化](https://oceanservice.noaa.gov/facts/coral_bleach.html)
- [NOAA：海草與船隻傷害](https://floridakeys.noaa.gov/about/faqs.html)
