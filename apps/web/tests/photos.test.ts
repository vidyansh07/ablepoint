import { describe, expect, it } from 'vitest';
import generated from '../src/data/photos.generated.json';
import { findBannedPhrases } from '@ablepoint/schemas';
import { regions } from '../src/data/regions';

type G = { id: string; title: string; source: string; page: string; creator: string; licence: string; licenceUrl: string; shareAlike: boolean; checked: string };
const photos = Object.values(generated as Record<string, G>);

describe('photo register', () => {
  it('has a photo for every region', () => expect(photos.map((p) => p.id).sort()).toEqual(regions.map((r) => r.slug).sort()));
  it('only accepts CC0, CC BY or CC BY-SA licences (no NC/ND)', () => {
    for (const p of photos) { expect(p.licence).toMatch(/^(CC0|CC BY( \d|-SA \d))/); expect(p.licence).not.toMatch(/NC|ND/); }
  });
  it('every photo names a creator, links its source page and licence, and records the date checked', () => {
    for (const p of photos) {
      expect(p.creator.length).toBeGreaterThan(2);
      expect(p.creator).not.toMatch(/unknown/i);
      expect(p.page).toMatch(/^https:\/\/commons\.wikimedia\.org\/wiki\/File:/);
      expect(p.licenceUrl).toMatch(/^(https?:)?\/\/creativecommons\.org\//);
      expect(p.checked).toBe('2026-11-03');
    }
  });
  it('share-alike flag matches the licence name', () => { for (const p of photos) expect(p.shareAlike).toBe(/SA/.test(p.licence)); });
  it('alt text and titles pass the content lint', async () => {
    const src = await import('../src/data/photos');
    for (const p of src.photos) { expect(p.alt.length).toBeGreaterThan(20); expect(findBannedPhrases(p.alt)).toEqual([]); }
  });
});

describe('people-photo gate (docs/19 §3)', () => {
  it('production hides recognisable-people photos without a release or a named risk acceptance', async () => {
    const { photoAllowed } = await import('../src/data/photos');
    expect(photoAllowed({ people: false, release: 'not-applicable', riskAcceptedBy: null }, 'production')).toBe(true);
    expect(photoAllowed({ people: true, release: 'none', riskAcceptedBy: null }, 'production')).toBe(false);
    expect(photoAllowed({ people: true, release: 'none', riskAcceptedBy: 'Jo Compliance' }, 'production')).toBe(true);
    expect(photoAllowed({ people: true, release: 'provided', riskAcceptedBy: null }, 'production')).toBe(true);
    expect(photoAllowed({ people: true, release: 'none', riskAcceptedBy: null }, 'staging')).toBe(true);
  });
});

describe('add-photo importer', () => {
  it('registers a photo with licence data and flags people photos as not production-ready', async () => {
    const { execFileSync } = await import('node:child_process');
    const { mkdtempSync, readFileSync, writeFileSync, rmSync, existsSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const sharp = (await import('sharp')).default;
    const dir = mkdtempSync(join(tmpdir(), 'ap-photo-'));
    const img = join(dir, 'x.jpg');
    await sharp({ create: { width: 2400, height: 1600, channels: 3, background: '#6785ab' } }).jpeg().toFile(img);
    const web = new URL('..', import.meta.url).pathname;
    const reg = join(web, 'src/data/photos.registry.json');
    const before = readFileSync(reg, 'utf8');
    try {
      const out = execFileSync('node', ['scripts/photos/add-photo.mjs', img, '--id', 'zz-test-photo', '--creator', 'Test Creator', '--source-url', 'https://pixabay.com/photos/test-123/', '--licence', 'Pixabay Content License', '--licence-url', 'https://pixabay.com/service/license-summary/', '--alt', 'A synthetic blue test image used only in tests', '--people', 'yes'], { cwd: web, encoding: 'utf8' });
      const r = JSON.parse(out);
      expect(r.productionReady).toBe(false);
      const saved = JSON.parse(readFileSync(reg, 'utf8'))['zz-test-photo'];
      expect(saved.release).toBe('none');
      expect(saved.width).toBe(1920);
      expect(saved.riskAcceptedBy).toBeNull();
    } finally {
      writeFileSync(reg, before);
      rmSync(join(web, 'src/assets/photos/zz-test-photo.jpg'), { force: true });
      rmSync(dir, { recursive: true, force: true });
    }
    expect(existsSync(join(web, 'src/assets/photos/zz-test-photo.jpg'))).toBe(false);
  });
});

describe('pixabay-search helpers', () => {
  it('builds an official-API URL with safe search and a size floor, and maps hits to licence-carrying records', async () => {
    const m = await import('../scripts/photos/pixabay-search.mjs');
    const url = new URL(m.buildUrl('KEY', 'support worker', { count: 99 }));
    expect(url.origin + url.pathname).toBe('https://pixabay.com/api/');
    expect(url.searchParams.get('safesearch')).toBe('true');
    expect(url.searchParams.get('min_width')).toBe('1600');
    expect(url.searchParams.get('per_page')).toBe('50');
    const hits = m.parseHits({ hits: [{ id: 1, user: 'someone', user_id: 5, pageURL: 'https://pixabay.com/photos/x-1/', tags: 'a, b', imageWidth: 4000, imageHeight: 3000, webformatURL: 'https://cdn.pixabay.com/x.jpg' }] });
    expect(hits[0]).toMatchObject({ creator: 'someone', license: 'Pixabay Content License', page: 'https://pixabay.com/photos/x-1/' });
  });
});
