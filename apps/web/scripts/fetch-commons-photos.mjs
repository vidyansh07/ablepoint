// One-off, reproducible sourcing of regional landscape photos from Wikimedia Commons (open API, licence metadata included).
// Downloads a 1920px-wide JPEG per file and writes src/data/photos.generated.json (creator, licence, source URL).
// Only CC0 / CC BY / CC BY-SA files are accepted; anything else makes the script fail. See docs/19-creative-sourcing.md §3.
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const UA = { 'User-Agent': 'AblePointSiteSourcing/1.0 (licence-checked image sourcing for a website)' };
const FILES = {
  'central-coast': 'File:Sea cliffs at Terrigal with oncoming storm.jpg',
  newcastle: "File:Nobby's Lighthouse from Fort Drive, Newcastle.jpg",
  dubbo: 'File:Macquarie River (Wambuul) in Dubbo, NSW 2026 2.jpg',
  orange: 'File:Bandstand, Cook Park, Orange, July 2026 02.jpg',
  tamworth: 'File:Tamworth-lookout.jpg',
  gunnedah: 'File:Namoi-River Gunnedah.jpg',
};
const ALLOWED = /^(CC0|CC BY( \d|-SA \d)|CC BY-SA \d)/i;
const strip = (h) => (h ?? '').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&#039;/g, "'").replace(/\s+/g, ' ').trim();

const out = {};
mkdirSync(join(import.meta.dirname, '../src/assets/photos'), { recursive: true });
for (const [id, title] of Object.entries(FILES)) {
  const q = new URLSearchParams({ action: 'query', format: 'json', titles: title, prop: 'imageinfo', iiprop: 'url|size|extmetadata', iiurlwidth: '1920', iiextmetadatafilter: 'LicenseShortName|LicenseUrl|Artist|Credit|AttributionRequired|ImageDescription|DateTimeOriginal' });
  const j = await (await fetch(`https://commons.wikimedia.org/w/api.php?${q}`, { headers: UA })).json();
  const page = Object.values(j.query.pages)[0];
  const ii = page.imageinfo?.[0];
  if (!ii) throw new Error(`no imageinfo for ${title}`);
  const m = ii.extmetadata;
  const licence = m.LicenseShortName?.value ?? '';
  if (!ALLOWED.test(licence) || /NC|ND/.test(licence)) throw new Error(`${title}: licence "${licence}" not allowed`);
  const bytes = Buffer.from(await (await fetch(ii.thumburl, { headers: UA })).arrayBuffer());
  writeFileSync(join(import.meta.dirname, `../src/assets/photos/${id}.jpg`), bytes);
  out[id] = {
    id, title: title.replace(/^File:/, ''), source: 'Wikimedia Commons', page: ii.descriptionurl,
    creator: strip(m.Artist?.value) || strip(m.Credit?.value) || 'Unknown (see source page)',
    licence, licenceUrl: m.LicenseUrl?.value ?? '', attributionRequired: m.AttributionRequired?.value === 'true' || licence !== 'CC0',
    shareAlike: /SA/.test(licence), width: ii.thumbwidth, height: ii.thumbheight, originalWidth: ii.width, checked: '2026-11-03',
  };
  console.log(id.padEnd(14), licence.padEnd(12), out[id].creator.slice(0, 40).padEnd(40), `${(bytes.length / 1024) | 0} KB`);
}
writeFileSync(join(import.meta.dirname, '../src/data/photos.generated.json'), JSON.stringify(out, null, 2) + '\n');
