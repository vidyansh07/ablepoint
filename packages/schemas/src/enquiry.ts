import { z } from 'zod';

/**
 * Step-1 public enquiry contract (docs/05-intake-data-security.md §2).
 * Deliberately minimal: no NDIS number, no support-needs, no free-text message.
 * The same schema is used by the browser form and (later) the intake API.
 */

/**
 * Zod 4 probes `new Function()` to JIT-compile object parsers when a schema is CONSTRUCTED. Under a strict CSP (no unsafe-eval)
 * that probe is blocked and reported as a violation. In a browser we therefore turn JIT off before any schema is built.
 * (Server runtimes keep JIT.)
 */
if ('document' in globalThis) z.config({ jitless: true });

export const REFERRER_TYPES = [
  'self',
  'family',
  'coordinator',
  'plan-manager',
  'health-professional',
  'other',
] as const;

export const SERVICE_CATEGORIES = [
  'core-support',
  'sil',
  'sda',
  'sta',
  'support-coordination',
  'community-access',
  'not-sure',
] as const;

export const REGION_CHOICES = [
  'central-coast',
  'newcastle',
  'dubbo',
  'orange',
  'tamworth',
  'gunnedah',
  'not-sure',
] as const;

export const CONTACT_METHODS = ['phone', 'email', 'sms'] as const;

export type ReferrerType = (typeof REFERRER_TYPES)[number];
export type ServiceCategory = (typeof SERVICE_CATEGORIES)[number];
export type RegionChoice = (typeof REGION_CHOICES)[number];
export type ContactMethod = (typeof CONTACT_METHODS)[number];

/** Normalise an Australian phone number to E.164. Returns null if not plausible. */
export function normalisePhoneAU(input: string): string | null {
  const digits = input.replace(/[\s().-]/g, '');
  if (!/^\+?\d+$/.test(digits)) return null;
  let national: string;
  if (digits.startsWith('+61')) national = '0' + digits.slice(3);
  else if (digits.startsWith('0061')) national = '0' + digits.slice(4);
  else if (digits.startsWith('61') && digits.length === 11) national = '0' + digits.slice(2);
  else national = digits;
  // Mobile 04xx xxx xxx, landline 0[2378] xxxx xxxx
  if (/^04\d{8}$/.test(national) || /^0[2378]\d{8}$/.test(national)) return '+61' + national.slice(1);
  return null;
}

const trimmed = (min: number, max: number, label: string) =>
  z
    .string()
    .trim()
    .min(min, `Enter ${label}`)
    .max(max, `${label[0]?.toUpperCase()}${label.slice(1)} is too long`);

export const enquirySchema = z
  .object({
    name: trimmed(2, 100, 'your name'),
    phone: z
      .string()
      .trim()
      .max(30)
      .optional()
      .transform((v) => (v ? v : undefined)),
    email: z
      .string()
      .trim()
      .max(254)
      .optional()
      .transform((v) => (v ? v.toLowerCase() : undefined)),
    referrerType: z.enum(REFERRER_TYPES, { message: 'Choose who is making this enquiry' }),
    services: z.array(z.enum(SERVICE_CATEGORIES)).min(1, 'Choose at least one service').max(7),
    region: z.enum(REGION_CHOICES, { message: 'Choose a region' }),
    contactMethod: z.enum(CONTACT_METHODS, { message: 'Choose how we should contact you' }),
    bestTime: z
      .string()
      .trim()
      .max(80, 'Keep this to 80 characters')
      .optional()
      .transform((v) => (v ? v : undefined)),
    consent: z.literal(true, { message: 'Please confirm you agree to be contacted' }),
    /** Honeypot: must be empty. Bots fill it. */
    website: z.string().max(0).optional(),
  })
  .superRefine((val, ctx) => {
    if (!val.phone && !val.email) {
      ctx.addIssue({ code: 'custom', path: ['phone'], message: 'Enter a phone number or an email address' });
    }
    if (val.phone && !normalisePhoneAU(val.phone)) {
      ctx.addIssue({ code: 'custom', path: ['phone'], message: 'Enter a valid Australian phone number' });
    }
    if (val.email && !z.email().safeParse(val.email).success) {
      ctx.addIssue({ code: 'custom', path: ['email'], message: 'Enter a valid email address' });
    }
    if (val.contactMethod === 'email' && !val.email) {
      ctx.addIssue({ code: 'custom', path: ['email'], message: 'Enter your email address, or choose another contact method' });
    }
    if ((val.contactMethod === 'phone' || val.contactMethod === 'sms') && !val.phone) {
      ctx.addIssue({ code: 'custom', path: ['phone'], message: 'Enter your phone number, or choose another contact method' });
    }
  });

export type EnquiryInput = z.input<typeof enquirySchema>;
export type Enquiry = z.output<typeof enquirySchema>;

/** Payload sent to the intake API: validated enquiry + anti-abuse metadata. No analytics identifiers. */
export interface EnquirySubmission {
  idempotencyKey: string;
  noticeVersion: string;
  turnstileToken?: string;
  enquiry: Enquiry;
}
