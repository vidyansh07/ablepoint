import { defineArrayMember, defineField, defineType } from 'sanity';
import { validateAnswerLength, validateHttpsUrl, validateNoStreetAddress } from '../validation';
import { pageBlocks } from './objects';
import { publicTextRules, richTextField, slugField, textField, withReview, type AnyRule } from './shared';

const faqRefs = (name = 'faqs') =>
  defineField({ name, title: 'FAQs', type: 'array', group: 'content', of: [{ type: 'reference', to: [{ type: 'faq' }] }] });

const stringList = (name: string, title: string, opts: { min?: number; description?: string } = {}) =>
  defineField({
    name,
    title,
    type: 'array',
    group: 'content',
    description: opts.description,
    of: [{ type: 'string' }],
    validation: (Rule: AnyRule) => [...(opts.min ? [Rule.min(opts.min)] : []), ...publicTextRules(Rule)],
  });

const seoField = () => defineField({ name: 'seo', title: 'SEO', type: 'seo', group: 'seo' });
const seoGroup = { name: 'seo', title: 'SEO' };

export const page = defineType(
  withReview({
    name: 'page',
    title: 'Page',
    type: 'document',
    groups: [seoGroup],
    fields: [
      textField('title', 'Title', { required: true, max: 90 }),
      slugField({ topLevel: true }),
      defineField({ name: 'template', title: 'Template', type: 'string', group: 'content', options: { list: [{ value: 'default', title: 'Standard' }, { value: 'wide', title: 'Wide' }], layout: 'radio' }, initialValue: 'default' }),
      defineField({ name: 'blocks', title: 'Sections', type: 'array', group: 'content', of: pageBlocks }),
      seoField(),
    ],
    preview: { select: { title: 'title', subtitle: 'reviewState' } },
  }),
);

export const service = defineType(
  withReview({
    name: 'service',
    title: 'Service',
    type: 'document',
    groups: [seoGroup],
    fields: [
      textField('title', 'Title', { required: true, max: 90 }),
      slugField({ topLevel: true }),
      textField('summary', 'Summary', { type: 'text', required: true, max: 300, description: 'One or two plain-English sentences.' }),
      textField('whoFor', 'Who it is for', { type: 'text', required: true, max: 400 }),
      stringList('provides', 'What AblePoint provides', { min: 1 }),
      stringList('process', 'How it works', { min: 2, description: 'Steps in order.' }),
      richTextField('fundingNote', 'Funding and eligibility note', { description: 'Compliance review required before approval (guardrail G-08).' }),
      faqRefs(),
      defineField({ name: 'related', title: 'Related services', type: 'array', group: 'content', of: [{ type: 'reference', to: [{ type: 'service' }] }] }),
      seoField(),
    ],
    preview: { select: { title: 'title', subtitle: 'reviewState' } },
  }),
);

export const region = defineType(
  withReview({
    name: 'region',
    title: 'Region',
    type: 'document',
    groups: [seoGroup],
    fields: [
      textField('name', 'Name', { required: true, max: 60 }),
      slugField({ source: 'name' }),
      textField('summary', 'Summary', { type: 'text', required: true, max: 300, noStreetAddress: true }),
      defineField({
        name: 'officeType',
        title: 'Presence',
        type: 'string',
        group: 'content',
        description: 'A region is a service area. Only mark "head office" or "staffed premises" when verified.',
        options: { list: [{ value: 'serviceArea', title: 'Service area only' }, { value: 'staffedPremises', title: 'Staffed premises' }, { value: 'headOffice', title: 'Head office' }], layout: 'radio' },
        initialValue: 'serviceArea',
      }),
      defineField({ name: 'isHeadOfficeRegion', title: 'Head office region', type: 'boolean', group: 'content', initialValue: false }),
      defineField({ name: 'suburbs', title: 'Suburbs and towns served', type: 'array', group: 'content', of: [{ type: 'string' }], description: 'Suburb or town names only.', validation: (Rule: AnyRule) => Rule.custom((v: any) => validateNoStreetAddress(v)) }),
      richTextField('narrative', 'Local information', { description: 'Verified local facts only. No street addresses.', noStreetAddress: true }),
      textField('localContactLabel', 'Local contact (role)', { max: 80, description: 'A role such as "Central Coast intake". Phone and email come from Site settings.' }),
      textField('staffCoverageNote', 'Staff coverage note', { type: 'text', max: 300, noStreetAddress: true }),
      faqRefs(),
      seoField(),
    ],
    preview: { select: { title: 'name', subtitle: 'officeType' } },
  }),
);

