export function looksLikeCode(s: string) {
  const t = s.trim();
  if (t.length < 6 || /\s/.test(t)) return false;
  if (/^\d{8,}$/.test(t)) return true;
  return /^[A-Za-z0-9._-]+$/.test(t) && /\d/.test(t);
}

export function phoneDigits(s: string) {
  return s.replace(/\D/g, "");
}

export function phoneLooksComplete(d: string) {
  if (d.length >= 11) return true;
  if (d.length >= 10 && (d.startsWith("05") || d.startsWith("5"))) return true;
  return false;
}

export function looksLikePhone(s: string) {
  const digits = phoneDigits(s);
  if (digits.length < 6) return false;
  const rest = s.replace(/[\d+\-\s().]/g, "");
  return rest.length === 0;
}

export function normalizeName(s: string) {
  return s.trim().replace(/\s+/g, " ");
}

export function saleTax(afterDisc: number, enabled: boolean, inclusive: boolean, bps: number) {
  if (!enabled || bps <= 0) return { tax: 0, grand: afterDisc };
  if (inclusive) {
    const tax = Math.round((afterDisc * bps) / (10_000 + bps));
    return { tax, grand: afterDisc };
  }
  const tax = Math.round((afterDisc * bps) / 10_000);
  return { tax, grand: afterDisc + tax };
}

export function isTouchPos(values: Record<string, string>) {
  return values["pos.display_mode"] === "touch";
}
