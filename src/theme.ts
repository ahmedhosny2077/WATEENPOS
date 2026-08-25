export type ThemeMode = "light" | "dark" | "system";

const KEY = "wateen-pos-theme";

export function readStoredTheme(): ThemeMode {
  try {
    const v = localStorage.getItem(KEY);
    if (v === "dark" || v === "light" || v === "system") return v;
  } catch {
    /* ignore */
  }
  return "light";
}

export function normalizeTheme(v?: string | null): ThemeMode {
  if (v === "dark" || v === "light" || v === "system") return v;
  return readStoredTheme();
}

export function resolvedDark(mode: ThemeMode): boolean {
  if (mode === "dark") return true;
  if (mode === "light") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

const ACCENTS = new Set(["rose", "gold", "emerald", "navy"]);
const NAV_SHAPES = new Set(["rounded", "pill", "square"]);
const NAV_COLORS = new Set(["rose", "white", "glass", "slate", "gold", "navy"]);

export const UI_FONT_MIN = 11;
export const UI_FONT_MAX = 18;
export const UI_FONT_DEFAULT = 13;

let lastZoom = 1;

export function parseUiFontSize(raw?: string | null) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return UI_FONT_DEFAULT;
  return Math.min(UI_FONT_MAX, Math.max(UI_FONT_MIN, Math.round(n)));
}

export function uiFontLabel(size: number) {
  if (size <= 11) return "صغير جداً";
  if (size === 12) return "صغير";
  if (size === 13) return "عادي";
  if (size === 14) return "متوسط";
  if (size === 15) return "كبير";
  if (size === 16) return "أكبر";
  return "كبير جداً";
}

export function computeUiZoom(requested: number) {
  const size = parseUiFontSize(String(requested));
  const wanted = size / UI_FONT_DEFAULT;
  const rawW = window.innerWidth * lastZoom;
  const rawH = window.innerHeight * lastZoom;
  const fit = Math.min(1.4, Math.max(0.8, Math.min(rawW / 1040, rawH / 620)));
  const zoom = Math.round(Math.min(wanted, fit) * 1000) / 1000;
  return {
    size,
    wanted,
    zoom,
    capped: wanted - zoom > 0.02,
    percent: Math.round(size * (100 / UI_FONT_DEFAULT)),
  };
}

function applyUiScale(requested: number) {
  const next = computeUiZoom(requested);
  lastZoom = next.zoom;
  const root = document.documentElement;
  root.style.zoom = String(next.zoom);
  root.style.fontSize = `${UI_FONT_DEFAULT}px`;
  return next;
}

export function applyChrome(s: Record<string, string>) {
  applyTheme(normalizeTheme(s["ui.theme"]));
  applyUiScale(parseUiFontSize(s["ui.font_size"]));
  const root = document.documentElement;
  const accent = (s["ui.accent"] || "rose").trim();
  root.dataset.accent = ACCENTS.has(accent) ? accent : "rose";
  const shape = (s["ui.nav_shape"] || "rounded").trim();
  root.dataset.navShape = NAV_SHAPES.has(shape) ? shape : "rounded";
  const navColor = (s["nav.color"] || "rose").trim();
  root.dataset.navColor = NAV_COLORS.has(navColor) ? navColor : "rose";
}

export function applyTheme(mode: ThemeMode) {
  const dark = resolvedDark(mode);
  const root = document.documentElement;
  root.classList.toggle("dark", dark);
  root.dataset.theme = dark ? "dark" : "light";
  /* Prevent Windows/WebView2 from auto-darkening light pages. */
  root.style.colorScheme = dark ? "dark" : "light only";
  syncColorSchemeMeta(mode, dark);
  try {
    localStorage.setItem(KEY, mode);
  } catch {
    /* ignore */
  }
  void syncNative(dark);
}

function syncColorSchemeMeta(mode: ThemeMode, dark: boolean) {
  let meta = document.querySelector("meta[name='color-scheme']");
  if (!meta) {
    meta = document.createElement("meta");
    meta.setAttribute("name", "color-scheme");
    document.head.appendChild(meta);
  }
  meta.setAttribute("content", mode === "system" ? "light dark" : dark ? "dark" : "light");
}

async function syncNative(dark: boolean) {
  try {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    await getCurrentWindow().setTheme(dark ? "dark" : "light");
  } catch {
    /* browser preview */
  }
}

export function bootTheme() {
  applyTheme(readStoredTheme());
}
