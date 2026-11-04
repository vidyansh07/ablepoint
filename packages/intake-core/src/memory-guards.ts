import { SAFE_VALUE_PATTERN, type AuditEvent } from './ports';

/**
 * Audit `meta` must carry no personal information. Free text, spaces and addresses cannot match the
 * safe pattern, so they are refused at the sink instead of being trusted to callers.
 */
export function assertSafeAuditMeta(event: AuditEvent): void {
  for (const [key, value] of Object.entries(event.meta ?? {})) {
    if (!/^[A-Za-z][A-Za-z0-9_]{0,31}$/.test(key)) throw new Error('unsafe audit meta key');
    if (typeof value === 'string' && !SAFE_VALUE_PATTERN.test(value)) throw new Error('unsafe audit meta value');
  }
}
