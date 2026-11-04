import { maskPhone } from './common';
import { normalisePhoneAU } from '@ablepoint/schemas';

/** A3: log answered calls of at least 60 seconds (inclusive) to the CRM with source attribution. */
export const CALL_LOG_MIN_SECONDS = 60;

export type RecordingConsent = 'given' | 'not_given' | 'unknown';

export interface CallEvent {
  callId: string;
  direction: 'inbound' | 'outbound';
  answered: boolean;
  durationSeconds: number;
  callerNumber: string;
  knownContactId?: string;
  recordingConsent: RecordingConsent;
  hasRecording: boolean;
  /** Attribution source from call tracking (e.g. "google-ads", "organic", "gbp"). */
  source?: string;
}

export type CallLogPlan =
  | { log: false; reason: 'outbound_call' | 'not_answered' | 'too_short' | 'invalid_number' }
  | {
      log: true;
      createEnquiry: boolean;
      source: string;
      callerMasked: string;
      /** link: store recording link; omit: do not store; delete: recording exists without consent, request deletion. */
      recording: 'link' | 'omit' | 'delete';
      needsConsentReview: boolean;
      idempotencyParts: [string, string];
    };

export function planCallLog(e: CallEvent): CallLogPlan {
  if (e.direction !== 'inbound') return { log: false, reason: 'outbound_call' };
  if (!e.answered) return { log: false, reason: 'not_answered' };
  if (e.durationSeconds < CALL_LOG_MIN_SECONDS) return { log: false, reason: 'too_short' };
  const e164 = normalisePhoneAU(e.callerNumber);
  if (!e164) return { log: false, reason: 'invalid_number' };

  let recording: 'link' | 'omit' | 'delete' = 'omit';
  if (e.hasRecording) recording = e.recordingConsent === 'given' ? 'link' : e.recordingConsent === 'not_given' ? 'delete' : 'omit';

  return {
    log: true,
    createEnquiry: !e.knownContactId,
    source: e.source?.trim() || 'unknown',
    callerMasked: maskPhone(e164),
    recording,
    needsConsentReview: e.hasRecording && e.recordingConsent === 'unknown',
    idempotencyParts: ['call', e.callId],
  };
}
