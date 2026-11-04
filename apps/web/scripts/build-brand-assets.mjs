// Derives favicons and touch icons from the PRESERVED logo (crop of the ring only; no redrawing, no recolouring).
// Output goes to public/. Source: src/assets/brand/logo.jpg (512x141, as supplied on the live site).
import sharp from 'sharp';
import { writeFileSync } from 'node:fs';

const src = new URL('../src/assets/brand/logo.jpg', import.meta.url).pathname;
const pub = (f) => new URL(`../public/${f}`, import.meta.url).pathname;
const WHITE = { r: 255, g: 255, b: 255, alpha: 1 };

// Ring occupies roughly x 28..170, y 4..137 in the 512x141 artwork.
const ring = await sharp(src).extract({ left: 26, top: 2, width: 146, height: 139 }).toBuffer();
const square = async (size, pad) => {
  const inner = size - 2 * pad;
  return sharp(ring).resize(inner, inner, { fit: 'contain', background: WHITE }).extend({ top: pad, bottom: pad, left: pad, right: pad, background: WHITE }).flatten({ background: WHITE }).png({ compressionLevel: 9 }).toBuffer();
};

const f32 = await square(32, 1);
const f48 = await square(48, 2);
writeFileSync(pub('favicon-32.png'), f32);
writeFileSync(pub('favicon-48.png'), f48);
writeFileSync(pub('apple-touch-icon.png'), await square(180, 16));
writeFileSync(pub('icon-192.png'), await square(192, 16));

// favicon.ico: ICO container with one embedded 48px PNG (valid per the ICO format).
const header = Buffer.alloc(22);
header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(1, 4);
header.writeUInt8(48, 6); header.writeUInt8(48, 7); header.writeUInt8(0, 8); header.writeUInt8(0, 9);
header.writeUInt16LE(1, 10); header.writeUInt16LE(32, 12); header.writeUInt32LE(f48.length, 14); header.writeUInt32LE(22, 18);
writeFileSync(pub('favicon.ico'), Buffer.concat([header, f48]));
console.log('brand icons written to public/');
