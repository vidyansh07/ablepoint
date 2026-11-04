import { normalisePhoneAU, REGION_CHOICES, type RegionChoice } from '@ablepoint/schemas';
import { idempotencyKey } from './retry';

/**
 * A15 Meta lead form → minimal CRM reference. Only an allow-list of contact fields is kept.
 * Any health, disability, funding or plan question in the form rejects the whole lead (names only are reported).
 */

export interface MetaLeadPayload {
  id: string;
  form_id: string;
  created_time?: string;
  ad_id?: string;
  campaign_id?: string;
  field_data: Array<{ name: string; values: string[] }>;
}

export type LeadKind = 'vacancy' | 'recruitment';

export interface MinimalLead {
  idempotencyKey: string;
  leadId: string;
  formId: string;
  kind: LeadKind;
  contact: { name?: string; email?: string; phoneE164?: string };
  region?: RegionChoice;
  enquirerRole?: 'participant' | 'family' | 'coordinator' | 'other';
  source: 'meta';
  campaignId?: string;
  adId?: string;
  /** Vacancy leads go through the A1 acknowledgement; recruitment leads go to the A16 pipeline, not intake. */
  next: 'acknowledge_via_a1' | 'recruitment_pipeline';
  /** Field NAMES discarded because they were not on the allow-list (values are never kept). */
  droppedFields: string[];
}

export type MetaLeadResult =
  | { ok: true; lead: MinimalLead }
  | { ok: false; reason: 'invalid_payload' | 'unknown_form' | 'sensitive_field_present' | 'missing_contact'; sensitiveFieldNames?: string[] };

const SENSITIVE_FIELD = /(disab|diagnos|condition|health|ndis|ndia|medic|support_?needs?|impair|autis|mental|funding|plan|dob|birth|therapy|illness|behaviour|behavior|goals)/;
const norm = (n: string) => n.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

const REGION_BY_NAME: Record<string, RegionChoice> = Object.fromEntries(REGION_CHOICES.filter((r) => r !== 'not-sure').map((r) => [r.replace(/-/g, ' '), r]));

const ALLOWED = new Set(['full_name', 'first_name', 'last_name', 'email', 'phone_number', 'phone', 'city', 'suburb', 'region', 'postcode', 'enquirer_role', 'role']);

export function mapMetaLead(payload: MetaLeadPayload, config: { formKinds: Record<string, LeadKind> }): MetaLeadResult {
  if (!payload || typeof payload.id !== 'string' || !payload.id || typeof payload.form_id !== 'string' || !Array.isArray(payload.field_data)) return { ok: false, reason: 'invalid_payload' };
  const kind = config.formKinds[payload.form_id];
  if (!kind) return { ok: false, reason: 'unknown_form' };

  const sensitive = payload.field_data.map((f) => norm(f.name)).filter((n) => SENSITIVE_FIELD.test(n));
  if (sensitive.length) return { ok: false, reason: 'sensitive_field_present', sensitiveFieldNames: sensitive };

  const get = (names: string[]) => {
    for (const f of payload.field_data) if (names.includes(norm(f.name))) return f.values[0]?.trim() || undefined;
    return undefined;
  };
  const dropped = payload.field_data.map((f) => norm(f.name)).filter((n) => !ALLOWED.has(n));

  const full = get(['full_name']) ?? [get(['first_name']), get(['last_name'])].filter(Boolean).join(' ');
  const emailRaw = get(['email']);
  const email = emailRaw && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailRaw) ? emailRaw.toLowerCase() : undefined;
  const phoneRaw = get(['phone_number', 'phone']);
  const phoneE164 = phoneRaw ? (normalisePhoneAU(phoneRaw) ?? undefined) : undefined;
  if (!email && !phoneE164) return { ok: false, reason: 'missing_contact' };

  const regionText = (get(['region', 'city', 'suburb']) ?? '').toLowerCase();
  const region = Object.entries(REGION_BY_NAME).find(([name]) => regionText.includes(name))?.[1];
  const roleText = (get(['enquirer_role', 'role']) ?? '').toLowerCase();
  const enquirerRole = roleText ? (/coordinator/.test(roleText) ? 'coordinator' : /family|carer|parent/.test(roleText) ? 'family' : /participant|myself|me\b/.test(roleText) ? 'participant' : 'other') : undefined;

  const lead: MinimalLead = {
    idempotencyKey: idempotencyKey('meta', payload.id),
    leadId: payload.id,
    formId: payload.form_id,
    kind,
    contact: { ...(full ? { name: full } : {}), ...(email ? { email } : {}), ...(phoneE164 ? { phoneE164 } : {}) },
    ...(region ? { region } : {}),
    ...(enquirerRole ? { enquirerRole } : {}),
    source: 'meta',
    ...(payload.campaign_id ? { campaignId: payload.campaign_id } : {}),
    ...(payload.ad_id ? { adId: payload.ad_id } : {}),
    next: kind === 'vacancy' ? 'acknowledge_via_a1' : 'recruitment_pipeline',
    droppedFields: dropped,
  };
  return { ok: true, lead };
}
