import { describe, expect, it } from 'vitest';
import { assertSafeAuditMeta } from '../src/memory-guards';
import { ACTIONS, MAX_BREAK_GLASS_MS, REGIONAL_PROFILE_FIELDS, RESOURCE_TYPES, ROLES, can, draftToAuditEvent, pickAllowedFields, type Action, type Actor, type ResourceType, type Role } from '../src/policy';

// ---- Hand-written expectations from docs/05 §4 (NOT derived from the implementation) ----
type Sc = 'assignedInRegion' | 'assignedOutOfRegion' | 'unassignedInRegion' | 'unrelated';
const ALL: Sc[] = ['assignedInRegion', 'assignedOutOfRegion', 'unassignedInRegion', 'unrelated'];
const ASSIGNED: Sc[] = ['assignedInRegion', 'assignedOutOfRegion'];
const ASSIGNED_IN_REGION: Sc[] = ['assignedInRegion'];

type Expect = Partial<Record<ResourceType, Partial<Record<Action, Sc[]>>>>;
const dataAdminActions = { read: ALL, write: ALL, requestExport: ALL, requestDeletion: ALL };

const EXPECT: Record<Role, Expect> = {
  intakeAdministrator: {
    enquiry: dataAdminActions,
    participantProfile: dataAdminActions,
    document: dataAdminActions,
    aggregate: { read: ALL },
  },
  intakeManager: {
    enquiry: { read: ALL, write: ALL, assign: ALL, approveDeletion: ALL },
    participantProfile: { read: ALL, write: ALL, approveDeletion: ALL },
    document: { read: ALL, approveDeletion: ALL },
    aggregate: { read: ALL },
  },
  intakeStaff: {
    enquiry: { read: ASSIGNED, write: ASSIGNED },
    participantProfile: { read: ASSIGNED, write: ASSIGNED },
    document: { read: ASSIGNED, write: ASSIGNED },
  },
  regionalStaff: {
    enquiry: { read: ASSIGNED_IN_REGION },
    participantProfile: { read: ASSIGNED_IN_REGION },
  },
  complianceOfficer: {
    enquiry: { read: ALL },
    participantProfile: { read: ALL },
    document: { read: ALL },
    auditLog: { read: ALL },
    retention: { read: ALL, executeRetention: ALL },
    aggregate: { read: ALL },
  },
  systemAdministrator: {
    staffUser: { read: ALL, write: ALL, manage: ALL },
  },
  marketingStaff: {
    aggregate: { read: ALL },
  },
};

const NOW = new Date('2026-11-03T10:00:00.000Z');
const actorFor = (role: string, extra: Partial<Actor> = {}): Actor => ({ id: 'staff-1', role, active: true, regions: ['central-coast'], ...extra });
const resourceFor = (type: string, sc: Sc) => ({
  type,
  id: 'AP-7K3M-9Q2',
  region: sc === 'assignedInRegion' || sc === 'unassignedInRegion' ? 'central-coast' : 'dubbo',
  assignedTo: sc === 'assignedInRegion' || sc === 'assignedOutOfRegion' ? ['staff-1', 'staff-2'] : ['staff-2'],
});

describe('RBAC matrix: role × resource × action × scenario (deny by default)', () => {
  for (const role of ROLES) {
    describe(role, () => {
      for (const resource of RESOURCE_TYPES) {
        it(`${resource}: every action/scenario matches docs/05 §4`, () => {
          const mismatches: string[] = [];
          for (const action of ACTIONS) {
            for (const sc of ALL) {
              const expected = EXPECT[role][resource]?.[action]?.includes(sc) ?? false;
              const got = can(actorFor(role), action, resourceFor(resource, sc), { now: NOW }).allow;
              if (got !== expected) mismatches.push(`${action}/${sc}: expected ${expected}, got ${got}`);
            }
          }
          expect(mismatches).toEqual([]);
        });
      }
    });
  }
});

