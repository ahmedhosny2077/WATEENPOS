import { create } from "zustand";
import type { LicenseStatus } from "@/services/api";

type S = {
  info: LicenseStatus | null;
  setInfo: (info: LicenseStatus) => void;
};

export const useLicense = create<S>((set) => ({
  info: null,
  setInfo: (info) => set({ info }),
}));
