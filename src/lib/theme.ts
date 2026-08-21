import type { ThemeColors, ThemeConfig } from "../types";

/* ---------- 预设主题 ---------- */

export interface ThemePreset {
  id: string;
  name: string;
  palette: ThemeColors;
}

/** 12 个月度主题 + 2 个经典主题（配色来自 VineTurtleStudio/CSS/style.css） */
export const PRESETS: ThemePreset[] = [
  { id: "month-1", name: "1月 · 冬青", palette: { primary: "#5b6e7a", secondary: "#a3b6c4", bg: "#edf2f5", accent: "#7e94a0", text: "#354952" } },
  { id: "month-2", name: "2月 · 暖褐", palette: { primary: "#6b4e3a", secondary: "#b28c73", bg: "#f5ede8", accent: "#8c6c56", text: "#4a362a" } },
  { id: "month-3", name: "3月 · 新绿", palette: { primary: "#7eb36a", secondary: "#c8dfa4", bg: "#f7faf2", accent: "#9dcf86", text: "#3f5c34" } },
  { id: "month-4", name: "4月 · 樱粉", palette: { primary: "#d9928a", secondary: "#f0cdc8", bg: "#fdf6f5", accent: "#e5b2ab", text: "#775954" } },
  { id: "month-5", name: "5月 · 深林", palette: { primary: "#2a5c3a", secondary: "#88b17e", bg: "#e4efe1", accent: "#4a7c5b", text: "#23382c" } },
  { id: "month-6", name: "6月 · 夏橙", palette: { primary: "#5a8c4e", secondary: "#f1a35c", bg: "#f3f8eb", accent: "#8ab06b", text: "#374d2e" } },
  { id: "month-7", name: "7月 · 淡紫", palette: { primary: "#7b7a9c", secondary: "#c2c0d9", bg: "#f2f0f8", accent: "#a09fc0", text: "#484764" } },
  { id: "month-8", name: "8月 · 秋金", palette: { primary: "#bca45c", secondary: "#decb8c", bg: "#fcf8ee", accent: "#cbb874", text: "#635632" } },
  { id: "month-9", name: "9月 · 枫红", palette: { primary: "#9a4c4c", secondary: "#c68686", bg: "#f5edec", accent: "#b86969", text: "#5e3232" } },
  { id: "month-10", name: "10月 · 橙柿", palette: { primary: "#b85a32", secondary: "#e69b6a", bg: "#fcf3eb", accent: "#d07b4c", text: "#6a3822" } },
  { id: "month-11", name: "11月 · 灰蓝", palette: { primary: "#708090", secondary: "#b0bec5", bg: "#f0f2f4", accent: "#8da0ad", text: "#455560" } },
  { id: "month-12", name: "12月 · 松青", palette: { primary: "#1b3b29", secondary: "#4a6b5a", bg: "#e0e7e1", accent: "#335543", text: "#1a2b20" } },
  { id: "classic-light", name: "经典浅色", palette: { primary: "#3e956b", secondary: "#bcdfce", bg: "#fafaf9", accent: "#2d7853", text: "#1c1917" } },
  { id: "classic-dark", name: "经典深色", palette: { primary: "#5faf86", secondary: "#2d7853", bg: "#1c1917", accent: "#8fceb0", text: "#f5f5f4" } },
];

export const MONTHLY_PRESETS = PRESETS.filter((p) => p.id.startsWith("month-"));
export const CLASSIC_PRESETS = PRESETS.filter((p) => p.id.startsWith("classic-"));

export function findPreset(id: string): ThemePreset | undefined {
  return PRESETS.find((p) => p.id === id);
}

export function monthId(date: Date = new Date()): string {
  return `month-${date.getMonth() + 1}`;
}

/** 计算当前生效的主题（auto 模式跟随当前月份） */
export function activeTheme(config: ThemeConfig): { preset: ThemePreset; isDark: boolean } {
  if (config.mode === "custom" && config.custom) {
    return { preset: { id: "custom", name: "自定义主题", palette: config.custom }, isDark: isDarkPalette(config.custom) };
  }
  const id = config.mode === "preset" && config.preset_id ? config.preset_id : monthId();
  const preset = findPreset(id) ?? findPreset(monthId()) ?? PRESETS[12];
  return { preset, isDark: isDarkPalette(preset.palette) };
}

/* ---------- 颜色工具 ---------- */

