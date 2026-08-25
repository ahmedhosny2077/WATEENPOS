import { create } from "zustand";

const KEY = "wateen-pos.notifications.seen";
const MAX = 800;

function loadSeen(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "[]") as unknown;
    if (!Array.isArray(raw)) return [];
    return raw.map(String).slice(-MAX);
  } catch {
    return [];
  }
}

function saveSeen(ids: string[]) {
  localStorage.setItem(KEY, JSON.stringify(ids.slice(-MAX)));
}

type NotifySeen = {
  seen: string[];
  markRead: (ids: string[]) => void;
  markAll: (ids: string[]) => void;
  unreadOf: (ids: string[]) => string[];
};

export const useNotifySeen = create<NotifySeen>((set, get) => ({
  seen: loadSeen(),
  markRead: (ids) => {
    if (!ids.length) return;
    const next = [...new Set([...get().seen, ...ids])].slice(-MAX);
    saveSeen(next);
    set({ seen: next });
  },
  markAll: (ids) => get().markRead(ids),
  unreadOf: (ids) => {
    const seen = new Set(get().seen);
    return ids.filter((id) => !seen.has(id));
  },
}));
