import { createContext, useContext, type ReactNode } from "react";

const dict = {
  appName: "WATEEN POS",
  nav: {
    home: "الرئيسية",
    pos: "نقطة البيع",
    invoices: "الفواتير",
    returns: "المرتجعات",
    products: "المنتجات",
    inventory: "المخزون",
    alerts: "التنبيهات",
    purchases: "المشتريات",
    customers: "العملاء",
    suppliers: "الموردون",
    expenses: "المصروفات",
    cash: "الصندوق",
    reports: "التقارير",
    shifts: "الورديات",
    settings: "الإعدادات",
    backup: "النسخ الاحتياطي",
  },
};

const Ctx = createContext(dict);
export function I18nProvider({ children }: { children: ReactNode }) {
  return <Ctx.Provider value={dict}>{children}</Ctx.Provider>;
}
export const useT = () => useContext(Ctx);
