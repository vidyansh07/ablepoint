/**
 * Deny-by-default role-based access control (docs/05 §4). Pure: no I/O, no clock unless injected.
 * The API layer MUST call `can()` before every repository read/write; the database adds RLS as a second layer.
 *
 * Interpretations where docs/05 §4 is silent are marked INTERPRETATION and listed in the README.
 */

export const ROLES = [
  'intakeAdministrator',
  'intakeManager',
  'intakeStaff',
  'regionalStaff',
  'complianceOfficer',
  'systemAdministrator',
  'marketingStaff',
] as const;
export type Role = (typeof ROLES)[number];

export const RESOURCE_TYPES = ['enquiry', 'participantProfile', 'document', 'auditLog', 'retention', 'staffUser', 'aggregate'] as const;
export type ResourceType = (typeof RESOURCE_TYPES)[number];

export const ACTIONS = ['read', 'write', 'assign', 'requestExport', 'requestDeletion', 'approveDeletion', 'executeRetention', 'manage'] as const;
export type Action = (typeof ACTIONS)[number];

/** Resource types that hold C2/C3/C4 data or security records: denials on these are audited. */
export const SENSITIVE_RESOURCES: readonly ResourceType[] = ['enquiry', 'participantProfile', 'document', 'auditLog', 'retention'];

/** Need-to-know profile fields for regional staff. INTERPRETATION: excludes NDIS number, DOB, support needs. */
export const REGIONAL_PROFILE_FIELDS = ['displayName', 'region', 'servicesRequested', 'communicationPreferences', 'contactMethod'] as const;

export const MAX_BREAK_GLASS_MS = 4 * 60 * 60 * 1000;

export interface BreakGlassGrant {
  ticketId: string;
  grantedAt: string;
  expiresAt: string;
}

export interface Actor {
  id: string;
  /** Unknown roles are denied. */
  role: string;
  active: boolean;
  /** Region scope (region slugs). */
  regions?: readonly string[];
  breakGlass?: BreakGlassGrant;
}

export interface Resource {
  type: ResourceType | string;
  id?: string;
  region?: string;
  assignedTo?: readonly string[];
}

export interface AuditDraft {
  type: 'access.denied' | 'access.break_glass' | 'access.compliance_review';
  actorId: string;
  role: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  reason: string;
  breakGlass: boolean;
  ticketId?: string;
}

export interface Decision {
  allow: boolean;
  reason: string;
  /** When set, the caller must return only these fields (see `pickAllowedFields`). */
  fields?: readonly string[];
  audit: readonly AuditDraft[];
}

type Scope = 'any' | 'assigned' | 'assignedInRegion';
interface Rule {
  resource: ResourceType;
  actions: readonly Action[];
  scope: Scope;
  fields?: readonly string[];
  audit?: 'compliance';
}

const SENSITIVE_DATA: readonly ResourceType[] = ['enquiry', 'participantProfile', 'document'];
const rw = ['read', 'write'] as const;

const RULES: Record<Role, readonly Rule[]> = {
  intakeAdministrator: [
    { resource: 'enquiry', actions: rw, scope: 'any' },
    { resource: 'participantProfile', actions: rw, scope: 'any' },
    { resource: 'document', actions: rw, scope: 'any' },
    // docs/05: "request" export/deletion (approval is the manager's).
    ...SENSITIVE_DATA.map((resource): Rule => ({ resource, actions: ['requestExport', 'requestDeletion'], scope: 'any' })),
    // INTERPRETATION: aggregates are not sensitive.
    { resource: 'aggregate', actions: ['read'], scope: 'any' },
  ],
  intakeManager: [
    { resource: 'enquiry', actions: ['read', 'write', 'assign'], scope: 'any' },
    { resource: 'participantProfile', actions: rw, scope: 'any' },
    { resource: 'document', actions: ['read'], scope: 'any' },
    ...SENSITIVE_DATA.map((resource): Rule => ({ resource, actions: ['approveDeletion'], scope: 'any' })),
    { resource: 'aggregate', actions: ['read'], scope: 'any' },
  ],
  intakeStaff: [
    // INTERPRETATION: "assigned cases" = read and write (including uploading documents) on assigned cases only.
    { resource: 'enquiry', actions: rw, scope: 'assigned' },
    { resource: 'participantProfile', actions: rw, scope: 'assigned' },
    { resource: 'document', actions: rw, scope: 'assigned' },
  ],
  regionalStaff: [
    { resource: 'enquiry', actions: ['read'], scope: 'assignedInRegion' },
    { resource: 'participantProfile', actions: ['read'], scope: 'assignedInRegion', fields: REGIONAL_PROFILE_FIELDS },
    // No document rule: "no by default".
  ],
  complianceOfficer: [
    { resource: 'enquiry', actions: ['read'], scope: 'any', audit: 'compliance' },
    { resource: 'participantProfile', actions: ['read'], scope: 'any', audit: 'compliance' },
    { resource: 'document', actions: ['read'], scope: 'any', audit: 'compliance' },
    { resource: 'auditLog', actions: ['read'], scope: 'any' },
    { resource: 'retention', actions: ['read', 'executeRetention'], scope: 'any' },
    { resource: 'aggregate', actions: ['read'], scope: 'any' },
  ],
  systemAdministrator: [
    // Infrastructure and user administration only. No data access without break-glass.
    { resource: 'staffUser', actions: ['read', 'write', 'manage'], scope: 'any' },
  ],
  marketingStaff: [{ resource: 'aggregate', actions: ['read'], scope: 'any' }],
};

