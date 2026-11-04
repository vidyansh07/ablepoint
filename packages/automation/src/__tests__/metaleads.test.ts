import { describe, expect, it } from 'vitest';
import { mapMetaLead, type MetaLeadPayload } from '../metaleads';

const config = { formKinds: { form_vac: 'vacancy', form_job: 'recruitment' } as const };
const fields = (obj: Record<string, string>) => Object.entries(obj).map(([name, v]) => ({ name, values: [v] }));
const payload = (over: Partial<MetaLeadPayload> = {}, f: Record<string, string> = {}): MetaLeadPayload => ({
  id: 'lead_123',
  form_id: 'form_vac',
  campaign_id: 'camp_1',
  ad_id: 'ad_1',
  field_data: fields({ full_name: 'Sam Example', email: 'Sam@Example.test', phone_number: '0412 345 678', city: 'Newcastle NSW', enquirer_role: "I'm a support coordinator", ...f }),
  ...over,
});

describe('mapMetaLead (A15)', () => {
  it('maps a vacancy lead to the minimal CRM reference', () => {
    const r = mapMetaLead(payload(), config);
    expect(r).toMatchObject({ ok: true, lead: { leadId: 'lead_123', formId: 'form_vac', kind: 'vacancy', source: 'meta', region: 'newcastle', enquirerRole: 'coordinator', campaignId: 'camp_1', adId: 'ad_1', next: 'acknowledge_via_a1', contact: { name: 'Sam Example', email: 'sam@example.test', phoneE164: '+61412345678' } } });
  });
  it('routes recruitment leads to the A16 pipeline, not intake', () => {
    const r = mapMetaLead(payload({ form_id: 'form_job' }), config);
    expect(r).toMatchObject({ ok: true, lead: { kind: 'recruitment', next: 'recruitment_pipeline' } });
  });
  it('rejects an unknown form', () => expect(mapMetaLead(payload({ form_id: 'other' }), config)).toEqual({ ok: false, reason: 'unknown_form' }));
  it.each([[null], [{ id: '', form_id: 'x', field_data: [] }], [{ id: 'a', form_id: 'form_vac' }]])('rejects an invalid payload', (p) => {
    expect(mapMetaLead(p as unknown as MetaLeadPayload, config)).toEqual({ ok: false, reason: 'invalid_payload' });
  });
  it.each([
    ['Do you have a disability?', 'disability_do_you_have_a_disability'],
    ['NDIS number', 'ndis_number'],
    ['Primary diagnosis', 'primary_diagnosis'],
    ['Tell us about your health', 'tell_us_about_your_health'],
    ['Funding type', 'funding_type'],
    ['Support needs', 'support_needs'],
    ['Plan start date', 'plan_start_date'],
    ['Date of birth', 'date_of_birth'],
  ])('rejects a lead with the sensitive question "%s", reporting names only', (name) => {
    const r = mapMetaLead(payload({ field_data: [...payload().field_data, { name, values: ['SECRET-VALUE-123'] }] }), config);
    expect(r).toMatchObject({ ok: false, reason: 'sensitive_field_present' });
    expect(JSON.stringify(r)).not.toContain('SECRET-VALUE-123');
  });
  it('rejects a lead with no usable contact method', () => expect(mapMetaLead(payload({}, { email: 'not-an-email', phone_number: '123' }), config)).toEqual({ ok: false, reason: 'missing_contact' }));
  it('accepts a lead with only a valid phone, dropping the invalid email', () => {
    const r = mapMetaLead(payload({}, { email: 'bad' }), config);
    expect(r).toMatchObject({ ok: true, lead: { contact: { phoneE164: '+61412345678' } } });
    if (r.ok) expect(r.lead.contact.email).toBeUndefined();
  });
  it('drops non-allow-listed harmless fields and reports their names only', () => {
    const r = mapMetaLead(payload({}, { favourite_colour: 'teal' }), config);
    expect(r).toMatchObject({ ok: true, lead: { droppedFields: ['favourite_colour'] } });
    expect(JSON.stringify(r)).not.toContain('teal');
  });
  it('is idempotent per lead id', () => {
    const a = mapMetaLead(payload(), config);
    const b = mapMetaLead(payload({}, { full_name: 'Someone Else' }), config);
    expect(a.ok && b.ok && a.lead.idempotencyKey === b.lead.idempotencyKey).toBe(true);
    const c = mapMetaLead(payload({ id: 'lead_999' }), config);
    expect(a.ok && c.ok && a.lead.idempotencyKey !== c.lead.idempotencyKey).toBe(true);
  });
  it('maps first and last name together, and maps roles', () => {
    const r = mapMetaLead(payload({ field_data: fields({ first_name: 'Sam', last_name: 'Example', email: 'a@b.test', role: 'Family member' }) }), config);
    expect(r).toMatchObject({ ok: true, lead: { contact: { name: 'Sam Example' }, enquirerRole: 'family' } });
  });
  it('does not carry the raw payload', () => {
    const r = mapMetaLead(payload(), config);
    expect(Object.keys(r.ok ? r.lead : {}).sort()).toEqual(['adId', 'campaignId', 'contact', 'droppedFields', 'enquirerRole', 'formId', 'idempotencyKey', 'kind', 'leadId', 'next', 'region', 'source']);
  });
});
