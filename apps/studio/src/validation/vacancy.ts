import { VACANCY_STALE_DAYS } from '@ablepoint/schemas';

const DAY = 86_400_000;

/**
 * A vacancy cannot be `available` unless lastVerifiedAt is set, a valid date, not in the future,
 * and within VACANCY_STALE_DAYS (docs/06 §4). Other statuses are unconstrained.
 */
export function validateVacancyAvailability(
  v: { status?: string; lastVerifiedAt?: string },
  now: Date = new Date(),
): true | string {
  if (v.status !== 'available') return true;
  if (!v.lastVerifiedAt) return `Set "Last verified" before marking a vacancy available.`;
  const t = Date.parse(v.lastVerifiedAt);
  if (Number.isNaN(t)) return '"Last verified" is not a valid date';
  if (t - now.getTime() > DAY) return '"Last verified" is in the future';
  const age = (now.getTime() - t) / DAY;
  if (age > VACANCY_STALE_DAYS) return `Availability was last verified ${Math.floor(age)} days ago. Verify again (limit ${VACANCY_STALE_DAYS} days) before it can show as available.`;
  return true;
}

export function validateLastVerifiedNotFuture(value: string | undefined, now: Date = new Date()): true | string {
  if (!value) return true;
  const t = Date.parse(value);
  if (Number.isNaN(t)) return 'Not a valid date';
  return t - now.getTime() > DAY ? 'Date is in the future' : true;
}

/** Internal owner is a role label, not a person: the dataset's published content may be publicly readable. */
export function validateInternalOwnerLabel(value: string | undefined): true | string {
  const v = (value ?? '').trim();
  if (!v) return true;
  if (/@/.test(v)) return 'Use a role label (for example "Central Coast intake"), not an email address';
  if (/\d{6,}/.test(v.replace(/\s/g, ''))) return 'Use a role label, not a phone number';
  return v.length <= 60 ? true : 'Keep the label under 60 characters';
}
