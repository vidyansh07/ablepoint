import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { StaticKeyProvider, decryptField, envelopeKeyId } from '../src/crypto';
import { InMemoryRepository } from '../src/repository';
import { openProfile, rotateProfile, sealProfile } from '../src/profile';

const provider = () => new StaticKeyProvider({ k1: new Uint8Array(randomBytes(32)), k2: new Uint8Array(randomBytes(32)) }, 'k1');
const plain = { caseRef: 'AP-7K3M-9Q2', displayName: 'Synthetic Person', ndisNumber: 'SYNTH-000-111', dob: '1990-01-01', supportNeeds: 'synthetic support need text' };
const audit = { id: 'a1', at: '2026-11-03T00:00:00.000Z', type: 'profile.saved', actor: { kind: 'staff' as const, id: 's1' }, outcome: 'success' as const };

describe('participant profile sealing', () => {
  it('stores C3 fields only as envelopes and round-trips them', async () => {
    const p = provider();
    const sealed = await sealProfile(plain, p, '2026-11-03T00:00:00.000Z');
    expect(sealed.ndisNumberEnc).toMatch(/^v1\./);
    const stored = JSON.stringify(sealed);
    for (const secret of ['SYNTH-000-111', '1990-01-01', 'synthetic support need']) expect(stored).not.toContain(secret);
    const opened = await openProfile(sealed, p);
    expect(opened).toMatchObject({ ndisNumber: 'SYNTH-000-111', dob: '1990-01-01', supportNeeds: 'synthetic support need text' });
  });
  it('binds each ciphertext to its column: swapping two sealed fields fails', async () => {
    const p = provider();
    const sealed = await sealProfile(plain, p, 't');
    const swapped = { ...sealed, ndisNumberEnc: sealed.dobEnc, dobEnc: sealed.ndisNumberEnc };
    await expect(openProfile(swapped, p)).rejects.toMatchObject({ code: 'auth_failed' });
  });
  it('binds to the case: copying a sealed profile onto another case fails', async () => {
    const p = provider();
    const sealed = await sealProfile(plain, p, 't');
    await expect(openProfile({ ...sealed, caseRef: 'AP-AAAA-AAA' }, p)).rejects.toMatchObject({ code: 'auth_failed' });
  });
  it('omits fields that were not provided', async () => {
    const sealed = await sealProfile({ caseRef: 'AP-7K3M-9Q2' }, provider(), 't');
    expect(sealed.ndisNumberEnc).toBeUndefined();
  });
  it('rotates every sealed field to the current key', async () => {
    const p = provider();
    const sealed = await sealProfile(plain, p, 't1');
    p.setCurrent('k2');
    const rotated = await rotateProfile(sealed, p, 't2');
    for (const f of [rotated.ndisNumberEnc, rotated.dobEnc, rotated.supportNeedsEnc]) expect(envelopeKeyId(f as string)).toBe('k2');
    expect((await openProfile(rotated, p)).ndisNumber).toBe('SYNTH-000-111');
    expect(rotated.updatedAt).toBe('t2');
  });
  it('persists through the repository without plaintext', async () => {
    const p = provider();
    const repo = new InMemoryRepository();
    await repo.saveParticipantProfile(await sealProfile(plain, p, 't'), audit);
    const back = await repo.getParticipantProfile(plain.caseRef);
    expect(JSON.stringify(back)).not.toContain('SYNTH-000-111');
    expect(await decryptField(back?.ndisNumberEnc as string, { field: 'ndisNumberEnc', recordId: plain.caseRef }, p)).toBe('SYNTH-000-111');
  });
});
