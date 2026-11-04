import { defineArrayMember, defineField, defineType } from 'sanity';
import { CONSENT_STATUSES, RIGHTS_STATUSES, validateAlt, validateHttpsUrl, validateImageConsent, validateInternalPath, validateRights } from '../validation';
import { publicTextRules, richTextField as richTextFieldInDocument, textField as textFieldInDocument, type AnyRule } from './shared';

// Object types (blocks) have no field groups, so their fields must not name one (Sanity rejects an undefined group).
const textField = (name: string, title: string, opts: NonNullable<Parameters<typeof textFieldInDocument>[2]> = {}) => textFieldInDocument(name, title, { ...opts, group: null });
const richTextField = (name: string, title: string, opts: NonNullable<Parameters<typeof richTextFieldInDocument>[2]> = {}) => richTextFieldInDocument(name, title, { ...opts, group: null });

/** SEO metadata (docs/06 `seo`). No keywords field: the meta keywords tag is not used (W-12). */
export const seo = defineType({
  name: 'seo',
  title: 'SEO',
  type: 'object',
  fields: [
    defineField({ name: 'title', title: 'Page title', type: 'string', description: 'Up to 60 characters. Leave blank to use the page title.', validation: (Rule: AnyRule) => [Rule.max(70).warning('Titles over about 60 characters get cut off in search results'), ...publicTextRules(Rule)] }),
    defineField({ name: 'description', title: 'Meta description', type: 'text', rows: 3, description: 'Up to 155 characters.', validation: (Rule: AnyRule) => [Rule.max(200).warning('Descriptions over about 155 characters get cut off'), ...publicTextRules(Rule)] }),
    defineField({ name: 'canonicalOverride', title: 'Canonical path override', type: 'string', description: 'Only for duplicate content. Starts with "/".', validation: (Rule: AnyRule) => Rule.custom((v: any) => validateInternalPath(v as string | undefined)) }),
    defineField({ name: 'noindex', title: 'Hide from search engines', type: 'boolean', initialValue: false }),
    defineField({ name: 'ogImage', title: 'Social sharing image', type: 'mediaAsset' }),
  ],
});

/** Image plus the metadata the site requires (docs/06 §2 #15, docs/07 §4 media register). */
export const mediaAsset = defineType({
  name: 'mediaAsset',
  title: 'Image',
  type: 'object',
  fields: [
    defineField({ name: 'image', title: 'Image', type: 'image', options: { hotspot: true }, validation: (Rule: AnyRule) => Rule.required() }),
    defineField({ name: 'decorative', title: 'Decorative (no alt text needed)', type: 'boolean', initialValue: false }),
    defineField({
      name: 'alt',
      title: 'Alt text',
      type: 'string',
      description: 'Describe what the image shows for someone who cannot see it.',
      validation: (Rule: AnyRule) => Rule.custom((value: any, context: any) => validateAlt(value as string | undefined, (context.parent as { decorative?: boolean } | undefined)?.decorative)),
    }),
    defineField({ name: 'caption', title: 'Caption', type: 'string', validation: (Rule: AnyRule) => publicTextRules(Rule) }),
    defineField({ name: 'credit', title: 'Credit', type: 'string' }),
    defineField({
      name: 'rightsStatus',
      title: 'Rights',
      type: 'string',
      options: { list: RIGHTS_STATUSES.map((v) => ({ value: v, title: v[0]!.toUpperCase() + v.slice(1) })), layout: 'radio' },
      initialValue: 'unknown',
      validation: (Rule: AnyRule) => Rule.custom((v: any) => validateRights(v as string | undefined)),
    }),
    defineField({ name: 'source', title: 'Source or licence reference', type: 'string' }),
    defineField({ name: 'showsPeople', title: 'Shows identifiable people', type: 'boolean', initialValue: false }),
    defineField({
      name: 'consentStatus',
      title: 'Consent for people shown',
      type: 'string',
      options: { list: CONSENT_STATUSES.map((v) => ({ value: v, title: v === 'notApplicable' ? 'Not applicable' : v[0]!.toUpperCase() + v.slice(1) })), layout: 'radio' },
      initialValue: 'notApplicable',
      hidden: ({ parent }) => !(parent as { showsPeople?: boolean } | undefined)?.showsPeople,
      validation: (Rule: AnyRule) => Rule.custom((v: any, context: any) => validateImageConsent((context.parent as { showsPeople?: boolean } | undefined)?.showsPeople, v as string | undefined)),
    }),
  ],
  preview: { select: { title: 'alt', media: 'image' } },
});

