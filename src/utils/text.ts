export function cleanDisplayName(raw?: string | null) {
  let s = (raw || "").trim();
  if (!s) return "";
  for (let i = 0; i < 3; i++) {
    s = s
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&quot;/gi, '"')
      .replace(/&#39;|&apos;/gi, "'")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
      .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));
  }
  s = s.replace(/^(?:amp|gt|lt|quot);+/gi, "");
  s = s.replace(/^[&<>#\s]+/, "").replace(/[&<>#\s]+$/, "");
  return s.replace(/\s+/g, " ").trim();
}

export function nameInitial(raw?: string | null) {
  const name = cleanDisplayName(raw);
  const ch = [...name].find((c) => /[\p{L}\p{N}]/u.test(c));
  return ch ? ch.toUpperCase() : "•";
}
