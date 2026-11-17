/**
 * 共用 GLSL 片段（原創撰寫）。
 * - oceanWaterColor：依視線方向計算水色（上方淺青藍 → 下方深藍），與天空球、霧化共用，避免接縫。
 * - applyUnderwaterFog：距離霧化 + 紅光吸收（越遠越偏藍綠）。
 * - causticPattern：以 Voronoi 邊緣模擬海底流動光紋。
 */
export const WATER_COLOR_GLSL = /* glsl */ `
vec3 oceanWaterColor(vec3 dir, vec3 camPos, vec3 sunDir) {
  float up = dir.y;
  vec3 abyss   = vec3(0.001, 0.010, 0.032);
  vec3 deep    = vec3(0.003, 0.045, 0.120);
  vec3 mid     = vec3(0.010, 0.130, 0.270);
  vec3 high    = vec3(0.040, 0.330, 0.480);
  vec3 shallow = vec3(0.150, 0.640, 0.760);
  vec3 c = mix(abyss, deep, smoothstep(-1.0, -0.3, up));
  c = mix(c, mid, smoothstep(-0.3, 0.08, up));
  c = mix(c, high, smoothstep(0.08, 0.5, up));
  c = mix(c, shallow, smoothstep(0.5, 1.0, up));
  float s = max(dot(dir, sunDir), 0.0);
  c += vec3(0.55, 0.90, 0.95) * pow(s, 18.0) * 0.9;
  c += vec3(0.10, 0.42, 0.50) * pow(s, 4.0) * 0.35;
  // 越深越暗
  c *= mix(0.45, 1.12, smoothstep(-42.0, -3.0, camPos.y));
  return c;
}
`;

export const FOG_APPLY_GLSL = /* glsl */ `
vec3 applyUnderwaterFog(vec3 color, vec3 worldPos, vec3 camPos, float density, vec3 sunDir) {
  vec3 toFrag = worldPos - camPos;
  float d = length(toFrag);
  vec3 dir = toFrag / max(d, 1e-4);
  // 深度造成的光照衰減：越深的物體越暗、越藍
  float depthLight = mix(0.55, 1.0, smoothstep(-40.0, -4.0, worldPos.y));
  color *= depthLight;
  // 水對紅光吸收較強，距離越遠越偏藍綠
  color *= exp(-vec3(0.055, 0.02, 0.013) * d);
  float f = 1.0 - exp(-pow(d * density, 1.25));
  return mix(color, oceanWaterColor(dir, camPos, sunDir), clamp(f, 0.0, 1.0));
}
`;

export const CAUSTIC_GLSL = /* glsl */ `
vec2 cHash2(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return fract(sin(p) * 43758.5453);
}
float causticLayer(vec2 p, float t) {
  vec2 ip = floor(p);
  vec2 fp = fract(p);
  float f1 = 8.0, f2 = 8.0;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 g = vec2(float(i), float(j));
      vec2 o = cHash2(ip + g);
      o = 0.5 + 0.42 * sin(t + 6.2831 * o);
      float d = length(g + o - fp);
      if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) { f2 = d; }
    }
  }
  return exp(-(f2 - f1) * 7.0);
}
float causticPattern(vec2 xz, float t, float layers) {
  vec2 warp = vec2(sin(xz.y * 0.31 + t * 0.6), cos(xz.x * 0.27 - t * 0.5)) * 0.7;
  float a = causticLayer(xz * 0.5 + warp, t * 0.9);
  if (layers < 1.5) return pow(a, 2.6) * 1.3;
  float b = causticLayer(xz * 0.71 - warp * 0.8 + 3.1, t * 1.15 + 1.7);
  return pow(min(a, b) * 1.15 + a * b * 0.6, 1.6);
}
`;