interface RGB {
  r: number;
  g: number;
  b: number;
}

function hexToRgb(hex: string): RGB {
  let h = hex.trim().replace(/^#/, "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h, 16);
  if (Number.isNaN(n) || h.length !== 6) return { r: 128, g: 128, b: 128 };
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function toHex({ r, g, b }: RGB): string {
  const p = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
  return `#${p(r)}${p(g)}${p(b)}`;
}

/** 按比例混合两种颜色：t=0 返回 a，t=1 返回 b */
function mix(a: string, b: string, t: number): string {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  return toHex({ r: ca.r + (cb.r - ca.r) * t, g: ca.g + (cb.g - ca.g) * t, b: ca.b + (cb.b - ca.b) * t });
}

/** 感知亮度（0~1），判断是否深色背景 */
export function luminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

export function isDarkPalette(p: ThemeColors): boolean {
  return luminance(p.bg) < 0.4;
}

/* ---------- 由 5 个基础色推导整套 CSS 变量 ---------- */

/**
 * 应用主题到 :root。
 * - 非深色（浅色）主题：移除 .dark，覆盖 brand + base 全部色阶
 * - 深色主题：开启 .dark（沿用 Tailwind 深色 base 色阶保证对比度），仅覆盖 brand 主色
 */
export function applyThemeStyle(palette: ThemeColors | null, isDark: boolean): void {
  const root = document.documentElement;
  root.classList.toggle("dark", isDark);

  const defaults: [string, string][] = [
    ["--color-brand-50", "#f0f9f4"],
    ["--color-brand-100", "#dcf0e4"],
    ["--color-brand-200", "#bce0cc"],
    ["--color-brand-300", "#90caab"],
    ["--color-brand-400", "#5faf86"],
    ["--color-brand-500", "#3e956b"],
    ["--color-brand-600", "#2d7853"],
    ["--color-brand-700", "#256144"],
    ["--color-brand-800", "#204d39"],
    ["--color-brand-900", "#1c402f"],
    ["--color-base-50", "#fafaf9"],
    ["--color-base-100", "#f5f5f4"],
    ["--color-base-200", "#e7e5e4"],
    ["--color-base-300", "#d6d3d1"],
    ["--color-base-400", "#a8a29e"],
    ["--color-base-500", "#78716c"],
    ["--color-base-600", "#57534e"],
    ["--color-base-700", "#44403c"],
    ["--color-base-800", "#292524"],
    ["--color-base-900", "#1c1917"],
  ];
  defaults.forEach(([k, v]) => root.style.setProperty(k, v));

  if (!palette) return;

  const brand = buildBrandScale(palette.primary);
  Object.entries(brand).forEach(([k, v]) => root.style.setProperty(k, v));

  if (!isDark) {
    const base = buildBaseScale(palette.bg, palette.text);
    Object.entries(base).forEach(([k, v]) => root.style.setProperty(k, v));
  }
}

/** 由主色生成 brand-50..900 */
function buildBrandScale(primary: string): Record<string, string> {
  return {
    "--color-brand-50": mix(primary, "#ffffff", 0.88),
    "--color-brand-100": mix(primary, "#ffffff", 0.76),
    "--color-brand-200": mix(primary, "#ffffff", 0.58),
    "--color-brand-300": mix(primary, "#ffffff", 0.4),
    "--color-brand-400": mix(primary, "#ffffff", 0.2),
    "--color-brand-500": primary,
    "--color-brand-600": mix(primary, "#000000", 0.18),
    "--color-brand-700": mix(primary, "#000000", 0.32),
    "--color-brand-800": mix(primary, "#000000", 0.46),
    "--color-brand-900": mix(primary, "#000000", 0.58),
  };
}

/** 由背景/文字色生成 base-50..900（浅色主题用） */
function buildBaseScale(bg: string, text: string): Record<string, string> {
  return {
    "--color-base-50": mix(bg, text, 0.02),
    "--color-base-100": mix(bg, text, 0.07),
    "--color-base-200": mix(bg, text, 0.15),
    "--color-base-300": mix(bg, text, 0.28),
    "--color-base-400": mix(bg, text, 0.44),
    "--color-base-500": mix(bg, text, 0.58),
    "--color-base-600": mix(bg, text, 0.7),
    "--color-base-700": mix(bg, text, 0.8),
    "--color-base-800": mix(bg, text, 0.9),
    "--color-base-900": text,
  };
}