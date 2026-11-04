import { extractPortableText, validateNoBannedPhrases } from './text';

/** A recorded reference to the written consent held outside the CMS (docs/06 teamMember, testimonial). */
export function validateConsentRef(ref: string | undefined): true | string {
  const v = (ref ?? '').trim();
  if (v.length < 3) return 'Enter the reference of the written consent record (held outside the CMS)';
  if (v.length > 120) return 'Keep the consent reference short (an ID, not the consent text)';
  return true;
}

/** G-04: testimonials never imply outcomes or eligibility. The flag must be explicitly false. */
export function validateOutcomeClaim(value: boolean | undefined): true | string {
  return value === false ? true : 'Testimonials must not claim outcomes or eligibility. This flag must be set to "No".';
}

/** First name or initials only (G-04). Accepts "Sam", "Sam T.", "S.T." ; rejects full names. */
export function validateAttribution(value: string | undefined): true | string {
  const v = (value ?? '').trim();
  if (!v) return 'Enter a first name or initials';
  if (v.length > 30) return 'Use a first name or initials only';
  const tokens = v.split(/\s+/);
  if (tokens.length > 2) return 'Use a first name or initials only';
  if (tokens.length === 2) {
    const second = tokens[1] ?? '';
    if (!/^[A-Za-z]\.?$/.test(second)) return 'Use a first name and an initial at most (for example "Sam T.")';
  }
  return true;
}

const OUTCOME_LANGUAGE = [
  /\b(got|get|getting|was|were|been)\b[^.!?]{0,40}\b(approved|funded|funding|eligible)\b/i,
  /\b(cured|fixed|recovered)\b/i,
  /\bapproved my (plan|funding)\b/i,
];

/** Error-level: quote implies an outcome or NDIS eligibility/funding result. */
export function validateTestimonialQuote(value: unknown): true | string {
  const text = extractPortableText(value);
  if (!text) return true;
  if (OUTCOME_LANGUAGE.some((re) => re.test(text))) return 'Quote implies an outcome or funding/eligibility result. Choose a different quote (G-04).';
  return true;
}

export function validateTestimonialQuoteWarnings(value: unknown): true | string {
  return validateNoBannedPhrases(value);
}
