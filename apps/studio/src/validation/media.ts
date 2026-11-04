export type RightsStatus = 'own' | 'licensed' | 'stock' | 'unknown';
export type ConsentStatus = 'notApplicable' | 'obtained' | 'pending';

export const RIGHTS_STATUSES: readonly RightsStatus[] = ['own', 'licensed', 'stock', 'unknown'];
export const CONSENT_STATUSES: readonly ConsentStatus[] = ['notApplicable', 'obtained', 'pending'];

/** Alt text is required unless the image is decorative; decorative images must have no alt text. */
export function validateAlt(alt: string | undefined, decorative: boolean | undefined): true | string {
  const text = (alt ?? '').trim();
  if (decorative) return text === '' ? true : 'Decorative images must not have alt text. Clear this field or untick "Decorative".';
  if (text === '') return 'Describe the image for people who cannot see it, or tick "Decorative".';
  if (text.length > 160) return 'Keep alt text under 160 characters';
  if (/^(image|photo|picture|graphic)( of)?\b/i.test(text)) return 'Start with what the image shows, not "image of" or "photo of".';
  return true;
}

/** Images with unknown rights are excluded from the site (docs/07 §4). */
export function validateRights(status: string | undefined): true | string {
  if (!status) return 'Choose the rights status';
  if (!RIGHTS_STATUSES.includes(status as RightsStatus)) return 'Unknown rights status';
  return status === 'unknown' ? 'Image rights are unknown. Confirm the source and licence before using this image.' : true;
}

/** People shown in an image need recorded consent (docs/06 mediaAsset, guardrail G-04). */
export function validateImageConsent(showsPeople: boolean | undefined, consent: string | undefined): true | string {
  if (!showsPeople) return true;
  if (consent === 'obtained') return true;
  return 'This image shows people. Record that written consent has been obtained before publishing.';
}