/** Which service is genuinely available in which region (docs/06 §2 #7). The site lists a service on a region page only from here. */
export const serviceCoverage = defineType(
  withReview({
    name: 'serviceCoverage',
    title: 'Service coverage',
    type: 'document',
    fields: [
      defineField({ name: 'service', title: 'Service', type: 'reference', group: 'content', to: [{ type: 'service' }], validation: (Rule: AnyRule) => Rule.required() }),
      defineField({ name: 'region', title: 'Region', type: 'reference', group: 'content', to: [{ type: 'region' }], validation: (Rule: AnyRule) => Rule.required() }),
      defineField({ name: 'available', title: 'Available now', type: 'boolean', group: 'content', initialValue: false }),
      textField('publicBlurb', 'Public text', { type: 'text', max: 300, noStreetAddress: true }),
      defineField({
        name: 'capacityNote',
        title: 'Capacity note (internal)',
        type: 'text',
        rows: 3,
        group: 'content',
        description: 'INTERNAL. Never queried by the site. Published documents in a public dataset can be read by anyone with the project ID: use a private dataset (Growth plan) before entering anything here.',
      }),
      defineField({ name: 'lastVerifiedAt', title: 'Last verified', type: 'datetime', group: 'content' }),
    ],
    preview: { select: { title: 'service.title', subtitle: 'region.name' } },
  }),
);

export const guide = defineType(
  withReview({
    name: 'guide',
    title: 'Guide',
    type: 'document',
    groups: [seoGroup],
    fields: [
      textField('title', 'Title', { required: true, max: 90 }),
      slugField(),
      defineField({
        name: 'answer',
        title: 'Answer-first summary',
        type: 'text',
        rows: 4,
        group: 'content',
        description: 'A direct answer in 40 to 60 words.',
        validation: (Rule: AnyRule) => [Rule.required(), Rule.custom((v: any) => validateAnswerLength(v)).warning(), ...publicTextRules(Rule)],
      }),
      defineField({
        name: 'sections',
        title: 'Sections',
        type: 'array',
        group: 'content',
        validation: (Rule: AnyRule) => Rule.min(1),
        of: [defineArrayMember({ type: 'object', name: 'guideSection', fields: [textField('heading', 'Heading', { required: true, max: 120, group: null }), richTextField('body', 'Body', { group: null })], preview: { select: { title: 'heading' } } })],
      }),
      defineField({
        name: 'sources',
        title: 'Sources',
        type: 'array',
        group: 'content',
        description: 'Authoritative sources (NDIS, NDIS Commission). At least one.',
        validation: (Rule: AnyRule) => Rule.required().min(1),
        of: [defineArrayMember({ type: 'object', name: 'source', fields: [textField('label', 'Label', { required: true, max: 120, group: null }), defineField({ name: 'url', title: 'Link', type: 'url', validation: (Rule: AnyRule) => Rule.required().custom((v: any) => validateHttpsUrl(v)) })], preview: { select: { title: 'label', subtitle: 'url' } } })],
      }),
      faqRefs(),
      defineField({ name: 'author', title: 'Author', type: 'reference', group: 'content', to: [{ type: 'author' }], validation: (Rule: AnyRule) => Rule.required() }),
      defineField({ name: 'reviewer', title: 'Reviewer', type: 'reference', group: 'content', to: [{ type: 'author' }], description: 'The NDIS-experienced person who fact-checked this guide. Required for approval.' }),
      defineField({ name: 'publishedAt', title: 'Original publication date', type: 'datetime', group: 'content', description: 'Keep the true original date. Never reset it to look recent; use "Last reviewed" instead.' }),
      seoField(),
    ],
    preview: { select: { title: 'title', subtitle: 'reviewState' } },
  }),
);

