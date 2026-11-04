/**
 * Shared primitives for the automation rules library.
 * Pure and deterministic: every function takes `now` explicitly.
 */

// ---------------------------------------------------------------------------
// Contact permission (docs/09 §1: consent flags, do-not-contact overrides everything)
// ---------------------------------------------------------------------------

export interface ContactPermission {
  consentToContact: boolean;
  doNotContact: boolean;
  optedOut: boolean;
}

export type ContactBlockReason = 'do_not_contact' | 'opted_out' | 'no_consent';

/** Returns why automated contact is blocked, or null if allowed. do-not-contact always wins. */
export function contactBlock(p: ContactPermission): ContactBlockReason | null {
  if (p.doNotContact) return 'do_not_contact';
  if (p.optedOut) return 'opted_out';
  if (!p.consentToContact) return 'no_consent';
  return null;
}

// ---------------------------------------------------------------------------
// Time helpers (Intl-based so DST is handled; formatter cache for speed)
// ---------------------------------------------------------------------------

export interface LocalParts {
  /** YYYY-MM-DD in the target zone */
  date: string;
  hour: number;
  minute: number;
  /** 1 = Monday … 7 = Sunday */
  isoWeekday: number;
}

const WEEKDAY: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      weekday: 'short',
    });
    formatters.set(timeZone, f);
  }
  return f;
}

export function localParts(d: Date, timeZone: string): LocalParts {
  const map: Record<string, string> = {};
  for (const p of formatter(timeZone).formatToParts(d)) map[p.type] = p.value;
  return {
    date: `${map.year}-${map.month}-${map.day}`,
    hour: Number(map.hour),
    minute: Number(map.minute),
    isoWeekday: WEEKDAY[map.weekday ?? ''] ?? 0,
  };
}

export const MINUTE_MS = 60_000;
export const HOUR_MS = 3_600_000;
export const DAY_MS = 86_400_000;

export interface QuietHours {
  timeZone: string;
  /** Quiet from this local hour (inclusive)… */
  startHour: number;
  /** …until this local hour (exclusive). */
  endHour: number;
}

/** ASSUMPTION (docs/09 A2/A5 do not specify): no automated messages 21:00–08:00 Sydney time. Confirm with the compliance adviser. */
export const DEFAULT_QUIET_HOURS: QuietHours = { timeZone: 'Australia/Sydney', startHour: 21, endHour: 8 };

export function isQuietHours(now: Date, q: QuietHours = DEFAULT_QUIET_HOURS): boolean {
  const { hour } = localParts(now, q.timeZone);
  return q.startHour > q.endHour ? hour >= q.startHour || hour < q.endHour : hour >= q.startHour && hour < q.endHour;
}

/** First instant at or after `now` that is outside quiet hours (minute resolution, seconds zeroed when deferred). */
export function nextQuietHoursEnd(now: Date, q: QuietHours = DEFAULT_QUIET_HOURS): Date {
  if (!isQuietHours(now, q)) return now;
  let t = Math.floor(now.getTime() / MINUTE_MS) * MINUTE_MS + MINUTE_MS;
  for (let i = 0; i < 24 * 60 + 1; i++) {
    if (!isQuietHours(new Date(t), q)) return new Date(t);
    t += MINUTE_MS;
  }
  return new Date(t); // unreachable for sane configs
}

export interface BusinessHours {
  timeZone: string;
  /** ISO weekdays that are open: 1 = Monday … 7 = Sunday */
  days: readonly number[];
  startMinute: number;
  endMinute: number;
  /** Local dates (YYYY-MM-DD) treated as closed. */
  holidays: readonly string[];
}

/** ASSUMPTION: opening hours are NOT verified (docs/13 unverified list). Mon–Fri 09:00–17:00 Sydney, no public-holiday data. */
export const DEFAULT_BUSINESS_HOURS: BusinessHours = {
  timeZone: 'Australia/Sydney',
  days: [1, 2, 3, 4, 5],
  startMinute: 9 * 60,
  endMinute: 17 * 60,
  holidays: [],
};

export function isBusinessHours(now: Date, h: BusinessHours = DEFAULT_BUSINESS_HOURS): boolean {
  const p = localParts(now, h.timeZone);
  if (h.holidays.includes(p.date)) return false;
  if (!h.days.includes(p.isoWeekday)) return false;
  const minutes = p.hour * 60 + p.minute;
  return minutes >= h.startMinute && minutes < h.endMinute;
}

/**
 * Business minutes in [from, to), counted minute by minute, stopping at `cap` (so callers can
 * ask "has at least N business minutes elapsed?" cheaply). Scans at most 21 days.
 */
export function businessMinutesElapsed(from: Date, to: Date, h: BusinessHours = DEFAULT_BUSINESS_HOURS, cap = Number.POSITIVE_INFINITY): number {
  if (to.getTime() <= from.getTime()) return 0;
  let count = 0;
  const end = Math.min(to.getTime(), from.getTime() + 21 * DAY_MS);
  for (let t = Math.floor(from.getTime() / MINUTE_MS) * MINUTE_MS; t < end; t += MINUTE_MS) {
    if (isBusinessHours(new Date(t), h)) {
      count++;
      if (count >= cap) return count;
    }
  }
  return count;
}

// ---------------------------------------------------------------------------
// Masking for logs (never log raw PII)
// ---------------------------------------------------------------------------

export function maskPhone(e164: string): string {
  const digits = e164.replace(/\D/g, '');
  if (digits.length < 6) return '***';
  return `${e164.startsWith('+') ? '+' : ''}${digits.slice(0, 2)}${'*'.repeat(Math.max(digits.length - 5, 1))}${digits.slice(-3)}`;
}

export function maskEmail(email: string): string {
  const at = email.indexOf('@');
  if (at < 1) return '***';
  return `${email[0]}***${email.slice(at)}`;
}

export class PolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PolicyError';
  }
}
