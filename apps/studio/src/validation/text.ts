import { findBannedPhrases } from '@ablepoint/schemas';

/** Flatten a Portable Text array (or plain string) to text. Non-text objects are ignored. */
export function extractPortableText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (!Array.isArray(value)) return '';
  const parts: string[] = [];
  for (const block of value) {
    if (block && typeof block === 'object' && '_type' in block && (block as { _type: unknown })._type === 'block') {
      const children = (block as { children?: unknown }).children;
      if (Array.isArray(children)) {
        parts.push(
          children
            .map((c) => (c && typeof c === 'object' && typeof (c as { text?: unknown }).text === 'string' ? (c as { text: string }).text : ''))
            .join(''),
        );
      }
    }
  }
  return parts.join('\n');
}

/** Warning-level: unsupported/misleading claims (G-01, G-02, W-04, W-06). Returns true when clean. */
export function validateNoBannedPhrases(value: unknown): true | string {
  const text = extractPortableText(value);
  if (!text) return true;
  const hits = findBannedPhrases(text);
  if (hits.length === 0) return true;
  return `Avoid: ${hits.map((h) => `"${h.match}" (${h.reason})`).join('; ')}`;
}

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
// +61/0 prefixed AU numbers, 1300/1800 numbers, 13 xx xx numbers
const PHONE = /(?:\+?61[\s-]?|\b0)[2-478](?:[\s-]?\d){8}\b|\b1[38]00[\s-]?\d{3}[\s-]?\d{3}\b|\b13[\s-]?\d{2}[\s-]?\d{2}\b/;

export function containsEmail(text: string): boolean {
  return EMAIL.test(text);
}
export function containsPhone(text: string): boolean {
  return PHONE.test(text);
}

/** Error-level: phone and email live only in siteSettings (docs/06 §2). */
export function validateNoContactDetails(value: unknown): true | string {
  const text = extractPortableText(value);
  if (!text) return true;
  if (containsEmail(text)) return 'Do not type an email address here. Contact details come from Site settings.';
  if (containsPhone(text)) return 'Do not type a phone number here. Contact details come from Site settings.';
  return true;
}

const STREET_TYPES =
  'Street|St|Road|Rd|Avenue|Ave|Drive|Dr|Lane|Ln|Court|Ct|Place|Pl|Crescent|Cres|Highway|Hwy|Way|Terrace|Tce|Parade|Pde|Boulevard|Blvd|Close|Cl|Circuit|Cct';
const STREET_ADDRESS = new RegExp(`\\b\\d{1,5}[A-Za-z]?(?:\\s*[-/]\\s*\\d{1,5})?\\s+(?:[A-Z][A-Za-z'-]+\\s+){1,3}(?:${STREET_TYPES})\\b\\.?`);

/** Error-level: regions, properties and vacancies publish suburb only, never a street address (docs/06 §2, §5). */
export function validateNoStreetAddress(value: unknown): true | string {
  const text = extractPortableText(value);
  if (!text) return true;
  return STREET_ADDRESS.test(text) ? 'Do not publish a street address. Use the suburb only.' : true;
}

export function wordCount(text: string): number {
  return text.trim() === '' ? 0 : text.trim().split(/\s+/).length;
}

/** Answer-first summaries should be about 40–60 words (docs/08 §3). Warning-level bounds are looser. */
export function validateAnswerLength(value: unknown, min = 25, max = 80): true | string {
  const n = wordCount(extractPortableText(value));
  if (n === 0) return true;
  if (n < min || n > max) return `Answer-first summary is ${n} words. Aim for 40 to 60.`;
  return true;
}

/** Compose the standard plain-text checks used on public text fields. */
export function validatePublicText(value: unknown): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const contact = validateNoContactDetails(value);
  if (contact !== true) errors.push(contact);
  const banned = validateNoBannedPhrases(value);
  const warnings = banned === true ? [] : [banned];
  return { errors, warnings };
}