export const faq = defineType(
  withReview({
    name: 'faq',
    title: 'FAQ',
    type: 'document',
    fields: [
      textField('question', 'Question', { required: true, max: 160 }),
      textField('shortAnswer', 'Short answer', { type: 'text', required: true, max: 400 }),
      richTextField('longAnswer', 'Longer answer'),
      defineField({ name: 'topics', title: 'Topics', type: 'array', group: 'content', of: [{ type: 'string' }] }),
    ],
    preview: { select: { title: 'question', subtitle: 'reviewState' } },
  }),
);

export const legalPage = defineType(
  withReview({
    name: 'legalPage',
    title: 'Legal / policy page',
    type: 'document',
    fields: [
      textField('title', 'Title', { required: true, max: 90 }),
      slugField({ topLevel: true }),
      textField('description', 'Description', { type: 'text', required: true, max: 200 }),
      defineField({ name: 'version', title: 'Version', type: 'string', group: 'content', validation: (Rule: AnyRule) => Rule.required() }),
      defineField({ name: 'effectiveDate', title: 'Effective date', type: 'date', group: 'content' }),
      defineField({
        name: 'sections',
        title: 'Sections',
        type: 'array',
        group: 'content',
        of: [defineArrayMember({ type: 'object', name: 'legalSection', fields: [textField('heading', 'Heading', { required: true, max: 120, group: null }), richTextField('body', 'Body', { group: null })], preview: { select: { title: 'heading' } } })],
      }),
    ],
    preview: { select: { title: 'title', subtitle: 'version' } },
  }),
);

export const landingPage = defineType(
  withReview({
    name: 'landingPage',
    title: 'Campaign landing page',
    type: 'document',
    groups: [seoGroup],
    fields: [
      textField('title', 'Title', { required: true, max: 90 }),
      slugField(),
      defineField({ name: 'campaignKey', title: 'Campaign key', type: 'string', group: 'content', description: 'Lowercase key used in reporting, for example gads-sil-central-coast.', validation: (Rule: AnyRule) => Rule.required().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, { name: 'campaign key' }) }),
      defineField({ name: 'service', title: 'Service', type: 'reference', group: 'content', to: [{ type: 'service' }], validation: (Rule: AnyRule) => Rule.required() }),
      defineField({ name: 'region', title: 'Region', type: 'reference', group: 'content', to: [{ type: 'region' }], validation: (Rule: AnyRule) => Rule.required() }),
      textField('headline', 'Headline', { required: true, max: 90 }),
      richTextField('body', 'Body'),
      defineField({ name: 'cta', title: 'Main button', type: 'reference', group: 'content', to: [{ type: 'cta' }], validation: (Rule: AnyRule) => Rule.required() }),
      defineField({ name: 'conversionEvent', title: 'Conversion event', type: 'string', group: 'content', options: { list: ['phone_click', 'contact_submit', 'referral_submit', 'vacancy_enquiry'] }, validation: (Rule: AnyRule) => Rule.required() }),
      defineField({ name: 'noindex', title: 'Hide from search engines', type: 'boolean', group: 'seo', initialValue: true }),
      seoField(),
    ],
    preview: { select: { title: 'title', subtitle: 'campaignKey' } },
  }),
);

export const contentSchemas = [page, service, region, serviceCoverage, guide, faq, legalPage, landingPage];