/** A link to either a page on this site or an external https URL (exactly one). */
export const navItem = defineType({
  name: 'navItem',
  title: 'Link',
  type: 'object',
  fields: [
    defineField({ name: 'label', title: 'Label', type: 'string', validation: (Rule: AnyRule) => [Rule.required().max(40), ...publicTextRules(Rule)] }),
    defineField({
      name: 'internalRef',
      title: 'Page on this site',
      type: 'reference',
      to: [{ type: 'page' }, { type: 'service' }, { type: 'region' }, { type: 'guide' }, { type: 'legalPage' }],
    }),
    defineField({ name: 'externalUrl', title: 'External link', type: 'url', validation: (Rule: AnyRule) => Rule.custom((v: any) => validateHttpsUrl(v as string | undefined)) }),
  ],
  validation: (Rule: AnyRule) =>
    Rule.custom((value: any) => {
      const v = value as { internalRef?: unknown; externalUrl?: string } | undefined;
      const n = [v?.internalRef, v?.externalUrl].filter(Boolean).length;
      return n === 1 ? true : 'Choose either a page on this site or an external link, not both and not neither';
    }),
  preview: { select: { title: 'label' } },
});

// ---- Page builder blocks ----

export const heroBlock = defineType({
  name: 'heroBlock',
  title: 'Hero',
  type: 'object',
  fields: [
    textField('eyebrow', 'Eyebrow', { max: 60 }),
    textField('title', 'Heading (this is the page H1)', { required: true, max: 90 }),
    textField('lede', 'Introduction', { type: 'text', max: 240 }),
    defineField({ name: 'cta', title: 'Button', type: 'reference', to: [{ type: 'cta' }] }),
  ],
  preview: { select: { title: 'title' } },
});

export const richTextBlock = defineType({
  name: 'richTextBlock',
  title: 'Text',
  type: 'object',
  fields: [richTextField('content', 'Content')],
  preview: { prepare: () => ({ title: 'Text' }) },
});

export const cardGridBlock = defineType({
  name: 'cardGridBlock',
  title: 'Card grid',
  type: 'object',
  fields: [
    textField('heading', 'Heading', { max: 80 }),
    defineField({
      name: 'cards',
      title: 'Cards',
      type: 'array',
      validation: (Rule: AnyRule) => Rule.min(1).max(12),
      of: [
        defineArrayMember({
          type: 'object',
          name: 'card',
          fields: [textField('title', 'Title', { required: true, max: 80 }), textField('text', 'Text', { type: 'text', max: 240 }), defineField({ name: 'link', title: 'Link', type: 'navItem' })],
          preview: { select: { title: 'title' } },
        }),
      ],
    }),
  ],
  preview: { select: { title: 'heading' } },
});

export const ctaBlock = defineType({
  name: 'ctaBlock',
  title: 'Call to action',
  type: 'object',
  fields: [
    textField('heading', 'Heading', { max: 80 }),
    textField('text', 'Text', { type: 'text', max: 240 }),
    defineField({ name: 'cta', title: 'Button', type: 'reference', to: [{ type: 'cta' }], validation: (Rule: AnyRule) => Rule.required() }),
  ],
  preview: { select: { title: 'heading' } },
});

export const faqBlock = defineType({
  name: 'faqBlock',
  title: 'FAQ',
  type: 'object',
  fields: [
    textField('heading', 'Heading', { max: 80 }),
    defineField({ name: 'faqs', title: 'Questions', type: 'array', of: [{ type: 'reference', to: [{ type: 'faq' }] }], validation: (Rule: AnyRule) => Rule.min(1) }),
  ],
  preview: { select: { title: 'heading' } },
});

export const processStepsBlock = defineType({
  name: 'processStepsBlock',
  title: 'Process steps',
  type: 'object',
  fields: [
    textField('heading', 'Heading', { max: 80 }),
    defineField({ name: 'steps', title: 'Steps', type: 'array', of: [{ type: 'string' }], validation: (Rule: AnyRule) => [Rule.min(2).max(8), ...publicTextRules(Rule)] }),
  ],
  preview: { select: { title: 'heading' } },
});

/** Renders verified facts from Site settings only. Has no free text, so it cannot invent claims. */
export const trustStripBlock = defineType({
  name: 'trustStripBlock',
  title: 'Trust strip (from Site settings)',
  type: 'object',
  fields: [defineField({ name: 'enabled', title: 'Show', type: 'boolean', initialValue: true })],
  preview: { prepare: () => ({ title: 'Trust strip' }) },
});

export const mediaTextBlock = defineType({
  name: 'mediaTextBlock',
  title: 'Image and text',
  type: 'object',
  fields: [
    defineField({ name: 'media', title: 'Image', type: 'mediaAsset', validation: (Rule: AnyRule) => Rule.required() }),
    richTextField('body', 'Text'),
    defineField({ name: 'mediaSide', title: 'Image side', type: 'string', options: { list: ['left', 'right'], layout: 'radio' }, initialValue: 'right' }),
  ],
  preview: { select: { title: 'media.alt', media: 'media.image' } },
});

export const pageBlocks = [
  { type: 'heroBlock' },
  { type: 'richTextBlock' },
  { type: 'cardGridBlock' },
  { type: 'ctaBlock' },
  { type: 'faqBlock' },
  { type: 'processStepsBlock' },
  { type: 'trustStripBlock' },
  { type: 'mediaTextBlock' },
].map((m) => defineArrayMember(m));

export const objectSchemas = [seo, mediaAsset, navItem, heroBlock, richTextBlock, cardGridBlock, ctaBlock, faqBlock, processStepsBlock, trustStripBlock, mediaTextBlock];
