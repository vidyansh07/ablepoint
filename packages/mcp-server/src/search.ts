import type { SearchItem } from './schemas';

const STOP_WORDS = new Set(['the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'for', 'on', 'with', 'is', 'are', 'do', 'does', 'how', 'what', 'i', 'my', 'can', 'me', 'we', 'you', 'it']);

/** Lower-case words, light plural handling, no stop words. */
export function tokenise(input: string): string[] {
  const words = input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length > 0 && !STOP_WORDS.has(w));
  return words.map(stem);
}

function stem(w: string): string {
  if (w.length > 4 && w.endsWith('ies')) return w.slice(0, -3) + 'y';
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1);
  return w;
}

export interface ScoredItem {
  item: SearchItem;
  score: number;
}

/**
 * Simple token scoring over the published search index. For each query token: title word 5, title substring 3, id 3,
 * summary word 2, summary substring 1, content type 2. Every token matched somewhere adds 3 in total; a multi-word query found as a
 * phrase in the title adds 5, and a title made of exactly the query words adds 6. Ties: newest updatedAt first, then title.
 */
export function scoreItems(items: readonly SearchItem[], query: string): ScoredItem[] {
  const q = [...new Set(tokenise(query))];
  if (q.length === 0) return [];
  const phrase = query.toLowerCase().replace(/\s+/g, ' ').trim();
  const scored: ScoredItem[] = [];
  for (const item of items) {
    const titleWords = new Set(tokenise(item.title));
    const summaryWords = new Set(tokenise(item.summary ?? ''));
    const idWords = new Set(tokenise(item.id));
    const title = item.title.toLowerCase();
    const summary = (item.summary ?? '').toLowerCase();
    const type = item.type.toLowerCase();
    let score = 0;
    let matchedAll = true;
    for (const t of q) {
      let s = 0;
      if (titleWords.has(t)) s += 5;
      else if (title.includes(t)) s += 3;
      if (idWords.has(t)) s += 3;
      if (summaryWords.has(t)) s += 2;
      else if (summary.includes(t)) s += 1;
      if (stem(type) === t) s += 2;
      if (s === 0) matchedAll = false;
      score += s;
    }
    if (score === 0) continue;
    if (matchedAll && q.length > 1) score += 3;
    if (q.length > 1 && title.includes(phrase)) score += 5;
    if (titleWords.size === q.length && q.every((t) => titleWords.has(t))) score += 6; // the title is exactly what was asked for
    scored.push({ item, score });
  }
  scored.sort(
    (a, b) =>
      b.score - a.score ||
      (Date.parse(b.item.updatedAt ?? '') || 0) - (Date.parse(a.item.updatedAt ?? '') || 0) ||
      a.item.title.localeCompare(b.item.title),
  );
  return scored;
}