describe('deny by default', () => {
  const res = resourceFor('enquiry', 'assignedInRegion');
  it('denies unknown roles, including near-misses and prototype names', () => {
    for (const role of ['', 'admin', 'IntakeManager', 'intakemanager', '__proto__', 'constructor', 'toString', 'root']) {
      expect(can(actorFor(role), 'read', res).allow).toBe(false);
      expect(can(actorFor(role), 'read', res).reason).toBe('unknown_role');
    }
  });
  it('denies unknown resources and unknown actions', () => {
    expect(can(actorFor('intakeAdministrator'), 'read', { type: 'secrets' }).reason).toBe('unknown_resource');
    expect(can(actorFor('intakeAdministrator'), 'drop', res).reason).toBe('unknown_action');
    expect(can(actorFor('intakeAdministrator'), 'toString', res).allow).toBe(false);
  });
  it('denies inactive actors and actors without an id, for every role', () => {
    for (const role of ROLES) {
      expect(can(actorFor(role, { active: false }), 'read', res).reason).toBe('actor_inactive');
      expect(can(actorFor(role, { id: '' }), 'read', res).reason).toBe('actor_inactive');
    }
  });
  it('denies scoped roles when scope attributes are missing', () => {
    expect(can({ id: 'staff-1', role: 'regionalStaff', active: true }, 'read', res).allow).toBe(false); // no regions
    expect(can(actorFor('regionalStaff'), 'read', { type: 'enquiry', assignedTo: ['staff-1'] }).allow).toBe(false); // no region on resource
    expect(can(actorFor('intakeStaff'), 'read', { type: 'enquiry' }).allow).toBe(false); // no assignment list
    expect(can(actorFor('intakeStaff'), 'read', { type: 'enquiry', assignedTo: [] }).allow).toBe(false);
  });
  it('does not mutate its inputs', () => {
    const actor = Object.freeze(actorFor('intakeStaff', { regions: Object.freeze(['central-coast']) as unknown as string[] }));
    const resource = Object.freeze({ ...res, assignedTo: Object.freeze(['staff-1']) as unknown as string[] });
    expect(() => can(actor, 'read', resource)).not.toThrow();
  });
});

describe('horizontal escalation', () => {
  it('intake staff cannot read or write another staff member’s case', () => {
    const other = resourceFor('enquiry', 'unassignedInRegion');
    expect(can(actorFor('intakeStaff'), 'read', other).allow).toBe(false);
    expect(can(actorFor('intakeStaff'), 'write', other).allow).toBe(false);
    expect(can(actorFor('intakeStaff'), 'read', resourceFor('document', 'unassignedInRegion')).allow).toBe(false);
    expect(can(actorFor('intakeStaff'), 'read', resourceFor('participantProfile', 'unassignedInRegion')).allow).toBe(false);
  });
  it('regional staff cannot read an assigned case outside their region, or an unassigned case inside it', () => {
    expect(can(actorFor('regionalStaff'), 'read', resourceFor('enquiry', 'assignedOutOfRegion')).reason).toBe('out_of_scope');
    expect(can(actorFor('regionalStaff'), 'read', resourceFor('enquiry', 'unassignedInRegion')).reason).toBe('out_of_scope');
  });
  it('assignment is by actor id: another actor id on the same role is denied', () => {
    const r = resourceFor('enquiry', 'assignedInRegion');
    expect(can(actorFor('intakeStaff', { id: 'staff-3' }), 'read', r).allow).toBe(false);
  });
});

describe('vertical escalation', () => {
  it('intake staff cannot assign, export, delete, or manage users', () => {
    const r = resourceFor('enquiry', 'assignedInRegion');
    for (const a of ['assign', 'requestExport', 'requestDeletion', 'approveDeletion', 'executeRetention', 'manage'] as const) expect(can(actorFor('intakeStaff'), a, r).allow).toBe(false);
  });
  it('only managers approve deletion; only the compliance officer executes retention; administrators only request', () => {
    const r = resourceFor('enquiry', 'unrelated');
    expect(can(actorFor('intakeAdministrator'), 'approveDeletion', r).allow).toBe(false);
    expect(can(actorFor('intakeAdministrator'), 'requestDeletion', r).allow).toBe(true);
    expect(can(actorFor('intakeManager'), 'approveDeletion', r).allow).toBe(true);
    expect(can(actorFor('intakeManager'), 'executeRetention', { type: 'retention' }).allow).toBe(false);
    expect(can(actorFor('complianceOfficer'), 'executeRetention', { type: 'retention' }).allow).toBe(true);
    expect(can(actorFor('complianceOfficer'), 'approveDeletion', r).allow).toBe(false);
  });
  it('only system administrators manage users; intake administrators cannot', () => {
    expect(can(actorFor('intakeAdministrator'), 'manage', { type: 'staffUser' }).allow).toBe(false);
    expect(can(actorFor('systemAdministrator'), 'manage', { type: 'staffUser' }).allow).toBe(true);
  });
  it('compliance officer is read-only on case data', () => {
    for (const type of ['enquiry', 'participantProfile', 'document']) for (const a of ['write', 'assign', 'requestDeletion', 'requestExport'] as const) expect(can(actorFor('complianceOfficer'), a, resourceFor(type, 'assignedInRegion')).allow).toBe(false);
  });
  it('only compliance officers read the audit log', () => {
    for (const role of ROLES) expect(can(actorFor(role), 'read', { type: 'auditLog' }).allow).toBe(role === 'complianceOfficer');
  });
  it('intake managers cannot write documents; regional staff have no document access', () => {
    expect(can(actorFor('intakeManager'), 'write', resourceFor('document', 'assignedInRegion')).allow).toBe(false);
    expect(can(actorFor('regionalStaff'), 'read', resourceFor('document', 'assignedInRegion')).allow).toBe(false);
  });
});

