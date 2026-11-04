// Adds one photo to the site register (docs/19 §3, docs/21).
//   node scripts/photos/add-photo.mjs <image> --id hero-home --creator "Name" --source-url URL --licence "Pixabay Content License" \
//        --licence-url URL --alt "Describe the scene" --people yes|no [--release none|provided|not-applicable] [--share-alike] [--source Pixabay]
// Resizes to <= 1920px wide (JPEG, metadata stripped), writes src/assets/photos/<id>.jpg and src/data/photos.registry.json.
// Photos with recognisable PEOPLE and no model release are registered as needing a named risk acceptance before they can
// appear in a production build (see src/data/photos.ts). Nothing here contacts the network.
import sharp from 'sharp';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
const val = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : undefined; };
const flag = (f) => args.includes(f);
const die = (m) => { console.error(JSON.stringify({ ok: false, error: m })); process.exit(1); };

const need = (n) => val(n) ?? die(`missing ${n}`);
if (!file || !existsSync(resolve(file))) die('usage: add-photo.mjs <image> --id ... (image not found)');
const id = need('--id');
if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id)) die('--id must be lowercase letters, numbers and hyphens');
const creator = need('--creator');
const sourceUrl = need('--source-url');
if (!/^https:\/\//.test(sourceUrl)) die('--source-url must be https');
const licence = need('--licence');
const licenceUrl = need('--licence-url');
const alt = need('--alt');
if (alt.length < 20) die('--alt should describe the scene (at least 20 characters)');
const people = need('--people');
if (!['yes', 'no'].includes(people)) die('--people must be yes or no');
const release = val('--release') ?? (people === 'yes' ? 'none' : 'not-applicable');
if (!['none', 'provided', 'not-applicable'].includes(release)) die('--release must be none, provided or not-applicable');

const root = new URL('../../', import.meta.url).pathname;
mkdirSync(join(root, 'src/assets/photos'), { recursive: true });
const img = sharp(resolve(file)).rotate();
const meta = await img.metadata();
const out = join(root, `src/assets/photos/${id}.jpg`);
await img.resize({ width: 1920, withoutEnlargement: true }).jpeg({ quality: 82, mozjpeg: true }).toFile(out);
const outMeta = await sharp(out).metadata();

const regPath = join(root, 'src/data/photos.registry.json');
const reg = JSON.parse(readFileSync(regPath, 'utf8'));
reg[id] = {
  id, title: val('--title') ?? id, source: val('--source') ?? new URL(sourceUrl).hostname.replace(/^www\./, ''), page: sourceUrl, creator,
  licence, licenceUrl, alt, shareAlike: flag('--share-alike'), people: people === 'yes', release,
  width: outMeta.width, height: outMeta.height, originalWidth: meta.width, checked: new Date().toISOString().slice(0, 10),
  // Recognisable people without a release need a named person to accept the risk before production use.
  riskAcceptedBy: null, riskAcceptedAt: null,
};
writeFileSync(regPath, JSON.stringify(reg, null, 2) + '\n');
console.log(JSON.stringify({ ok: true, id, file: `src/assets/photos/${id}.jpg`, people: reg[id].people, release, productionReady: !reg[id].people || release === 'provided' }, null, 2));
