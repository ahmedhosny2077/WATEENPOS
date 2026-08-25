import { invoke } from "@tauri-apps/api/core";

export async function cmd<T>(name: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(name, args);
  } catch (e) {
    throw new Error(typeof e === "string" ? e : "حدث خطأ غير متوقع.");
  }
}

export type ShiftDto = {
  id: number;
  userId: number;
  userName: string;
  roleCode: string;
  openingCash: number;
  openedAt: string;
  permissions: string[];
};

export type AppStatus = {
  initialized: boolean;
  openShift: ShiftDto | null;
  lockMinutes: number;
};

export type LicenseStatus = {
  status: "licensed" | "trial" | "expired";
  machineId: string;
  daysRemaining: number;
  expiry: string | null;
  message: string;
  licenseKey?: string;
};

export type ProductRow = {
  id: number;
  variantId: number;
  name: string;
  variantName: string;
  brand?: string | null;
  category?: string | null;
  sku?: string | null;
  barcode?: string | null;
  price: number;
  storeQty: number;
  warehouseQty: number;
  imagePath?: string | null;
  isActive: number;
};

export const money = (piastres: number) =>
  new Intl.NumberFormat("ar-EG", {
    style: "decimal",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(piastres / 100) + " ج.م";

export const qty = (n: number) => new Intl.NumberFormat("ar-EG").format(n);
