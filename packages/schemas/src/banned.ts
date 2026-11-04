/** Self-contained (no relative imports) so Node scripts can load it directly with native type stripping. */

/** Language that must not appear on the public site (guardrails G-01, G-03, W-04). */
const BANNED: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /\bndis[- ]approved\b/i, reason: 'implies NDIS approval (G-01)' },
  { pattern: /\bapproved\s+ndis\b/i, reason: 'implies NDIS approval (G-01)' },
  { pattern: /\bndis[- ]endorsed\b/i, reason: 'implies NDIS endorsement (G-01)' },
  { pattern: /\bfully covered by (the )?ndis\b/i, reason: 'unsupported funding claim (G-01)' },
  { pattern: /\b(the )?best (ndis )?(service )?provider\b/i, reason: 'unsupported superlative (W-04)' },
  { pattern: /\bleading ndis\b/i, reason: 'unsupported superlative (W-04)' },
  { pattern: /\bmost trusted\b/i, reason: 'unsupported superlative (W-04)' },
  { pattern: /\bthe obvious choice\b/i, reason: 'unsupported superlative (W-04)' },
  { pattern: /\bguarantee[sd]?\b/i, reason: 'outcome guarantee' },
  { pattern: /\brefer a friend\b/i, reason: 'possible inducement (G-02)' },
  { pattern: /\b(free gift|voucher|cash back|reward)\b/i, reason: 'possible inducement (G-02)' },
  { pattern: /\bAustrialia\b/, reason: 'misspelling (W-06)' },
  { pattern: /\baccomodation\b/i, reason: 'misspelling (W-06)' },
];

export interface BannedHit {
  match: string;
  reason: string;
}

export function findBannedPhrases(text: string): BannedHit[] {
  const hits: BannedHit[] = [];
  for (const { pattern, reason } of BANNED) {
    const m = pattern.exec(text);
    if (m) hits.push({ match: m[0], reason });
  }
  return hits;
}
