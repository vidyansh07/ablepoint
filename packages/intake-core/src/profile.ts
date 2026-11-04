import { decryptField, encryptField, rotateField, type KeyProvider } from './crypto';
import type { ParticipantProfileRecord } from './repository';

/**
 * Seal/open C3 profile fields. Plaintext exists only in memory inside these functions' callers.
 * The encryption context binds each ciphertext to its field and case reference.
 */
export interface ParticipantProfilePlain {
  caseRef: string;
  displayName?: string;
  communicationPreferences?: string;
  ndisNumber?: string;
  dob?: string;
  supportNeeds?: string;
}

const ENC_FIELDS = [
  ['ndisNumber', 'ndisNumberEnc'],
  ['dob', 'dobEnc'],
  ['supportNeeds', 'supportNeedsEnc'],
] as const;

export async function sealProfile(plain: ParticipantProfilePlain, provider: KeyProvider, updatedAt: string): Promise<ParticipantProfileRecord> {
  const out: ParticipantProfileRecord = {
    caseRef: plain.caseRef,
    updatedAt,
    ...(plain.displayName ? { displayName: plain.displayName } : {}),
    ...(plain.communicationPreferences ? { communicationPreferences: plain.communicationPreferences } : {}),
  };
  for (const [src, dst] of ENC_FIELDS) {
    const v = plain[src];
    if (v) out[dst] = await encryptField(v, { field: dst, recordId: plain.caseRef }, provider);
  }
  return out;
}

export async function openProfile(rec: ParticipantProfileRecord, provider: KeyProvider): Promise<ParticipantProfilePlain> {
  const out: ParticipantProfilePlain = {
    caseRef: rec.caseRef,
    ...(rec.displayName ? { displayName: rec.displayName } : {}),
    ...(rec.communicationPreferences ? { communicationPreferences: rec.communicationPreferences } : {}),
  };
  for (const [src, dst] of ENC_FIELDS) {
    const env = rec[dst];
    if (env) out[src] = await decryptField(env, { field: dst, recordId: rec.caseRef }, provider);
  }
  return out;
}

/** Re-encrypt every sealed field under the current key (key rotation job body). */
export async function rotateProfile(rec: ParticipantProfileRecord, provider: KeyProvider, updatedAt: string): Promise<ParticipantProfileRecord> {
  const out: ParticipantProfileRecord = { ...rec, updatedAt };
  for (const [, dst] of ENC_FIELDS) {
    const env = rec[dst];
    if (env) out[dst] = await rotateField(env, { field: dst, recordId: rec.caseRef }, provider);
  }
  return out;
}
