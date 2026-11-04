/**
 * Privacy-safe analytics event contract (docs/08, docs/10). Pure and shared by the site and tests.
 * Rules: allow-listed event names only; allow-listed parameters only; page paths never carry query strings or
 * fragments; any value that looks like personal data causes the whole event to be dropped, not "cleaned".
 */

export const ANALYTICS_EVENTS = [
  'phone_click',
  'contact_submit',
  'referral_submit',
  'referral_cta', // proposed addition: click on a "Make a referral" button
  'vacancy_view',
  'vacancy_enquiry',
  'gbp_click',
] as const;
export type AnalyticsEventName = (typeof ANALYTICS_EVENTS)[number];

const PARAM_ALLOW = ['page_path', 'cta_location', 'service', 'region', 'vacancy_type'] as const;
export type AnalyticsParams = Partial<Record<(typeof PARAM_ALLOW)[number], string>>;

export interface AnalyticsEvent {
  event: AnalyticsEventName;
  params: AnalyticsParams;
}

const PII_PATTERNS: RegExp[] = [
  /[^\s@]+@[^\s@]+\.[^\s@]+/, // email
  /(?:\+?61|0)[\s-]?[2-478](?:[\s-]?\d){8}/, // AU phone
  /\b\d{9}\b/, // NDIS-number-like (9 digits)
  /\b\d{3}\s\d{3}\s\d{3}\b/, // spaced 9 digits
];

export function looksLikePersonalData(value: string): boolean {
  return PII_PATTERNS.some((p) => p.test(value));
}

/** Strip query string and fragment; keep path only. */
export function safePagePath(pathLike: string): string {
  const p = pathLike.split('#')[0]?.split('?')[0] ?? '/';
  return p.startsWith('/') ? p : '/';
}

export function sanitiseEvent(name: string, params: Record<string, unknown> = {}): AnalyticsEvent | null {
  if (!(ANALYTICS_EVENTS as readonly string[]).includes(name)) return null;
  const out: AnalyticsParams = {};
  for (const [k, v] of Object.entries(params)) {
    if (!(PARAM_ALLOW as readonly string[]).includes(k)) continue; // unknown params are dropped
    if (typeof v !== 'string') continue;
    const value = k === 'page_path' ? safePagePath(v) : v.slice(0, 64);
    if (looksLikePersonalData(value)) return null; // drop the whole event
    out[k as keyof AnalyticsParams] = value;
  }
  return { event: name as AnalyticsEventName, params: out };
}

// ---- consent ----

export interface ConsentState {
  v: 1;
  analytics: boolean;
  ts: string;
}
export const CONSENT_KEY = 'ap_consent';
const CONSENT_MAX_AGE_DAYS = 180;

export function parseConsent(raw: string | null | undefined, now = new Date()): ConsentState | null {
  if (!raw) return null;
  try {
    const c = JSON.parse(raw) as Partial<ConsentState>;
    if (c.v !== 1 || typeof c.analytics !== 'boolean' || typeof c.ts !== 'string') return null;
    const age = (now.getTime() - Date.parse(c.ts)) / 86_400_000;
    if (!(age >= 0) || age > CONSENT_MAX_AGE_DAYS) return null; // expired or invalid: ask again
    return { v: 1, analytics: c.analytics, ts: c.ts };
  } catch {
    return null;
  }
}

export const mayTrack = (c: ConsentState | null): boolean => c?.analytics === true;
