import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('../src/styles/tokens.css', import.meta.url), 'utf8');

/** Parse `--name: value;` declarations from a block. Values may be hex or var(--other). */
function parseVars(block: string): Record<string, string> {
  return Object.fromEntries([...block.matchAll(/--([a-z0-9-]+):\s*([^;]+);/gi)].map((m) => [m[1]!, m[2]!.trim()]));
}
const rootBlock = /:root\s*\{([\s\S]*?)\n\}/.exec(css)![1]!;
const highBlock = /html\[data-contrast='high'\]\s*\{([\s\S]*?)\n\}/.exec(css)![1]!;
const base = parseVars(rootBlock);
const high = { ...base, ...parseVars(highBlock) };

const resolve = (vars: Record<string, string>, name: string): string => {
  if (name === 'white') return '#ffffff';
  if (name === 'black') return '#000000';
  let v = vars[name];
  if (v === undefined) throw new Error(`token --${name} missing`);
  for (let i = 0; i < 5 && v.startsWith('var('); i++) v = resolve(vars, v.slice(6, -1));
  if (!/^#[0-9a-f]{6}$/i.test(v)) throw new Error(`--${name} does not resolve to a hex colour: ${v}`);
  return v;
};
const lum = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
};
const ratio = (a: string, b: string) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
};

// [foreground, background, minimum ratio]  4.5 normal text, 3 for large text and UI components; 7 where the brand guide promises it.
const pairs: [string, string, number][] = [
  // body text
  ['ink', 'paper', 7], ['ink', 'surface', 7], ['muted', 'paper', 4.5], ['muted', 'surface', 4.5], ['muted', 'blue-50', 4.5], ['muted', 'blue-100', 4.5],
  // headings and links
  ['blue-900', 'paper', 7], ['blue-900', 'blue-100', 4.5], ['blue-900', 'blue-50', 4.5], ['blue-900', 'orange-100', 4.5], ['blue-900', 'plum-100', 4.5], ['blue-900', 'green-100', 4.5],
  ['blue-700', 'paper', 4.5], ['blue-700', 'surface', 4.5], ['blue-700', 'blue-100', 4.5], ['brand', 'paper', 4.5],
  // buttons and bars
  ['white', 'accent', 4.5], ['white', 'accent-dark', 4.5], ['blue-900', 'surface', 4.5], ['white', 'blue-900', 4.5], ['white', 'blue-700', 4.5],
  ['blue-900', 'blue-100', 4.5], // phone pill
  ['blue-900', 'white', 4.5], // pressed tool button on the dark bar
  // icon circles
  ['blue-700', 'blue-100', 4.5], ['plum-800', 'plum-100', 4.5], ['orange-800', 'orange-100', 4.5], ['green-800', 'green-100', 4.5],
  // status
  ['danger', 'paper', 4.5], ['danger', 'surface', 4.5], ['warn-ink', 'warn-tint', 4.5], ['success', 'paper', 4.5], ['green-800', 'paper', 4.5],
  // non-text
  ['focus', 'paper', 3], ['focus', 'surface', 3], ['focus', 'blue-100', 3], ['field-border', 'surface', 3], ['blue-700', 'surface', 3],
];

describe('colour contrast (WCAG 2.2 AA), default theme', () => {
  it.each(pairs)('%s on %s >= %f', (fg, bg, min) => expect(ratio(resolve(base, fg), resolve(base, bg))).toBeGreaterThanOrEqual(min));
  it('decorative logo-tone colours are not used for text anywhere in the pair list', () => {
    for (const [fg] of pairs) expect(fg).not.toMatch(/-500$/);
  });
});

describe('high contrast mode', () => {
  const hp: [string, string, number][] = [
    ['ink', 'paper', 7], ['muted', 'paper', 7], ['brand', 'paper', 7], ['brand', 'surface', 7], ['white', 'accent', 7], ['white', 'accent-dark', 7],
    ['focus', 'paper', 7], ['field-border', 'surface', 7], ['line', 'paper', 7], ['warn-ink', 'warn-tint', 7], ['danger', 'paper', 4.5],
  ];
  it.each(hp)('%s on %s >= %f', (fg, bg, min) => expect(ratio(resolve(high, fg), resolve(high, bg))).toBeGreaterThanOrEqual(min));
});

it('logo blue is documented as failing text contrast (decorative only)', () => {
  expect(ratio(resolve(base, 'blue-500'), '#ffffff')).toBeLessThan(4.5);
});
