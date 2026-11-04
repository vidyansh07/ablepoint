import type { RegionChoice, ServiceCategory } from '@ablepoint/schemas';
import { businessMinutesElapsed, DEFAULT_BUSINESS_HOURS, type BusinessHours } from './common';

/** A4: match service + region to an owner via a versioned table; escalate if unattended. */

export interface RoutingRule {
  service: ServiceCategory | '*';
  region: RegionChoice | '*';
  ownerId: string;
}

export interface RoutingTable {
  version: string;
  rules: readonly RoutingRule[];
  fallbackOwnerId: string;
  managerId: string;
}

export type MatchKind = 'exact' | 'region' | 'service' | 'catch-all' | 'fallback';

export interface RouteResult {
  ownerId: string;
  matchKind: MatchKind;
  tableVersion: string;
}

export function validateRoutingTable(t: RoutingTable): string[] {
  const problems: string[] = [];
  if (!t.version.trim()) problems.push('missing_version');
  if (!t.fallbackOwnerId.trim()) problems.push('missing_fallback_owner');
  if (!t.managerId.trim()) problems.push('missing_manager');
  const seen = new Set<string>();
  for (const r of t.rules) {
    if (!r.ownerId.trim()) problems.push(`empty_owner:${r.service}/${r.region}`);
    const key = `${r.service}|${r.region}`;
    if (seen.has(key)) problems.push(`duplicate_rule:${key}`);
    seen.add(key);
  }
  return problems;
}

const RANK: Record<Exclude<MatchKind, 'fallback'>, number> = { exact: 3, region: 2, service: 1, 'catch-all': 0 };

/** Most specific rule wins (exact > region-only > service-only > catch-all); ties go to the earlier service, then the earlier rule. */
export function routeEnquiry(table: RoutingTable, enquiry: { services: readonly ServiceCategory[]; region: RegionChoice }): RouteResult {
  const services: readonly ServiceCategory[] = enquiry.services.length ? enquiry.services : ['not-sure'];
  let best: { rule: RoutingRule; kind: Exclude<MatchKind, 'fallback'> } | null = null;
  for (const svc of services) {
    for (const rule of table.rules) {
      const serviceOk = rule.service === '*' || rule.service === svc;
      const regionOk = rule.region === '*' || rule.region === enquiry.region;
      if (!serviceOk || !regionOk) continue;
      const kind: Exclude<MatchKind, 'fallback'> =
        rule.service !== '*' && rule.region !== '*' ? 'exact' : rule.region !== '*' ? 'region' : rule.service !== '*' ? 'service' : 'catch-all';
      if (!best || RANK[kind] > RANK[best.kind]) best = { rule, kind };
    }
  }
  if (!best) return { ownerId: table.fallbackOwnerId, matchKind: 'fallback', tableVersion: table.version };
  return { ownerId: best.rule.ownerId, matchKind: best.kind, tableVersion: table.version };
}

export const ESCALATION_THRESHOLD_MINUTES = 30;

export interface EscalationResult {
  escalate: boolean;
  reason: 'acknowledged' | 'within_threshold' | 'threshold_reached';
  businessMinutesElapsed: number;
}

/**
 * Escalate to the manager once the owner has not acknowledged for 30 BUSINESS minutes
 * (inclusive: exactly 30 escalates). The clock only runs during business hours.
 */
export function escalationDecision(input: { createdAt: Date; ownerAcknowledgedAt?: Date; now: Date; thresholdMinutes?: number; hours?: BusinessHours }): EscalationResult {
  if (input.ownerAcknowledgedAt) return { escalate: false, reason: 'acknowledged', businessMinutesElapsed: 0 };
  const threshold = input.thresholdMinutes ?? ESCALATION_THRESHOLD_MINUTES;
  const elapsed = businessMinutesElapsed(input.createdAt, input.now, input.hours ?? DEFAULT_BUSINESS_HOURS, threshold);
  return elapsed >= threshold ? { escalate: true, reason: 'threshold_reached', businessMinutesElapsed: elapsed } : { escalate: false, reason: 'within_threshold', businessMinutesElapsed: elapsed };
}
