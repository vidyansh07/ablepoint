import { SAFE_VALUE_PATTERN } from './ports';

/**
 * Logging with a field allow-list. Anything not on the list is dropped, and values must look like
 * identifiers/codes (no spaces, no '@', ≤ 64 chars). Request bodies, names, phone numbers, emails,
 * tokens, idempotency keys and error messages are therefore structurally impossible to log.
 */
export const LOG_FIELD_ALLOW_LIST = ['requestId', 'status', 'code', 'caseRef', 'replay', 'reason', 'errorName', 'attempt'] as const;
const ALLOWED = new Set<string>(LOG_FIELD_ALLOW_LIST);

export type LogLevel = 'info' | 'warn' | 'error';
export interface LogLine {
  level: LogLevel;
  event: string;
  fields: Record<string, string | number | boolean>;
}

export interface SafeLogger {
  log(level: LogLevel, event: string, fields?: Record<string, unknown>): void;
}

export function createSafeLogger(sink: (line: LogLine) => void): SafeLogger {
  return {
    log(level, event, fields = {}) {
      const safe: Record<string, string | number | boolean> = {};
      for (const [k, v] of Object.entries(fields)) {
        if (!ALLOWED.has(k)) continue;
        if (typeof v === 'string') safe[k] = SAFE_VALUE_PATTERN.test(v) ? v : '[redacted]';
        else if (typeof v === 'number' && Number.isFinite(v)) safe[k] = v;
        else if (typeof v === 'boolean') safe[k] = v;
      }
      sink({ level, event: SAFE_VALUE_PATTERN.test(event) ? event : 'invalid_event_name', fields: safe });
    },
  };
}

/** A logger that discards everything. */
export const nullLogger: SafeLogger = { log() {} };
