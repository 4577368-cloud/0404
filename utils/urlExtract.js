/**
 * Extract http(s) URLs from user text (deduped, order preserved).
 */
export function extractUrlsFromText(text) {
  if (!text) return [];
  const normalized = String(text)
    .replace(/[【〔［「『〈《（]/g, ' ')
    .replace(/[】〕］」』〉》）]/g, ' ')
    .replace(/[<>]/g, ' ');
  const re = /https?:\/\/[^\s<>()\[\]{}]+(?:\([^\s<>()\[\]{}]*\)|[^\s<>()\[\]{}.,，。；;！!？?)])*/gi;
  const seen = new Set();
  const out = [];
  let m;
  while ((m = re.exec(normalized)) !== null) {
    let url = m[0].replace(/[.,，。；;！!？?)]+$/, '');
    if (url.length < 8 || seen.has(url)) continue;
    seen.add(url);
    out.push(url);
  }
  return out;
}
