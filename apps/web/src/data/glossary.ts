import type { DraftMeta } from './types';

/**
 * Plain-English glossary (docs/25 §5.2). DRAFT. The definitions below are deliberately general and were NOT checked against
 * the official NDIS glossary: ndis.gov.au refuses automated reading (HTTP 403 on 3 Nov 2026), so a person must compare every
 * entry with the official wording and add the source link before approval. Eligibility, amounts and limits are left out on purpose.
 */
export interface GlossaryTerm extends DraftMeta {
  slug: string;
  term: string;
  abbreviation?: string;
  /** Plain-English definition, one to three sentences, no eligibility promises. */
  definition: string;
  /** Official page the reviewer compared this against. Required before approval. */
  sourceUrl?: string;
}

const base = {
  reviewState: 'draft' as const,
  updatedAt: '2026-11-03T00:00:00Z',
  missingFacts: ['Compare with the official NDIS wording and add the source link'],
};

export const glossary: GlossaryTerm[] = [
  { ...base, slug: 'core-supports', term: 'Core supports', definition: 'Supports that help with everyday activities. What a person can use depends on their NDIS plan.' },
  { ...base, slug: 'nominee', term: 'Nominee', definition: 'A person who is formally allowed to act or make decisions for an NDIS participant, under the NDIS rules. Ask the NDIA how to set one up.' },
  { ...base, slug: 'participant', term: 'Participant', definition: 'A person who has an NDIS plan.' },
  { ...base, slug: 'plan-management', term: 'Plan management', definition: 'The way the money in a plan is looked after. A plan can be managed by the NDIA, by a plan manager, by the participant (self-managed), or by a mix. The choice affects which providers a person can use and how invoices are paid.' },
  { ...base, slug: 'registered-provider', term: 'Registered provider', definition: 'A provider that has registered with the NDIS Quality and Safeguards Commission to deliver certain supports. Some plans can only use registered providers. Anyone can check a provider on the Commission’s public register.' },
  { ...base, slug: 'service-agreement', term: 'Service agreement', definition: 'A written agreement between a participant and a provider. It sets out what supports will be provided, when and how, what they cost, and how either side can change or end the agreement.' },
  { ...base, slug: 'sda', term: 'Specialist Disability Accommodation', abbreviation: 'SDA', definition: 'Housing designed for people with very high support needs or significant physical or functional impairment. SDA funding is for the home itself. Support in the home is separate. Only some participants have SDA in their plan.' },
  { ...base, slug: 'sil', term: 'Supported Independent Living', abbreviation: 'SIL', definition: 'Help with, or supervision of, everyday tasks in a person’s home so they can live as independently as possible. It is a support, not the house itself, and it is separate from rent and living costs.' },
  { ...base, slug: 'short-term-accommodation', term: 'Short term accommodation', abbreviation: 'STA', definition: 'A short stay away from home with support. It can include respite for family and carers. How much a person has depends on their plan.' },
  { ...base, slug: 'support-coordination', term: 'Support coordination', definition: 'Help to understand a plan, choose providers, and connect and organise supports. Support coordination is a separate support from the services a coordinator may help someone find.' },
  { ...base, slug: 'worker-screening', term: 'NDIS Worker Screening Check', definition: 'A check of whether a person is cleared to work with NDIS participants in certain roles. Rules depend on the role and the state or territory.' },
];
