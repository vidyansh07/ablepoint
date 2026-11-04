import { normalisePhoneAU } from '@ablepoint/schemas';

const DIGITS = (s: string) => s.replace(/\D/g, '');

/** Display phone in siteSettings: AU mobile/landline, 1300/1800 (10 digits) or 13 xx xx (6 digits). */
export function validatePhoneDisplay(value: string | undefined): true | string {
  const v = (value ?? '').trim();
  if (!v) return 'Enter the main phone number';
  const d = DIGITS(v);
  if (/^1[38]00\d{6}$/.test(d)) return true;
  if (/^13\d{4}$/.test(d)) return true;
  return normalisePhoneAU(v) ? true : 'Enter a valid Australian phone number';
}

/** The tel: link, with no spaces. */
export function validatePhoneHref(value: string | undefined): true | string {
  const v = (value ?? '').trim();
  if (!v) return 'Enter the tel: link';
  return /^tel:\+?\d{6,15}$/.test(v) ? true : 'Use the form tel:1300088549 (digits only, no spaces)';
}

export function validateEmail(value: string | undefined): true | string {
  const v = (value ?? '').trim();
  if (!v) return 'Enter the main email address';
  if (v !== v.toLowerCase()) return 'Use lowercase';
  return /^[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/.test(v) ? true : 'Enter a valid email address';
}

/** ABN checksum (ATO algorithm): subtract 1 from the first digit, weight, sum must be divisible by 89. */
export function validateAbn(value: string | undefined): true | string {
  const v = (value ?? '').trim();
  if (!v) return true; // optional until supplied
  const d = DIGITS(v);
  if (d.length !== 11) return 'An ABN has 11 digits';
  const weights = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19];
  const digits = d.split('').map(Number);
  digits[0] = (digits[0] ?? 0) - 1;
  const sum = digits.reduce((acc, n, i) => acc + n * (weights[i] ?? 0), 0);
  return sum % 89 === 0 ? true : 'This ABN fails the checksum. Check for a typing error.';
}

export function validateHttpsUrl(value: string | undefined): true | string {
  if (!value) return true;
  try {
    const u = new URL(value);
    return u.protocol === 'https:' ? true : 'Use an https:// link';
  } catch {
    return 'Enter a full link starting with https://';
  }
}

/** NDIS registration number must come with the page it was verified on (docs/13 B-04). */
export function validateRegistration(number: string | undefined, sourceUrl: string | undefined): true | string {
  if (!(number ?? '').trim()) return true;
  return sourceUrl ? true : 'Add the source link (NDIS Commission register page) for the registration number';
}