describe('marketing staff', () => {
  it('have no access to any sensitive resource under any action or scope', () => {
    for (const type of ['enquiry', 'participantProfile', 'document', 'auditLog', 'retention', 'staffUser'] as const) {
      for (const action of ACTIONS) for (const sc of ALL) expect(can(actorFor('marketingStaff'), action, resourceFor(type, sc)).allow).toBe(false);
    }
  });
  it('can read aggregates only', () => expect(can(actorFor('marketingStaff'), 'read', { type: 'aggregate' }).allow).toBe(true));
  it('cannot write aggregates', () => expect(can(actorFor('marketingStaff'), 'write', { type: 'aggregate' }).allow).toBe(false));
});

describe('system administrator and break-glass', () => {
  const sensitive = ['enquiry', 'participantProfile', 'document'] as const;
  const grant = { ticketId: 'INC-1042', grantedAt: '2026-11-03T09:00:00.000Z', expiresAt: '2026-11-03T11:00:00.000Z' };

  it('has no data access by default', () => {
    for (const type of sensitive) for (const action of ACTIONS) expect(can(actorFor('systemAdministrator'), action, resourceFor(type, 'assignedInRegion'), { now: NOW }).allow).toBe(false);
  });
  it('can read sensitive data with a valid break-glass grant, and the decision carries an audit event', () => {
    for (const type of sensitive) {
      const d = can(actorFor('systemAdministrator', { breakGlass: grant }), 'read', resourceFor(type, 'unrelated'), { now: NOW });
      expect(d.allow).toBe(true);
      expect(d.reason).toBe('break_glass');
      expect(d.audit).toHaveLength(1);
      expect(d.audit[0]).toMatchObject({ type: 'access.break_glass', breakGlass: true, ticketId: 'INC-1042', actorId: 'staff-1', resourceType: type });
    }
  });
  it('break-glass is read-only: write, delete, export, assign remain denied', () => {
    for (const action of ACTIONS.filter((a) => a !== 'read')) {
      for (const type of sensitive) expect(can(actorFor('systemAdministrator', { breakGlass: grant }), action, resourceFor(type, 'unrelated'), { now: NOW }).allow).toBe(false);
    }
  });
  it('break-glass does not unlock the audit log, retention or other non-data resources', () => {
    for (const type of ['auditLog', 'retention', 'aggregate'] as const) expect(can(actorFor('systemAdministrator', { breakGlass: grant }), 'read', { type }, { now: NOW }).allow).toBe(false);
  });
  it('is denied (and flagged) after expiry, before start, and at the exact expiry instant', () => {
    const a = actorFor('systemAdministrator', { breakGlass: grant });
    const r = resourceFor('enquiry', 'unrelated');
    expect(can(a, 'read', r, { now: new Date('2026-11-03T11:00:00.000Z') }).reason).toBe('break_glass_invalid');
    expect(can(a, 'read', r, { now: new Date('2026-11-03T12:00:00.000Z') }).allow).toBe(false);
    expect(can(a, 'read', r, { now: new Date('2026-11-03T08:59:59.000Z') }).allow).toBe(false);
    expect(can(a, 'read', r, { now: new Date('2026-11-03T10:59:59.999Z') }).allow).toBe(true);
  });
  it('rejects grants longer than 4 hours, without a ticket, or with malformed dates', () => {
    const r = resourceFor('enquiry', 'unrelated');
    const long = { ...grant, expiresAt: new Date(Date.parse(grant.grantedAt) + MAX_BREAK_GLASS_MS + 1).toISOString() };
    expect(can(actorFor('systemAdministrator', { breakGlass: long }), 'read', r, { now: NOW }).allow).toBe(false);
    const exactly4h = { ...grant, expiresAt: new Date(Date.parse(grant.grantedAt) + MAX_BREAK_GLASS_MS).toISOString() };
    expect(can(actorFor('systemAdministrator', { breakGlass: exactly4h }), 'read', r, { now: NOW }).allow).toBe(true);
    expect(can(actorFor('systemAdministrator', { breakGlass: { ...grant, ticketId: '  ' } }), 'read', r, { now: NOW }).allow).toBe(false);
    expect(can(actorFor('systemAdministrator', { breakGlass: { ...grant, grantedAt: 'nope' } }), 'read', r, { now: NOW }).allow).toBe(false);
    expect(can(actorFor('systemAdministrator', { breakGlass: { ...grant, expiresAt: grant.grantedAt } }), 'read', r, { now: NOW }).allow).toBe(false);
  });
  it('a break-glass grant on any other role grants nothing (vertical escalation)', () => {
    for (const role of ['marketingStaff', 'regionalStaff', 'intakeStaff'] as const) {
      expect(can(actorFor(role, { breakGlass: grant }), 'read', resourceFor('document', 'unrelated'), { now: NOW }).allow).toBe(false);
    }
  });
  it('an inactive system administrator cannot use break-glass', () => {
    expect(can(actorFor('systemAdministrator', { active: false, breakGlass: grant }), 'read', resourceFor('enquiry', 'unrelated'), { now: NOW }).allow).toBe(false);
  });
});

