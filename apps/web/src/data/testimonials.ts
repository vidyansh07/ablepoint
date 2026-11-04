import { findBannedPhrases } from '@ablepoint/schemas';
import type { DraftMeta } from './types';

/**
 * Testimonials (guardrail G-04). The list ships EMPTY. An entry may only be added with documented, informed, written consent
 * (consentRef points to the consent record held outside the CMS and repo), must not claim outcomes or funding results, and must
 * pass the same compliance approval as any other content. Nothing here is ever invented.
 */
export interface Testimonial extends DraftMeta {
  id: string;
  quote: string;
  /** First name or initials plus relationship, e.g. "Sam, participant". Never a full name or an address. */
  attribution: string;
  service?: string;
  consentRef: string;
  outcomeClaim: false;
}

export function assertTestimonial(t: Testimonial): void {
  if (!t.consentRef.trim()) throw new Error(`testimonial ${t.id}: consentRef is required`);
  if ((t.outcomeClaim as boolean) !== false) throw new Error(`testimonial ${t.id}: outcome claims are not allowed`);
  if (t.quote.length < 20 || t.quote.length > 400) throw new Error(`testimonial ${t.id}: quote must be 20 to 400 characters`);
  if (/\d{4}\s?\d{3}\s?\d{3}|@|https?:\/\//i.test(t.quote + t.attribution)) throw new Error(`testimonial ${t.id}: contains personal identifiers`);
  if (findBannedPhrases(`${t.quote} ${t.attribution}`).length) throw new Error(`testimonial ${t.id}: contains banned wording`);
}

export const testimonials: Testimonial[] = [];
testimonials.forEach(assertTestimonial);
