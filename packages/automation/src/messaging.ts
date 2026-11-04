import { findBannedPhrases } from '@ablepoint/schemas';
import { containsNdisNumberLike } from './identifiers';
import { findInducements } from './inducements';

export interface MessageLint {
  ok: boolean;
  problems: string[];
}

/**
 * Lint an outbound SMS/email body: sender identified, opt-out present, no inducements,
 * no banned claims, no NDIS-number-like digits, no health detail (docs/09 §2, 05 §1).
 */
export function lintOutboundMessage(body: string, opts: { orgName: string; channel: 'sms' | 'email' }): MessageLint {
  const problems: string[] = [];
  if (!body.toLowerCase().includes(opts.orgName.toLowerCase())) problems.push('missing_sender_identification');
  if (!/\b(stop|unsubscribe|opt[- ]?out)\b/i.test(body)) problems.push('missing_opt_out');
  for (const label of findInducements(body)) problems.push(`inducement:${label}`);
  for (const hit of findBannedPhrases(body)) problems.push(`banned_phrase:${hit.reason}`);
  if (containsNdisNumberLike(body)) problems.push('contains_ndis_number_like_digits');
  if (/\b(diagnos\w*|medicat\w*|autis\w*|mental health|disorder|syndrome)\b/i.test(body)) problems.push('contains_health_detail');
  if (opts.channel === 'sms' && body.length > 480) problems.push('sms_too_long');
  return { ok: problems.length === 0, problems };
}