describe('field-level need-to-know and auditing', () => {
  const profile = { displayName: 'Synthetic', region: 'central-coast', servicesRequested: ['sil'], communicationPreferences: 'email', contactMethod: 'email', ndisNumber: 'SYNTH-1', dob: '1990-01-01', supportNeeds: 'x' };
  it('regional staff receive only the need-to-know profile fields', () => {
    const d = can(actorFor('regionalStaff'), 'read', resourceFor('participantProfile', 'assignedInRegion'));
    expect(d.allow).toBe(true);
    expect(d.fields).toEqual([...REGIONAL_PROFILE_FIELDS]);
    const out = pickAllowedFields(profile, d);
    expect(Object.keys(out).sort()).toEqual([...REGIONAL_PROFILE_FIELDS].sort());
    for (const secret of ['ndisNumber', 'dob', 'supportNeeds']) expect(out).not.toHaveProperty(secret);
  });
  it('roles with full access receive every field; denied decisions receive nothing', () => {
    const full = can(actorFor('intakeManager'), 'read', resourceFor('participantProfile', 'unrelated'));
    expect(pickAllowedFields(profile, full)).toEqual(profile);
    expect(pickAllowedFields(profile, can(actorFor('marketingStaff'), 'read', resourceFor('participantProfile', 'unrelated')))).toEqual({});
  });
  it('compliance reads are always marked for audit review', () => {
    const d = can(actorFor('complianceOfficer'), 'read', resourceFor('document', 'unrelated'));
    expect(d.audit.map((a) => a.type)).toEqual(['access.compliance_review']);
  });
  it('denials on sensitive resources emit an access.denied audit draft; non-sensitive denials do not', () => {
    const sens = can(actorFor('marketingStaff'), 'read', resourceFor('enquiry', 'unrelated'));
    expect(sens.audit[0]).toMatchObject({ type: 'access.denied', action: 'read', resourceType: 'enquiry', resourceId: 'AP-7K3M-9Q2' });
    expect(can(actorFor('marketingStaff'), 'write', { type: 'aggregate' }).audit).toEqual([]);
    expect(can(actorFor('intakeStaff'), 'manage', { type: 'staffUser' }).audit).toEqual([]);
  });
  it('audit drafts map to audit events that satisfy the no-PII meta guard', () => {
    const d = can(actorFor('systemAdministrator', { breakGlass: { ticketId: 'INC-1042', grantedAt: '2026-11-03T09:00:00.000Z', expiresAt: '2026-11-03T11:00:00.000Z' } }), 'read', resourceFor('enquiry', 'unrelated'), { now: NOW });
    const ev = draftToAuditEvent(d.audit[0]!, 'evt-1', NOW.toISOString());
    expect(ev).toMatchObject({ type: 'access.break_glass', outcome: 'success', breakGlass: true, actor: { kind: 'staff', id: 'staff-1', role: 'systemAdministrator' } });
    expect(() => assertSafeAuditMeta(ev)).not.toThrow();
    const denied = draftToAuditEvent(can(actorFor('marketingStaff'), 'read', resourceFor('enquiry', 'unrelated')).audit[0]!, 'evt-2', NOW.toISOString());
    expect(denied.outcome).toBe('denied');
  });
});
