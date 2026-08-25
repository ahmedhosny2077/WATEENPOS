import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useEffect, useMemo } from "react";
import { ChevronDown, ChevronLeft, PanelRightClose } from "lucide-react";
import { useT } from "@/i18n";
import { useSession } from "@/stores/session";
import { usePrefs } from "@/stores/prefs";
import { useLicense } from "@/stores/license";
import { TopBar } from "@/layouts/TopBar";
import { NAV_BOTTOM, NAV_GROUPS, NAV_TOP, groupIdForPath, type NavItem } from "@/nav";
import { cmd } from "@/services/api";
import { OpenShiftModal } from "@/pages/ShiftGate";
import { BrandLogo } from "@/components/BrandLogo";
import { isTouchPos } from "@/pos/helpers";

const RAIL = 68;

function VerifiedBadge({ size = 16 }: { size?: number }) {
  return (
    <span className="inline-flex shrink-0" title="مفعّل بترخيص رسمي" aria-label="موثّق">
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
        <circle cx="12" cy="12" r="11" fill="#1D9BF0" />
        <path
          d="M7.2 12.4l3.1 3.2 6.5-7.2"
          fill="none"
          stroke="#fff"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

function parseClosed(raw?: string) {
  return new Set(
    (raw || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

export function AppShell() {
  const t = useT();
  const loc = useLocation();
  const { shift, can, shiftPrompt, closeShiftPrompt, setShift } = useSession();
  const show = usePrefs((p) => p.show);
  const width = usePrefs((p) => p.width);
  const collapsed = usePrefs((p) => p.collapsed);
  const patch = usePrefs((p) => p.patch);
  const apply = usePrefs((p) => p.applySettings);
  const values = usePrefs((p) => p.values);
  const licensed = useLicense((s) => s.info?.status === "licensed");

  useEffect(() => {
    cmd<Record<string, string>>("get_settings").then(apply).catch(() => {});
  }, [apply]);

  const navColor = values["nav.color"] || "rose";
  const lightNav = navColor === "white" || navColor === "glass";
  const touchPos = loc.pathname === "/pos" && isTouchPos(values);
  const rail = collapsed || touchPos;
  const asideWidth = rail ? RAIL : width;

  function toggleCollapse() {
    patch("nav.collapsed", collapsed ? "0" : "1", true);
  }

  function visible(item: NavItem) {
    if (show[item.key] === false) return false;
    if (!shift) return true;
    return can(item.perm) || item.perm === "sales.view" || shift.roleCode === "administrator";
  }

  const topItems = NAV_TOP.filter(visible);
  const bottomItems = NAV_BOTTOM.filter(visible);
  const groups = useMemo(
    () =>
      NAV_GROUPS.map((g) => ({ ...g, items: g.items.filter(visible) })).filter((g) => g.items.length > 0),
    [show, shift],
  );

  const activeGroup = groupIdForPath(loc.pathname);
  const closed = parseClosed(values["nav.groups.closed"]);

  useEffect(() => {
    if (!activeGroup || collapsed) return;
    const set = parseClosed(usePrefs.getState().values["nav.groups.closed"]);
    if (!set.has(activeGroup)) return;
    set.delete(activeGroup);
    patch("nav.groups.closed", [...set].join(","), true);
  }, [loc.pathname, activeGroup, collapsed, patch]);

  function isGroupOpen(id: string) {
    return !closed.has(id);
  }

  function toggleGroup(id: string) {
    const set = new Set(closed);
    if (set.has(id)) set.delete(id);
    else set.add(id);
    patch("nav.groups.closed", [...set].join(","), true);
  }

  function itemClass(isActive: boolean, nested = false) {
    return `nav-item min-h-[2.5rem] flex items-center text-[13px] font-semibold leading-5 ${
      rail ? "justify-center px-0" : nested ? "gap-2.5 px-3 ps-9" : "gap-2.5 px-3"
    } ${
      isActive
        ? lightNav
          ? "bg-rose-700 text-white shadow-sm"
          : "bg-white text-rose-800 shadow-sm"
        : lightNav
          ? "text-slate-700 hover:bg-slate-100"
          : "text-rose-50 hover:bg-white/10"
    }`;
  }

  function renderItem(i: NavItem, nested = false) {
    const Icon = i.icon;
    const label = t.nav[i.key as keyof typeof t.nav];
    return (
      <NavLink
        key={i.to}
        to={i.to}
        end={i.to === "/home"}
        title={rail ? label : undefined}
        className={({ isActive }) => itemClass(isActive, nested && !rail)}
      >
        <Icon size={18} strokeWidth={2.1} className="shrink-0" />
        {rail ? <span className="sr-only">{label}</span> : <span className="min-w-0 flex-1 whitespace-nowrap">{label}</span>}
      </NavLink>
    );
  }

  return (
    <div className="h-full flex flex-col bg-app">
      <TopBar />
      <div className="flex-1 min-h-0 flex">
        <aside
          className={`brand-bar shrink-0 flex flex-col overflow-hidden transition-[width] duration-200 ${
            lightNav ? "text-slate-800" : "text-rose-50"
          }`}
          style={{ width: asideWidth }}
        >
          <div
            className={`shrink-0 border-b ${lightNav ? "border-slate-200" : "border-white/10"} ${
              rail ? "px-1.5 py-2 grid place-items-center" : "px-3 py-2.5"
            }`}
          >
            {rail ? (
              <div className="flex flex-col items-center gap-1">
                <button
                  type="button"
                  onClick={touchPos ? undefined : toggleCollapse}
                  disabled={touchPos}
                  title={touchPos ? "القائمة مختصرة أثناء وضع اللمس" : "توسيع الشريط الجانبي"}
                  aria-label={touchPos ? "القائمة مختصرة أثناء وضع اللمس" : "توسيع الشريط الجانبي"}
                  aria-expanded={false}
                  className={`rounded-xl overflow-hidden transition ring-offset-0 ${
                    lightNav ? "hover:ring-2 hover:ring-slate-200" : "hover:ring-2 hover:ring-white/20"
                  }`}
                >
                  <BrandLogo className="h-10 w-10" />
                </button>
                {licensed ? <VerifiedBadge size={14} /> : null}
              </div>
            ) : (
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <BrandLogo className="h-10 w-10 rounded-xl" />
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <div className={`text-[10px] tracking-widest ${lightNav ? "text-slate-400" : "text-gold-light"}`}>
                        WATEEN POS
                      </div>
                      {licensed ? <VerifiedBadge /> : null}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={toggleCollapse}
                  title="طي الشريط الجانبي"
                  aria-label="طي الشريط الجانبي"
                  aria-expanded={true}
                  className={`h-8 w-8 shrink-0 rounded-lg grid place-items-center transition ${
                    lightNav ? "hover:bg-slate-100 text-slate-500" : "hover:bg-white/10 text-rose-100"
                  }`}
                >
                  <PanelRightClose size={16} />
                </button>
              </div>
            )}
          </div>
          <nav className={`flex-1 min-h-0 overflow-y-auto overflow-x-hidden ${rail ? "p-1.5 space-y-1" : "p-2 space-y-1"}`}>
            {topItems.map((i) => renderItem(i))}

            {rail
              ? groups.flatMap((g) => g.items.map((i) => renderItem(i)))
              : groups.map((g) => {
                  const open = isGroupOpen(g.id);
                  const GroupIcon = g.icon;
                  const childActive = g.items.some((i) => loc.pathname === i.to || loc.pathname.startsWith(`${i.to}/`));
                  return (
                    <div key={g.id} className="pt-1">
                      <button
                        type="button"
                        onClick={() => toggleGroup(g.id)}
                        aria-expanded={open}
                        className={`nav-item w-full h-9 px-2.5 flex items-center gap-2 text-[12px] font-bold tracking-wide ${
                          lightNav
                            ? childActive
                              ? "text-rose-800 bg-rose-50/80"
                              : "text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                            : childActive
                              ? "text-white bg-white/10"
                              : "text-rose-100/80 hover:bg-white/10 hover:text-white"
                        }`}
                      >
                        <GroupIcon size={15} strokeWidth={2.2} className="shrink-0 opacity-90" />
                        <span className="min-w-0 flex-1 text-right truncate">{g.label}</span>
                        {open ? <ChevronDown size={14} className="shrink-0 opacity-80" /> : <ChevronLeft size={14} className="shrink-0 opacity-80" />}
                      </button>
                      {open ? <div className="mt-0.5 space-y-0.5">{g.items.map((i) => renderItem(i, true))}</div> : null}
                    </div>
                  );
                })}

            <div className={`mt-1 pt-1 ${lightNav ? "border-t border-slate-200" : "border-t border-white/10"}`}>
              {bottomItems.map((i) => renderItem(i))}
            </div>
          </nav>
          <div
            className={`shrink-0 mb-2 rounded-xl font-semibold truncate ${
              rail ? "mx-1.5 px-0 py-2 text-center text-sm" : "mx-2 px-3 py-2 text-[12px]"
            } ${lightNav ? "bg-slate-100 text-slate-700" : "bg-black/15"}`}
            title={shift?.userName || "لا توجد وردية مفتوحة"}
          >
            {rail ? (shift?.userName || "—").slice(0, 1) : shift?.userName || "لا توجد وردية مفتوحة"}
          </div>
        </aside>
        <main className="flex-1 min-h-0 overflow-auto">
          <Outlet />
        </main>
      </div>
      <OpenShiftModal open={shiftPrompt} onClose={closeShiftPrompt} onOpened={setShift} />
    </div>
  );
}
