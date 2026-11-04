import type { Availability, Vacancy } from './schemas';

/** Same threshold as the website (VACANCY_STALE_DAYS in packages/schemas). Kept as a local constant: this package has no other dependencies. */
export const VACANCY_STALE_DAYS = 14;
const DAY_MS = 86_400_000;

export interface VacancyView {
  id: string;
  title: string;
  url: string;
  vacancyType: string | null;
  region: string | null;
  suburb: string | null;
  summary: string | null;
  features: string[];
  /** Exactly as published. */
  availability: Availability;
  /** Exactly as published (null when the site has no verification date). */
  lastVerifiedAt: string | null;
  /** Whole days between lastVerifiedAt and now, or null when there is no usable date. */
  verifiedDaysAgo: number | null;
  /** What to rely on today: "available" is downgraded to "unconfirmed" when the date is missing, unreadable, in the future or older than 14 days. */
  effectiveAvailability: Availability;
  /** Present when the vacancy is unconfirmed or stale. Show it to the reader. */
  warning: string | null;
}

export function describeVacancy(v: Vacancy, now: Date): VacancyView {
  const lastVerifiedAt = v.lastVerifiedAt ?? null;
  const verified = lastVerifiedAt === null ? Number.NaN : Date.parse(lastVerifiedAt);
  const ageMs = now.getTime() - verified;
  const hasDate = Number.isFinite(verified);
  const future = hasDate && ageMs < -DAY_MS; // more than a day ahead: clock skew or a data error
  const days = hasDate && !future ? Math.max(0, Math.floor(ageMs / DAY_MS)) : null;
  const stale = days !== null && ageMs > VACANCY_STALE_DAYS * DAY_MS;

  let effective: Availability = v.availability;
  let warning: string | null = null;

  if (v.availability === 'unconfirmed') {
    warning = 'Availability is unconfirmed. Do not tell anyone this vacancy is available. It must be confirmed with AblePoint directly.';
    if (stale) warning += ` It was last verified ${days} days ago (more than ${VACANCY_STALE_DAYS}).`;
  } else if (v.availability === 'available') {
    if (!hasDate) {
      effective = 'unconfirmed';
      warning = 'This vacancy has no usable verification date, so treat its availability as unconfirmed. It must be confirmed with AblePoint directly.';
    } else if (future) {
      effective = 'unconfirmed';
      warning = 'The verification date is in the future, which looks like a data error. Treat availability as unconfirmed and confirm it with AblePoint directly.';
    } else if (stale) {
      effective = 'unconfirmed';
      warning = `Last verified ${days} days ago (more than ${VACANCY_STALE_DAYS}). Treat availability as unconfirmed until AblePoint confirms it directly.`;
    }
  } else if (stale) {
    warning = `The status is "${v.availability}" but it was last verified ${days} days ago (more than ${VACANCY_STALE_DAYS}). Confirm with AblePoint directly.`;
  }

  return {
    id: v.id,
    title: v.title,
    url: v.url,
    vacancyType: v.vacancyType ?? null,
    region: v.region ?? null,
    suburb: v.suburb ?? null,
    summary: v.summary ?? null,
    features: v.features,
    availability: v.availability,
    lastVerifiedAt,
    verifiedDaysAgo: days,
    effectiveAvailability: effective,
    warning,
  };
}

export type VacancyTypeCode = 'SIL' | 'SDA' | 'STA';
export const VACANCY_TYPE_CODES: readonly VacancyTypeCode[] = ['SIL', 'SDA', 'STA'];

const TYPE_PATTERNS: Record<VacancyTypeCode, RegExp> = {
  SIL: /supported independent living|\bsil\b/i,
  SDA: /specialist disability accommodation|\bsda\b/i,
  STA: /short[ -]term accommodation|\bsta\b/i,
};

/**
 * The vacancy resource has no service field, only a vacancy type (SIL, SDA, STA). A service maps to a type only when its
 * published slug or name says so using the standard NDIS terms. Anything else maps to no type (and so lists no vacancies).
 */
export function vacancyTypesForService(service: { id: string; name: string }): VacancyTypeCode[] {
  const text = `${service.id.replace(/-/g, ' ')} ${service.name}`;
  return VACANCY_TYPE_CODES.filter((c) => TYPE_PATTERNS[c].test(text));
}
