/** 介面圖示（內嵌 SVG，避免以 Emoji 取代正式圖示） */
const svg = (body: string, vb = '0 0 24 24') =>
  `<svg viewBox="${vb}" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

export const ICONS = {
  menu: svg('<path d="M4 7h16M4 12h16M4 17h16"/>'),
  close: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
  play: svg('<path d="M8 5.5v13l10.5-6.5z" fill="currentColor" stroke="none"/>'),
  help: svg('<circle cx="12" cy="12" r="9"/><path d="M9.6 9.3a2.5 2.5 0 1 1 3.4 2.3c-.7.3-1 .8-1 1.5v.4"/><circle cx="12" cy="16.9" r=".6" fill="currentColor"/>'),
  settings: svg('<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>'),
  up: svg('<path d="M12 19V6M6 11l6-6 6 6"/>'),
  down: svg('<path d="M12 5v13M6 13l6 6 6-6"/>'),
  hand: svg('<path d="M8 13V6.5a1.5 1.5 0 0 1 3 0V12M11 11V4.5a1.5 1.5 0 0 1 3 0V12M14 11.5V6a1.5 1.5 0 0 1 3 0v7c0 4-2.5 7-6 7-2.6 0-4-1.2-5.4-3.4L3.8 13.4a1.5 1.5 0 0 1 2.4-1.7L8 13.5"/>'),
  check: svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
  search: svg('<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>'),
  leaf: svg('<path d="M5 19c8 0 14-6 14-14-8 0-14 6-14 14z"/><path d="M5 19l7-7"/>'),
  wave: svg('<path d="M2 15c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2 2.5 2 5 2"/><path d="M2 19c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2 2.5 2 5 2"/>'),
  home: svg('<path d="M4 11l8-7 8 7v8.5a.5.5 0 0 1-.5.5H15v-6H9v6H4.5a.5.5 0 0 1-.5-.5z"/>'),
  restart: svg('<path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M4 4v4.5h4.5"/>'),
  compass: svg('<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/>'),
  turtle: svg(
    '<ellipse cx="32" cy="34" rx="15" ry="11" fill="#3f8f6b" stroke="#bff7e3" stroke-width="2"/>' +
      '<path d="M22 30l10-6 10 6-3 9h-14z" fill="none" stroke="#bff7e3" stroke-width="1.6"/>' +
      '<ellipse cx="32" cy="17" rx="5" ry="6" fill="#7fb38f" stroke="#bff7e3" stroke-width="2"/>' +
      '<path d="M18 27c-6-3-9-1-11 2 4 1 7 1 11 1M46 27c6-3 9-1 11 2-4 1-7 1-11 1M21 42c-3 3-4 6-3 8 3-1 5-3 6-5M43 42c3 3 4 6 3 8-3-1-5-3-6-5" fill="#7fb38f" stroke="#bff7e3" stroke-width="1.6"/>',
    '0 0 64 64',
  ),
  bottle: svg(
    '<path d="M27 8h10v6l3 6v34a3 3 0 0 1-3 3H27a3 3 0 0 1-3-3V20l3-6z" fill="#aee4ff" fill-opacity=".35" stroke="#e6f9ff" stroke-width="2"/>' +
      '<rect x="27" y="4" width="10" height="5" rx="1.5" fill="#2f7ff0" stroke="#e6f9ff" stroke-width="1.6"/>' +
      '<rect x="24" y="30" width="16" height="12" fill="#e8423f" stroke="#e6f9ff" stroke-width="1.6"/>' +
      '<path d="M24 36h16" stroke="#fff" stroke-width="2"/>',
    '0 0 64 64',
  ),
} as const;

/** 瑞秋卡森導覽頭像：原創平面插畫（非真人照片），以圓形頭像呈現。 */
export const GUIDE_AVATAR_SVG = `
<svg viewBox="0 0 120 120" role="img" aria-label="瑞秋卡森導覽頭像（插畫）">
  <defs>
    <radialGradient id="avBg" cx="50%" cy="35%" r="70%">
      <stop offset="0" stop-color="#5fe0d4"/>
      <stop offset="1" stop-color="#0b5b86"/>
    </radialGradient>
    <clipPath id="avClip"><circle cx="60" cy="60" r="58"/></clipPath>
  </defs>
  <circle cx="60" cy="60" r="58" fill="url(#avBg)"/>
  <g clip-path="url(#avClip)">
    <path d="M10 60c10-6 20-6 30 0s20 6 30 0 20-6 30 0 20 6 30 0" stroke="#bff7ef" stroke-opacity=".25" stroke-width="3" fill="none"/>
    <path d="M22 122c2-22 18-32 38-32s36 10 38 32z" fill="#1d3f6e"/>
    <path d="M48 92l12 12 12-12" fill="#f4f1ea"/>
    <rect x="52" y="74" width="16" height="16" rx="6" fill="#e9b996"/>
    <path d="M34 56c-2-20 10-32 26-32s28 12 26 32c-1 6-4 10-6 12-1-10-4-16-8-20-6 4-16 6-26 4-4 4-6 10-6 16-3-3-5-7-6-12z" fill="#6b4630"/>
    <ellipse cx="60" cy="58" rx="19" ry="22" fill="#f1c7a5"/>
    <path d="M40 50c4-12 14-16 22-16 9 0 16 5 19 14-8-3-14-8-17-12-5 7-14 12-24 14z" fill="#6b4630"/>
    <circle cx="52.5" cy="58" r="2.4" fill="#2d2a33"/>
    <circle cx="67.5" cy="58" r="2.4" fill="#2d2a33"/>
    <path d="M48 52.5c2.5-1.5 5.5-1.5 8 0M64 52.5c2.5-1.5 5.5-1.5 8 0" stroke="#5a3a28" stroke-width="1.6" fill="none" stroke-linecap="round"/>
    <path d="M53 68c4 3.5 10 3.5 14 0" stroke="#b5655a" stroke-width="2.2" fill="none" stroke-linecap="round"/>
    <circle cx="47" cy="65" r="3.2" fill="#f2a08a" opacity=".45"/>
    <circle cx="73" cy="65" r="3.2" fill="#f2a08a" opacity=".45"/>
  </g>
  <circle cx="60" cy="60" r="57" fill="none" stroke="#c8fff6" stroke-width="3"/>
</svg>`;
