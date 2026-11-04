import { REVIEW_STATES } from './constants';

/**
 * Publish webhook -> audit record (docs/06 §3). Pure and body-free: the record is built from an
 * allow-list of metadata fields, so document content can never leak into the audit log.
 *
 * The webhook is configured in Sanity with a GROQ projection limited to these fields:
 *   { _id, _type, _rev, _updatedAt, reviewState, "actor": ... }
 * How Sanity exposes the acting user to a webhook is UNVERIFIED; a missing actor is recorded as "unknown".
 */
export interface PublishWebhookPayload {
  _id?: unknown;
  _type?: unknown;
  _rev?: unknown;
  _updatedAt?: unknown;
  reviewState?: unknown;
  actor?: unknown;
  /** anything else in the payload is ignored on purpose */
  [key: string]: unknown;
}

export interface AuditRecord {
  docId: string;
  docType: string;
  revision: string;
  actor: string;
  time: string;
  reviewState: (typeof REVIEW_STATES)[number] | 'unknown';
}

export type AuditResult = { ok: true; record: AuditRecord } | { ok: false; error: string };

const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined);

/** `drafts.abc` and `versions.<release>.abc` both audit as the published id `abc`. */
export function publishedId(id: string): string {
  if (id.startsWith('drafts.')) return id.slice('drafts.'.length);
  const m = /^versions\.[^.]+\.(.+)$/.exec(id);
  return m ? (m[1] as string) : id;
}

export function toAuditRecord(payload: PublishWebhookPayload, receivedAt: Date = new Date()): AuditResult {
  if (!payload || typeof payload !== 'object') return { ok: false, error: 'Payload is not an object' };
  const id = str(payload._id);
  if (!id) return { ok: false, error: 'Payload has no _id' };
  const revision = str(payload._rev);
  if (!revision) return { ok: false, error: 'Payload has no _rev' };
  const type = str(payload._type) ?? 'unknown';

  let time = str(payload._updatedAt);
  if (time && Number.isNaN(Date.parse(time))) time = undefined;
  const iso = new Date(time ?? receivedAt.toISOString()).toISOString();

  const state = str(payload.reviewState);
  const reviewState = state && (REVIEW_STATES as readonly string[]).includes(state) ? (state as AuditRecord['reviewState']) : 'unknown';

  // The actor is an identifier, never free text from the document. Bound its shape.
  const actorRaw = str(payload.actor);
  const actor = actorRaw && /^[A-Za-z0-9_.:@-]{1,128}$/.test(actorRaw) ? actorRaw : 'unknown';

  return { ok: true, record: { docId: publishedId(id), docType: type, revision, actor, time: iso, reviewState } };
}
