// Search Pixabay through its OFFICIAL API (needs a free API key from a Pixabay account; never commit it).
//   PIXABAY_KEY=... node scripts/photos/pixabay-search.mjs "support worker kitchen" --count 12 [--out ./pixabay-previews] [--people-only]
// Writes small preview images and a candidates.json (id, creator, page URL, tags, sizes) to --out (default: a temp folder outside the repo).
// Then, for each photo you choose, download the full image in your browser from its Pixabay page (the site blocks scripts),
// and run scripts/photos/add-photo.mjs with the page URL and creator shown here.
// Pixabay does NOT supply model releases: any photo of recognisable people stays out of production until a named person
// accepts the risk (see src/data/photos.ts). Untested against the live API (no key available when written).
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export function parseHits(json) {
  return (json.hits ?? []).map((h) => ({
    id: h.id, creator: h.user, creatorUrl: `https://pixabay.com/users/${h.user}-${h.user_id}/`, page: h.pageURL, tags: h.tags,
    width: h.imageWidth, height: h.imageHeight, preview: h.webformatURL, license: 'Pixabay Content License', licenseUrl: 'https://pixabay.com/service/license-summary/',
  }));
}
export function buildUrl(key, q, { count = 12, orientation = 'horizontal' } = {}) {
  const p = new URLSearchParams({ key, q, image_type: 'photo', orientation, safesearch: 'true', min_width: '1600', per_page: String(Math.min(Math.max(count, 3), 50)), order: 'popular' });
  return `https://pixabay.com/api/?${p}`;
}

async function main() {
  const args = process.argv.slice(2);
  const q = args.find((a) => !a.startsWith('--'));
  const val = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : undefined; };
  const key = process.env.PIXABAY_KEY;
  if (!q || !key) throw new Error('usage: PIXABAY_KEY=... node pixabay-search.mjs "query" [--count 12] [--out dir]');
  const out = resolve(val('--out') ?? join(tmpdir(), 'pixabay-previews'));
  mkdirSync(out, { recursive: true });
  const res = await fetch(buildUrl(key, q, { count: Number(val('--count') ?? 12) }));
  if (!res.ok) throw new Error(`Pixabay API returned ${res.status}`);
  const hits = parseHits(await res.json());
  for (const h of hits) {
    const img = await fetch(h.preview);
    if (img.ok) writeFileSync(join(out, `${h.id}.jpg`), Buffer.from(await img.arrayBuffer()));
  }
  writeFileSync(join(out, 'candidates.json'), JSON.stringify(hits, null, 2));
  console.log(JSON.stringify({ query: q, found: hits.length, out }, null, 2));
}
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main().catch((e) => { console.error(e.message); process.exit(1); });
