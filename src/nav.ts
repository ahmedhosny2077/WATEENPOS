import {
  LayoutDashboard,
  ShoppingBag,
  FileText,
  Undo2,
  Package,
  Warehouse,
  Truck,
  Users,
  Building2,
  Wallet,
  Landmark,
  BarChart3,
  Clock3,
  Bell,
  Settings,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  to: string;
  key: string;
  icon: LucideIcon;
  perm: string;
  locked?: boolean;
};

export type NavGroup = {
  id: string;
  label: string;
  icon: LucideIcon;
  items: NavItem[];
};

export const NAV_TOP: NavItem[] = [
  { to: "/home", key: "home", icon: LayoutDashboard, perm: "sales.view" },
];

export const NAV_GROUPS: NavGroup[] = [
  {
    id: "sales",
    label: "البيع",
    icon: ShoppingBag,
    items: [
      { to: "/pos", key: "pos", icon: ShoppingBag, perm: "sales.create", locked: true },
      { to: "/invoices", key: "invoices", icon: FileText, perm: "sales.view" },
      { to: "/returns", key: "returns", icon: Undo2, perm: "sales.return" },
    ],
  },
  {
    id: "catalog",
    label: "المخزون",
    icon: Warehouse,
    items: [
      { to: "/products", key: "products", icon: Package, perm: "products.view" },
      { to: "/inventory", key: "inventory", icon: Warehouse, perm: "stock.view" },
      { to: "/notifications", key: "alerts", icon: Bell, perm: "stock.view" },
      { to: "/purchases", key: "purchases", icon: Truck, perm: "purchases.view" },
    ],
  },
  {
    id: "parties",
    label: "العملاء والموردون",
    icon: Users,
    items: [
      { to: "/customers", key: "customers", icon: Users, perm: "customers.manage" },
      { to: "/suppliers", key: "suppliers", icon: Building2, perm: "suppliers.manage" },
    ],
  },
  {
    id: "finance",
    label: "المالية",
    icon: Landmark,
    items: [
      { to: "/expenses", key: "expenses", icon: Wallet, perm: "expenses.manage" },
      { to: "/cash", key: "cash", icon: Landmark, perm: "sales.view" },
    ],
  },
  {
    id: "ops",
    label: "المتابعة",
    icon: BarChart3,
    items: [
      { to: "/reports", key: "reports", icon: BarChart3, perm: "reports.view" },
      { to: "/shifts", key: "shifts", icon: Clock3, perm: "sales.view" },
    ],
  },
];

export const NAV_BOTTOM: NavItem[] = [
  { to: "/settings", key: "settings", icon: Settings, perm: "settings.manage", locked: true },
];

export const NAV_ITEMS: NavItem[] = [...NAV_TOP, ...NAV_GROUPS.flatMap((g) => g.items), ...NAV_BOTTOM];

export function groupIdForPath(pathname: string): string | null {
  for (const g of NAV_GROUPS) {
    if (g.items.some((i) => pathname === i.to || pathname.startsWith(`${i.to}/`))) return g.id;
  }
  return null;
}
