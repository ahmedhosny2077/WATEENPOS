import { applyChrome, applyTheme, normalizeTheme } from "@/theme";
import { create } from "zustand";
import { NAV_ITEMS } from "@/nav";
import { cmd } from "@/services/api";

export type SaveStatus = "idle" | "saving" | "saved" | "error";

type Prefs = {
  values: Record<string, string>;
  show: Record<string, boolean>;
  width: number;
  collapsed: boolean;
  status: SaveStatus;
  applySettings: (s: Record<string, string>) => void;
  patch: (key: string, value: string, immediate?: boolean) => void;
  persistNow: () => Promise<void>;
};

const defaults = Object.fromEntries(NAV_ITEMS.map((i) => [i.key, true]));

function derived(s: Record<string, string>) {
  return {
    values: s,
    show: Object.fromEntries(
      NAV_ITEMS.map((i) => [i.key, i.locked ? true : s[`nav.show.${i.key}`] !== "0"]),
    ),
    width: Math.min(300, Math.max(248, Number(s["nav.width"] || 252) || 252)),
    collapsed: s["nav.collapsed"] === "1",
  };
}

let timer: number | undefined;
let token = 0;
let pending: Record<string, string> | null = null;

async function flush(values: Record<string, string>) {
  const mine = ++token;
  usePrefs.setState({ status: "saving" });
  try {
    await cmd("save_settings", { values, overridePin: null });
    if (mine === token) usePrefs.setState({ status: "saved" });
  } catch {
    if (mine === token) usePrefs.setState({ status: "error" });
  }
}

function schedule(values: Record<string, string>, immediate: boolean) {
  pending = values;
  window.clearTimeout(timer);
  if (immediate) {
    void flush(values);
    return;
  }
  timer = window.setTimeout(() => {
    if (pending) void flush(pending);
  }, 400);
}

export const usePrefs = create<Prefs>((set, get) => ({
  values: {},
  show: { ...defaults },
  width: 252,
  collapsed: false,
  status: "idle",
  applySettings: (s) => {
    applyChrome(s);
    set({ ...derived(s), status: "idle" });
  },
  patch: (key, value, immediate = false) => {
    const values = { ...get().values, [key]: value };
    if (key === "ui.theme") applyTheme(normalizeTheme(value));
    if (key === "ui.font_size" || key === "ui.accent" || key === "ui.nav_shape" || key === "ui.theme" || key === "nav.color") {
      applyChrome(values);
    }
    set({ ...derived(values), status: "saving" });
    schedule(values, immediate);
  },
  persistNow: async () => {
    window.clearTimeout(timer);
    const values = pending || get().values;
    if (Object.keys(values).length) await flush(values);
  },
}));

export function settingFlag(values: Record<string, string>, key: string, defaultOn: boolean) {
  const v = values[key];
  if (v == null || v === "") return defaultOn;
  return v !== "0";
}

export function settingNum(values: Record<string, string>, key: string, fallback: number) {
  const n = Number(values[key]);
  return Number.isFinite(n) ? n : fallback;
}
