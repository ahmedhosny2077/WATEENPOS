import { create } from "zustand";
import type { ShiftDto } from "@/services/api";

export type ResumeCart = {
  customerId: number | null;
  invoiceDiscount: number;
  lines: {
    variantId: number;
    name: string;
    variantName: string;
    price: number;
    qty: number;
    discount: number;
    storeQty: number;
  }[];
};

type SessionState = {
  shift: ShiftDto | null;
  locked: boolean;
  shiftPrompt: boolean;
  resumeCart: ResumeCart | null;
  setShift: (s: ShiftDto | null) => void;
  lock: () => void;
  unlock: () => void;
  askOpenShift: () => void;
  closeShiftPrompt: () => void;
  setResumeCart: (c: ResumeCart | null) => void;
  can: (perm: string) => boolean;
};

export const useSession = create<SessionState>((set, get) => ({
  shift: null,
  locked: false,
  shiftPrompt: false,
  resumeCart: null,
  setShift: (s) => set({ shift: s, locked: false, shiftPrompt: false }),
  lock: () => set({ locked: true }),
  unlock: () => set({ locked: false }),
  askOpenShift: () => set({ shiftPrompt: true }),
  closeShiftPrompt: () => set({ shiftPrompt: false }),
  setResumeCart: (c) => set({ resumeCart: c }),
  can: (perm) => get().shift?.permissions.includes(perm) ?? false,
}));