const isRole = (r: string): r is Role => (ROLES as readonly string[]).includes(r);

export interface DecisionContext {
  /** Injected for determinism. Defaults to the wall clock (only used for break-glass expiry). */
  now?: Date;
}

function deny(actor: Actor, action: string, resource: Resource, reason: string): Decision {
  const sensitive = (SENSITIVE_RESOURCES as readonly string[]).includes(resource.type);
  const audit: AuditDraft[] = sensitive
    ? [{ type: 'access.denied', actorId: actor.id, role: actor.role, action, resourceType: resource.type, ...(resource.id ? { resourceId: resource.id } : {}), reason, breakGlass: false }]
    : [];
  return { allow: false, reason, audit };
}

function scopeOk(scope: Scope, actor: Actor, resource: Resource): boolean {
  if (scope === 'any') return true;
  const assigned = !!resource.assignedTo && resource.assignedTo.includes(actor.id);
  if (scope === 'assigned') return assigned;
  return assigned && !!resource.region && !!actor.regions && actor.regions.includes(resource.region);
}

function breakGlassValid(grant: BreakGlassGrant | undefined, now: Date): boolean {
  if (!grant || !grant.ticketId.trim()) return false;
  const from = Date.parse(grant.grantedAt);
  const to = Date.parse(grant.expiresAt);
  if (Number.isNaN(from) || Number.isNaN(to) || to <= from) return false;
  if (to - from > MAX_BREAK_GLASS_MS) return false;
  const t = now.getTime();
  return t >= from && t < to;
}

export function can(actor: Actor, action: Action | string, resource: Resource, ctx: DecisionContext = {}): Decision {
  if (!actor.id || !actor.active) return deny(actor, action, resource, 'actor_inactive');
  if (!isRole(actor.role)) return deny(actor, action, resource, 'unknown_role');
  if (!(RESOURCE_TYPES as readonly string[]).includes(resource.type)) return deny(actor, action, resource, 'unknown_resource');
  if (!(ACTIONS as readonly string[]).includes(action)) return deny(actor, action, resource, 'unknown_action');

  for (const rule of RULES[actor.role]) {
    if (rule.resource !== resource.type || !rule.actions.includes(action as Action)) continue;
    if (!scopeOk(rule.scope, actor, resource)) return deny(actor, action, resource, 'out_of_scope');
    const audit: AuditDraft[] =
      rule.audit === 'compliance'
        ? [{ type: 'access.compliance_review', actorId: actor.id, role: actor.role, action, resourceType: resource.type, ...(resource.id ? { resourceId: resource.id } : {}), reason: 'compliance_review', breakGlass: false }]
        : [];
    return { allow: true, reason: 'role_rule', ...(rule.fields ? { fields: rule.fields } : {}), audit };
  }

  // Break-glass: read-only access to sensitive data for system administrators, time-boxed and always audited.
  if (actor.role === 'systemAdministrator' && action === 'read' && (SENSITIVE_DATA as readonly string[]).includes(resource.type)) {
    const now = ctx.now ?? new Date();
    if (breakGlassValid(actor.breakGlass, now)) {
      const grant = actor.breakGlass as BreakGlassGrant;
      return {
        allow: true,
        reason: 'break_glass',
        audit: [{ type: 'access.break_glass', actorId: actor.id, role: actor.role, action, resourceType: resource.type, ...(resource.id ? { resourceId: resource.id } : {}), reason: 'break_glass', breakGlass: true, ticketId: grant.ticketId }],
      };
    }
    return deny(actor, action, resource, actor.breakGlass ? 'break_glass_invalid' : 'no_rule');
  }

  return deny(actor, action, resource, 'no_rule');
}

/** Strip a record down to the fields a decision permits. Without `fields`, the record is returned as a shallow copy. */
export function pickAllowedFields<T extends Record<string, unknown>>(record: T, decision: Decision): Partial<T> {
  if (!decision.allow) return {};
  if (!decision.fields) return { ...record };
  const out: Partial<T> = {};
  for (const key of decision.fields) if (key in record) (out as Record<string, unknown>)[key] = record[key];
  return out;
}

/** Map a policy audit draft to a storable audit event (the caller supplies id and timestamp). */
export function draftToAuditEvent(draft: AuditDraft, id: string, at: string): import('./ports').AuditEvent {
  return {
    id,
    at,
    type: draft.type,
    actor: { kind: 'staff', id: draft.actorId, role: draft.role },
    entity: { type: draft.resourceType, ...(draft.resourceId ? { id: draft.resourceId } : {}) },
    outcome: draft.type === 'access.denied' ? 'denied' : 'success',
    breakGlass: draft.breakGlass,
    meta: { action: draft.action, reason: draft.reason, ...(draft.ticketId ? { ticketId: draft.ticketId } : {}) },
  };
}
