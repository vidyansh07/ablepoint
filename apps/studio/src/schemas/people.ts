import { defineField, defineType } from 'sanity';
import { validateAttribution, validateConsentRef, validateHttpsUrl, validateOutcomeClaim, validateTestimonialQuote } from '../validation';
import { publicTextRules, slugField, textField, withReview, type AnyRule } from './shared';

const consentRef = (description: string) =>
  defineField({
    name: 'consentRef',
    title: 'Consent record reference',
    type: 'string',
    group: 'content',
    description,
    validation: (Rule: AnyRule) => Rule.required().custom((v: any) => validateConsentRef(v as string | undefined)),
  });

export const author = defineType(
  withReview({
    name: 'author',
    title: 'Author / reviewer',
    type: 'document',
    fields: [
      textField('name', 'Name', { required: true, max: 80 }),
      slugField({ source: 'name' }),
      textField('credentials', 'Role or credentials', { max: 160 }),
      textField('bio', 'Short bio', { type: 'text', max: 500 }),
      defineField({ name: 'sameAs', title: 'Profile links', type: 'array', group: 'content', of: [{ type: 'url' }], validation: (Rule: AnyRule) => Rule.custom((v: any) => (Array.isArray(v) ? (v.map((u) => validateHttpsUrl(u as string)).find((r) => r !== true) ?? true) : true)) }),
      consentRef('Written consent to be named publicly, held outside the CMS.'),
    ],
    preview: { select: { title: 'name', subtitle: 'credentials' } },
  }),
);

export const teamMember = defineType(
  withReview({
    name: 'teamMember',
    title: 'Team member',
    type: 'document',
    fields: [
      textField('name', 'Name', { required: true, max: 80 }),
      slugField({ source: 'name' }),
      textField('role', 'Role', { required: true, max: 80 }),
      textField('bio', 'Short bio', { type: 'text', max: 500 }),
      defineField({ name: 'photo', title: 'Photo', type: 'mediaAsset', group: 'content' }),
      consentRef('Written consent to publish this profile and photo, held outside the CMS. Required.'),
      defineField({ name: 'visible', title: 'Show on the site', type: 'boolean', group: 'content', initialValue: false }),
    ],
    preview: { select: { title: 'name', subtitle: 'role', media: 'photo.image' } },
  }),
);

export const testimonial = defineType(
  withReview({
    name: 'testimonial',
    title: 'Testimonial',
    type: 'document',
    fields: [
      defineField({
        name: 'quote',
        title: 'Quote',
        type: 'text',
        rows: 4,
        group: 'content',
        validation: (Rule: AnyRule) => [Rule.required().max(400), Rule.custom((v: any) => validateTestimonialQuote(v)), ...publicTextRules(Rule)],
      }),
      defineField({
        name: 'attribution',
        title: 'Attribution',
        type: 'string',
        group: 'content',
        description: 'First name or initials only, for example "Sam T."',
        validation: (Rule: AnyRule) => Rule.required().custom((v: any) => validateAttribution(v as string | undefined)),
      }),
      defineField({ name: 'service', title: 'Service', type: 'reference', group: 'content', to: [{ type: 'service' }] }),
      consentRef('Written consent to publish this quote, held outside the CMS. Required (guardrail G-04).'),
      defineField({
        name: 'outcomeClaim',
        title: 'Claims an outcome or eligibility result',
        type: 'boolean',
        group: 'content',
        description: 'Must be "No". Testimonials never imply funding, eligibility or outcomes (G-04).',
        initialValue: false,
        validation: (Rule: AnyRule) => Rule.custom((v: any) => validateOutcomeClaim(v as boolean | undefined)),
      }),
    ],
    preview: { select: { title: 'attribution', subtitle: 'quote' } },
  }),
);

export const peopleSchemas = [author, teamMember, testimonial];
