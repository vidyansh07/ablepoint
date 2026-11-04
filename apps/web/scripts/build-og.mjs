// Renders the default Open Graph / social share image (1200x630) from brand parts: the PRESERVED logo, the Gathering ring, and brand type.
// Uses the installed Chrome via Playwright so the self-hosted font renders exactly as on the site. Output: public/og-default.png
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const root = new URL('../', import.meta.url).pathname;
const logo = readFileSync(`${root}src/assets/brand/logo.jpg`).toString('base64');
const font400 = pathToFileURL(`${root}node_modules/@fontsource/atkinson-hyperlegible/files/atkinson-hyperlegible-latin-400-normal.woff2`).href;
const font700 = pathToFileURL(`${root}node_modules/@fontsource/atkinson-hyperlegible/files/atkinson-hyperlegible-latin-700-normal.woff2`).href;
const pills = [0, 1, 2, 3, 4, 5, 6, 7]
  .map((i) => {
    const c = ['#6785ab', '#bdcc7e', '#7c5889', '#d0976e'][i % 4];
    return `<rect x="92" y="20" width="16" height="${i % 2 ? 36 : 50}" rx="8" fill="${c}" transform="rotate(${i * 45} 100 100)"/>`;
  })
  .join('');
const html = `<!doctype html><meta charset="utf-8"><style>
@font-face{font-family:A;font-weight:400;src:url(${font400})}@font-face{font-family:A;font-weight:700;src:url(${font700})}
*{box-sizing:border-box}body{margin:0;width:1200px;height:630px;background:#fbf9f6;font-family:A,system-ui,sans-serif;color:#1b2433;position:relative;overflow:hidden}
.bg{position:absolute;inset:0;background:linear-gradient(180deg,#f3f6fb,#fbf9f6)}
.ring{position:absolute;right:-210px;top:-60px;width:760px;height:760px;opacity:.9}
.plate{position:absolute;left:72px;top:72px;background:#fff;border-radius:24px;padding:20px 28px;box-shadow:0 6px 24px rgba(30,53,83,.12)}
.plate img{width:300px;display:block}
h1{position:absolute;left:72px;top:230px;margin:0;width:640px;font-size:76px;line-height:1.08;color:#1e3553;letter-spacing:-.02em}
p{position:absolute;left:72px;top:470px;margin:0;width:620px;font-size:30px;line-height:1.4;color:#4b5568}
.bar{position:absolute;left:0;right:0;bottom:0;height:16px;background:linear-gradient(90deg,#6785ab,#bdcc7e,#7c5889,#d0976e)}
</style><div class="bg"></div>
<svg class="ring" viewBox="0 0 200 200">${pills}<circle cx="100" cy="100" r="12" fill="#2c5282"/></svg>
<div class="plate"><img src="data:image/jpeg;base64,${logo}" alt=""></div>
<h1>Disability support built around you</h1>
<p>NDIS supports across regional New South Wales. Head office in Gosford.</p>
<div class="bar"></div>`;

const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL ?? 'chrome' });
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.setContent(html, { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: `${root}public/og-default.png`, type: 'png' });
await browser.close();
console.log('public/og-default.png written');
