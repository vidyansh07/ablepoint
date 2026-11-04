import { defineArrayMember, defineField, defineType } from 'sanity';
import { VACANCY_STATUS_TITLES, VACANCY_STATUSES } from '../constants';
import { validateInternalOwnerLabel, validateLastVerifiedNotFuture, validateNoStreetAddress, validateVacancyAvailability } from '../validation';
import { publicTextRules, slugField, textField, withReview, type AnyRule } from './shared';

const accommodationTypes = [
  { value: 'SIL', title: 'Supported independent living (SIL)' },
  { value: 'SDA', title: 'Specialist disability accommodation (SDA)' },
  { value: 'STA', title: 'Short term accommodation (STA)' },
];

/** Public-facing property. Suburb only: no street address, no resident or assessment information (docs/06 §2, §5). */
export const property = defineType(
  withReview({
    name: 'property',
    title: 'Property',
    type: 'document',
    fields: [
      textField('title', 'Public name', { required: true, max: 90, noStreetAddress: true, description: 'A descriptive name, not the street address.' }),
      slugField(),
      defineField({ name: 'region', title: 'Region', type: 'reference', group: 'content', to: [{ type: 'region' }], validation: (Rule: AnyRule) => Rule.required() }),
      textField('suburb', 'Suburb', { required: true, max: 60, noStreetAddress: true }),
      defineField({ name: 'classification', title: 'Type', type: 'string', group: 'content', options: { list: accommodationTypes }, validation: (Rule: AnyRule) => Rule.required() }),
      defineField({ name: 'features', title: 'Features', type: 'array', group: 'content', of: [{ type: 'string' }], validation: (Rule: AnyRule) => [...publicTextRules(Rule), Rule.custom((v: any) => validateNoStreetAddress(v))] }),
      defineField({ name: 'accessibilityFeatures', title: 'Accessibility features', type: 'array', group: 'content', of: [{ type: 'string' }], validation: (Rule: AnyRule) => publicTextRules(Rule) }),
      defineField({ name: 'photos', title: 'Approved photos', type: 'array', group: 'content', of: [defineArrayMember({ type: 'mediaAsset' })] }),
    ],
    preview: { select: { title: 'title', subtitle: 'suburb' } },
  }),
);

export const vacancy = defineType(
  withReview({
    name: 'vacancy',
    title: 'Vacancy',
    type: 'document',
    fields: [
      textField('title', 'Title', { required: true, max: 90, noStreetAddress: true }),
      slugField(),
      defineField({ name: 'property', title: 'Property', type: 'reference', group: 'content', to: [{ type: 'property' }], validation: (Rule: AnyRule) => Rule.required() }),
      defineField({ name: 'region', title: 'Region', type: 'reference', group: 'content', to: [{ type: 'region' }], validation: (Rule: AnyRule) => Rule.required() }),
      textField('suburb', 'Suburb', { required: true, max: 60, noStreetAddress: true }),
      defineField({ name: 'type', title: 'Type', type: 'string', group: 'content', options: { list: accommodationTypes, layout: 'radio' }, validation: (Rule: AnyRule) => Rule.required() }),
      defineField({
        name: 'status',
        title: 'Status',
        type: 'string',
        group: 'content',
        options: { list: VACANCY_STATUSES.map((v) => ({ value: v, title: VACANCY_STATUS_TITLES[v] })) },
        initialValue: 'draft',
        description: 'Allowed changes: Draft, Ready for review, Available, Temporarily unavailable, Filled, Archived. "Available" needs a recent Last verified date.',
        validation: (Rule: AnyRule) => [Rule.required(), Rule.custom((value: any, context: any) => validateVacancyAvailability({ status: value as string, lastVerifiedAt: (context.document as { lastVerifiedAt?: string } | undefined)?.lastVerifiedAt }))],
      }),
      textField('summary', 'Availability summary', { type: 'text', required: true, max: 300, noStreetAddress: true }),
      defineField({ name: 'features', title: 'Features', type: 'array', group: 'content', of: [{ type: 'string' }], validation: (Rule: AnyRule) => [...publicTextRules(Rule), Rule.custom((v: any) => validateNoStreetAddress(v))] }),
      defineField({ name: 'accessibilityFeatures', title: 'Accessibility features', type: 'array', group: 'content', of: [{ type: 'string' }], validation: (Rule: AnyRule) => publicTextRules(Rule) }),
      defineField({ name: 'photos', title: 'Approved photos', type: 'array', group: 'content', of: [defineArrayMember({ type: 'mediaAsset' })] }),
      defineField({ name: 'lastVerifiedAt', title: 'Last verified', type: 'datetime', group: 'content', description: 'When someone confirmed this vacancy is still open. Availability older than 14 days shows as unconfirmed.', validation: (Rule: AnyRule) => Rule.custom((v: any) => validateLastVerifiedNotFuture(v as string | undefined)) }),
      defineField({
        name: 'internalOwner',
        title: 'Internal owner (role label)',
        type: 'string',
        group: 'content',
        description: 'INTERNAL. A role such as "Central Coast intake", never a person, email or phone. Never queried by the site.',
        validation: (Rule: AnyRule) => Rule.custom((v: any) => validateInternalOwnerLabel(v as string | undefined)),
      }),
      defineField({ name: 'cta', title: 'Enquiry button', type: 'reference', group: 'content', to: [{ type: 'cta' }] }),
    ],
    orderings: [{ title: 'Last verified, newest first', name: 'verifiedDesc', by: [{ field: 'lastVerifiedAt', direction: 'desc' }] }],
    preview: { select: { title: 'title', subtitle: 'status' } },
  }),
);

export const accommodationSchemas = [property, vacancy];
