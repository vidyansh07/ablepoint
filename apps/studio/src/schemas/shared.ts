import { defineArrayMember, defineField } from 'sanity';

/* eslint-disable @typescript-eslint/no-explicit-any */
/** Sanity passes a differently-typed Rule per field type; schema code only uses the shared builder methods. */
export type AnyRule = any;
import { REVIEW_STATES } from '../constants';
import { readStudioEnvLoose } from './reviewers';
import {
  canEditApprovalFields,
  extractPortableText,
  slugify,
  validateApprovalFields,
  validateNoBannedPhrases,
  validateNoContactDetails,
  validateNoStreetAddress,
  validateNotStaleApproval,
  validateReviewDates,
  validateSlug,
} from '../validation';

/** Fields every reviewable document carries (docs/06 §2, apps/web `DraftMeta`). */
export const reviewGroup = { name: 'review', title: 'Review and approval' } as const;

const reviewerIds = () => readStudioEnvLoose().reviewerIds;

export const reviewFields = [
  defineField({
    name: 'reviewState',
    title: 'Review state',
    type: 'string',
    group: 'review',
    description: 'Draft, then In review, then Approved by the compliance reviewer. Only approved content appears on the public site.',
    options: { list: REVIEW_STATES.map((v) => ({ value: v, title: v === 'inReview' ? 'In review' : v[0]!.toUpperCase() + v.slice(1) })), layout: 'radio' },
    initialValue: 'draft',
    validation: (Rule: AnyRule) => [
      Rule.required(),
      Rule.custom((value: any, context: any) => validateApprovalFields({ ...(context.document as Record<string, unknown>), reviewState: value }, reviewerIds())),
      Rule.custom((_value: any, context: any) => validateNotStaleApproval((context.document ?? {}) as Record<string, unknown>)).warning(),
    ],
  }),
  defineField({
    name: 'approvedBy',
    title: 'Approved by',
    type: 'string',
    group: 'review',
    description: 'Sanity user ID of the compliance reviewer. SOFT control: only listed reviewers can edit this in Studio. The site build is the hard gate.',
    readOnly: ({ currentUser }) => !canEditApprovalFields(currentUser?.id, reviewerIds()),
  }),
  defineField({
    name: 'approvedAt',
    title: 'Approved at',
    type: 'datetime',
    group: 'review',
    readOnly: ({ currentUser }) => !canEditApprovalFields(currentUser?.id, reviewerIds()),
  }),
  defineField({
    name: 'approvedContentHash',
    title: 'Approval record (hash of approved content)',
    type: 'string',
    group: 'review',
    description: 'Written only by the "Approve for publication" action. Do not edit.',
    readOnly: true,
    hidden: true,
  }),
  defineField({ name: 'reviewedAt', title: 'Last reviewed', type: 'datetime', group: 'review' }),
  defineField({
    name: 'nextReviewDue',
    title: 'Next review due',
    type: 'date',
    group: 'review',
    validation: (Rule: AnyRule) =>
      Rule.custom((value: any, context: any) => validateReviewDates((context.document as { reviewedAt?: string } | undefined)?.reviewedAt, value as string | undefined)),
  }),
  defineField({
    name: 'missingFacts',
    title: 'Facts still needed',
    type: 'array',
    group: 'review',
    of: [{ type: 'string' }],
    description: 'Shown to editors in staging as a draft checklist. Never shown in production.',
  }),
];

export const withReview = <T extends { groups?: unknown[]; fields: unknown[] }>(def: T) => ({
  ...def,
  groups: [{ name: 'content', title: 'Content', default: true }, ...((def.groups as object[]) ?? []), reviewGroup],
  fields: [...def.fields, ...reviewFields],
});

/** Standard plain-text validation: contact details are errors, banned phrases are warnings. */
export const publicTextRules = (Rule: AnyRule) => [Rule.custom((v: any) => validateNoContactDetails(v)), Rule.custom((v: any) => validateNoBannedPhrases(v)).warning()];

export const slugField = (opts: { source?: string; topLevel?: boolean } = {}) =>
  defineField({
    name: 'slug',
    title: 'Slug',
    type: 'slug',
    group: 'content',
    description: 'The page address. Lowercase letters, numbers and hyphens only. Changing it later needs a redirect.',
    options: { source: opts.source ?? 'title', maxLength: 96, slugify: (input: string) => slugify(input) },
    validation: (Rule: AnyRule) => Rule.required().custom((value: any) => validateSlug((value as { current?: string } | undefined)?.current, { topLevel: opts.topLevel })),
  });

/** Portable Text without H1 (the template owns the single H1), with only safe annotations. */
export const richTextOf = () => [
  defineArrayMember({
    type: 'block',
    styles: [
      { title: 'Paragraph', value: 'normal' },
      { title: 'Heading 2', value: 'h2' },
      { title: 'Heading 3', value: 'h3' },
      { title: 'Quote', value: 'blockquote' },
    ],
    lists: [
      { title: 'Bullet', value: 'bullet' },
      { title: 'Numbered', value: 'number' },
    ],
    marks: {
      decorators: [
        { title: 'Strong', value: 'strong' },
        { title: 'Emphasis', value: 'em' },
      ],
      annotations: [
        {
          name: 'link',
          type: 'object',
          title: 'Link',
          fields: [
            defineField({
              name: 'href',
              type: 'url',
              title: 'Link',
              validation: (Rule: AnyRule) => Rule.required().uri({ scheme: ['https', 'mailto', 'tel'], allowRelative: true }),
            }),
          ],
        },
      ],
    },
  }),
];

export const richTextField = (name: string, title: string, opts: { group?: string | null; description?: string; noStreetAddress?: boolean } = {}) =>
  defineField({
    name,
    title,
    type: 'array',
    // `group: null` is for fields inside object types (blocks, seo, media), which have no field groups of their own.
    group: opts.group === null ? undefined : (opts.group ?? 'content'),
    description: opts.description,
    of: richTextOf(),
    validation: (Rule: AnyRule) => [
      ...publicTextRules(Rule),
      ...(opts.noStreetAddress ? [Rule.custom((v: any) => validateNoStreetAddress(v))] : []),
      Rule.custom((v: any) => (extractPortableText(v).length > 20000 ? 'Too long' : true)),
    ],
  });

/** Plain string/text field with the standard public-text checks. */
export const textField = (
  name: string,
  title: string,
  opts: { type?: 'string' | 'text'; rows?: number; required?: boolean; max?: number; description?: string; noStreetAddress?: boolean; group?: string | null } = {},
) =>
  defineField({
    name,
    title,
    type: opts.type ?? 'string',
    // `group: null` is for fields inside object types (blocks, seo, media), which have no field groups of their own.
    group: opts.group === null ? undefined : (opts.group ?? 'content'),
    description: opts.description,
    rows: opts.type === 'text' ? (opts.rows ?? 3) : undefined,
    validation: (Rule: AnyRule) => [
      ...(opts.required ? [Rule.required()] : []),
      ...(opts.max ? [Rule.max(opts.max)] : []),
      ...publicTextRules(Rule),
      ...(opts.noStreetAddress ? [Rule.custom((v: any) => validateNoStreetAddress(v))] : []),
    ],
  });
