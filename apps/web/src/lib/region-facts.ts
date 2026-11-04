import { findBannedPhrases } from '@ablepoint/schemas';
import type { Region, RegionFacts } from '../data/types';

/**
 * Checks for verified regional facts (docs/25 §5.2). Region pages are only genuinely different from one another once
 * operations supply real local facts; until then the page stays a short, honest template. These checks stop a fact
 * sheet from carrying a street address, banned wording, an unverified partner or an AI-looking verifier.
 */
const STREET = /\b\d{1,5}\s+[A-Z][A-Za-z'-]+(\s+[A-Z][A-Za-z'-]+)?\s+(Street|St|Road|Rd|Avenue|Ave|Drive|Dr|Lane|Ln|Place|Pl|Court|Ct|Crescent|Cres|Highway|Hwy|Parade|Pde|Close|Terrace|Tce)\b/;
const AI_NAME = /\bai\b|artificial intelligence|chatgpt|claude|gpt|assistant|bot\b/i;

export function checkRegionFacts(slug: string, f: RegionFacts): string[] {
  const errs: string[] = [];
  const e = (m: string) => errs.push(`${slug}: ${m}`);
  if (!f.towns.length) e('towns is empty');
  if (f.towns.some((t) => t.trim().length < 2 || t.length > 60)) e('a town name is empty or over 60 characters');
  if (new Set(f.towns.map((t) => t.toLowerCase())).size !== f.towns.length) e('duplicate towns');
  if ((f.about?.length ?? 0) > 3) e('at most 3 about paragraphs');
  for (const p of f.about ?? []) if (p.length < 40 || p.length > 500) e('each about paragraph must be 40 to 500 characters');
  if (f.gettingAround && (f.gettingAround.length < 40 || f.gettingAround.length > 500)) e('gettingAround must be 40 to 500 characters');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f.verifiedAt) || Number.isNaN(Date.parse(f.verifiedAt))) e('verifiedAt must be an ISO date');
  if (f.verifiedBy.trim().length < 3 || AI_NAME.test(f.verifiedBy)) e('verifiedBy must be a named person, not an AI or a tool');
  for (const p of f.partners ?? []) {
    if (!p.permissionRef.trim()) e(`partner "${p.name}" has no permissionRef (listed only with written permission)`);
    if (p.url && !p.url.startsWith('https://')) e(`partner "${p.name}" url must be https`);
  }
  const text = [...f.towns, ...(f.about ?? []), f.gettingAround ?? '', ...(f.partners ?? []).map((p) => p.name)].join('\n');
  if (STREET.test(text)) e('contains what looks like a street address (owner decision C-1/C-2 first)');
  if (/\d{4}\s?\d{3}\s?\d{3}|@|\b0[2-9]\s?\d{4}\s?\d{4}\b|\b04\d{2}\s?\d{3}\s?\d{3}\b/.test(text)) e('contains a phone number, email or number that looks like an identifier');
  for (const hit of findBannedPhrases(text)) e(`banned phrase "${hit.match}": ${hit.reason}`);
  return errs;
}

export function assertRegionFacts(regions: Region[]): void {
  const errs = regions.flatMap((r) => (r.facts ? checkRegionFacts(r.slug, r.facts) : []));
  if (errs.length) throw new Error(`Invalid region facts:\n- ${errs.join('\n- ')}`);
}

export interface FactSection {
  id: 'towns' | 'about' | 'partners' | 'getting-around';
  heading: string;
}

/** Which fact sections a region page should show. Pure, so it can be tested without rendering. */
export function factSections(region: Pick<Region, 'name' | 'facts'>): FactSection[] {
  const f = region.facts;
  if (!f) return [];
  const out: FactSection[] = [];
  if (f.towns.length) out.push({ id: 'towns', heading: `Towns and areas we support from ${region.name}` });
  if (f.about?.length) out.push({ id: 'about', heading: `About support in ${region.name}` });
  if (f.partners?.length) out.push({ id: 'partners', heading: 'Local organisations we work with' });
  if (f.gettingAround) out.push({ id: 'getting-around', heading: 'Getting around' });
  return out;
}

export const lastChecked = (f: RegionFacts | undefined): string | null =>
  f ? new Date(f.verifiedAt + 'T00:00:00Z').toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) : null;
