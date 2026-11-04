import { defineArrayMember, defineField, defineType } from 'sanity';
import {
  validateAbn,
  validateEmail,
  validateHttpsUrl,
  validateInternalPath,
  validatePhoneDisplay,
  validatePhoneHref,
  validateRedirectFrom,
  validateRedirectTo,
  validateRegistration,
} from '../validation';
import { publicTextRules, richTextField, slugField, textField, withReview, type AnyRule } from './shared';

/** Singleton. The ONLY place phone, email and registration details are entered (docs/06). No street address field by design. */
export const siteSettings = defineType(
  withReview({
    name: 'siteSettings',
    title: 'Site settings',
    type: 'document',
    fields: [
      textField('legalName', 'Legal name', { required: true, max: 120 }),
      textField('tradingName', 'Trading name', { required: true, max: 120 }),
      defineField({ name: 'abn', title: 'ABN', type: 'string', group: 'content', validation: (Rule: AnyRule) => Rule.custom((v: any) => validateAbn(v as string | undefined)) }),
      defineField({
        name: 'ndisRegistrationNumber',
        title: 'NDIS registration number',
        type: 'string',
        group: 'content',
        description: 'Leave blank until verified on the NDIS Commission register. The site shows it only when set.',
        validation: (Rule: AnyRule) => Rule.custom((v: any, context: any) => validateRegistration(v as string | undefined, (context.document as { registrationSourceUrl?: string } | undefined)?.registrationSourceUrl)),
      }),
      defineField({ name: 'registrationSourceUrl', title: 'Registration source link', type: 'url', group: 'content', validation: (Rule: AnyRule) => Rule.custom((v: any) => validateHttpsUrl(v as string | undefined)) }),
      defineField({ name: 'registeredGroups', title: 'Registered support groups', type: 'array', group: 'content', of: [{ type: 'string' }] }),
      textField('headOfficeLocality', 'Head office locality', { required: true, max: 80, description: 'Locality only, for example "Gosford, New South Wales". No street address until the owner approves one.' }),
      defineField({ name: 'phoneDisplay', title: 'Main phone (as shown)', type: 'string', group: 'content', validation: (Rule: AnyRule) => Rule.required().custom((v: any) => validatePhoneDisplay(v as string | undefined)) }),
      defineField({ name: 'phoneHref', title: 'Main phone link', type: 'string', group: 'content', description: 'For example tel:1300088549', validation: (Rule: AnyRule) => Rule.required().custom((v: any) => validatePhoneHref(v as string | undefined)) }),
      defineField({ name: 'email', title: 'Main email', type: 'string', group: 'content', validation: (Rule: AnyRule) => Rule.required().custom((v: any) => validateEmail(v as string | undefined)) }),
      defineField({
        name: 'hours',
        title: 'Hours',
        type: 'array',
        group: 'content',
        of: [defineArrayMember({ type: 'object', name: 'hoursRow', fields: [textField('days', 'Days', { required: true, max: 40, group: null }), textField('times', 'Times', { required: true, max: 40, group: null })], preview: { select: { title: 'days', subtitle: 'times' } } })],
      }),
      defineField({
        name: 'socialLinks',
        title: 'Social links',
        type: 'array',
        group: 'content',
        description: 'Only profiles that exist. They become schema.org sameAs links.',
        of: [defineArrayMember({ type: 'object', name: 'socialLink', fields: [textField('platform', 'Platform', { required: true, max: 30, group: null }), defineField({ name: 'url', title: 'Link', type: 'url', validation: (Rule: AnyRule) => Rule.required().custom((v: any) => validateHttpsUrl(v as string | undefined)) })], preview: { select: { title: 'platform', subtitle: 'url' } } })],
      }),
      defineField({ name: 'defaultOgImage', title: 'Default sharing image', type: 'mediaAsset', group: 'content' }),
    ],
  }),
);

export const navigation = defineType(
  withReview({
    name: 'navigation',
    title: 'Navigation',
    type: 'document',
    fields: [defineField({ name: 'items', title: 'Main navigation', type: 'array', group: 'content', of: [{ type: 'navItem' }], validation: (Rule: AnyRule) => Rule.min(1).max(8) })],
  }),
);

export const footer = defineType(
  withReview({
    name: 'footer',
    title: 'Footer',
    type: 'document',
    fields: [
      defineField({
        name: 'linkGroups',
        title: 'Link groups',
        type: 'array',
        group: 'content',
        of: [defineArrayMember({ type: 'object', name: 'linkGroup', fields: [textField('title', 'Group title', { required: true, max: 40, group: null }), defineField({ name: 'links', title: 'Links', type: 'array', of: [{ type: 'navItem' }], validation: (Rule: AnyRule) => Rule.min(1) })], preview: { select: { title: 'title' } } })],
      }),
      defineField({ name: 'legalLinks', title: 'Legal links', type: 'array', group: 'content', of: [{ type: 'reference', to: [{ type: 'legalPage' }] }], description: 'Privacy, complaints, accessibility, Easy Read.' }),
      textField('acknowledgement', 'Acknowledgement of Country', { type: 'text', max: 400, description: 'Wording must be confirmed by AblePoint.' }),
    ],
  }),
);

export const cta = defineType(
  withReview({
    name: 'cta',
    title: 'Call to action',
    type: 'document',
    fields: [
      textField('label', 'Button label', { required: true, max: 40 }),
      defineField({ name: 'type', title: 'Type', type: 'string', group: 'content', options: { list: [{ value: 'call', title: 'Call' }, { value: 'referral', title: 'Make a referral' }, { value: 'enquire', title: 'Enquire' }], layout: 'radio' }, validation: (Rule: AnyRule) => Rule.required() }),
      defineField({ name: 'target', title: 'Path (not needed for Call)', type: 'string', group: 'content', description: 'For example /referral/. The phone number for Call comes from Site settings.', validation: (Rule: AnyRule) => Rule.custom((v: any) => validateInternalPath(v as string | undefined)) }),
      defineField({
        name: 'trackingId',
        title: 'Tracking ID',
        type: 'string',
        group: 'content',
        description: 'Analytics event name, for example phone_click or referral_cta. No personal data.',
        validation: (Rule: AnyRule) => Rule.required().regex(/^[a-z][a-z0-9_]{2,39}$/, { name: 'tracking id', invert: false }),
      }),
    ],
    preview: { select: { title: 'label', subtitle: 'type' } },
  }),
);

export const redirect = defineType(
  withReview({
    name: 'redirect',
    title: 'Redirect',
    type: 'document',
    fields: [
      defineField({ name: 'from', title: 'Old path', type: 'string', group: 'content', validation: (Rule: AnyRule) => Rule.required().custom((v: any) => validateRedirectFrom(v as string | undefined)) }),
      defineField({
        name: 'to',
        title: 'New path',
        type: 'string',
        group: 'content',
        validation: (Rule: AnyRule) => Rule.custom((v: any, context: any) => validateRedirectTo(v as string | undefined, (context.document as { from?: string } | undefined)?.from, (context.document as { status?: number } | undefined)?.status)),
      }),
      defineField({ name: 'status', title: 'Status', type: 'number', group: 'content', options: { list: [{ value: 301, title: '301 Permanent' }, { value: 302, title: '302 Temporary' }, { value: 308, title: '308 Permanent (keep method)' }, { value: 410, title: '410 Gone' }] }, initialValue: 301, validation: (Rule: AnyRule) => Rule.required() }),
      textField('reason', 'Reason', { required: true, max: 200 }),
    ],
    preview: { select: { title: 'from', subtitle: 'to' } },
  }),
);

export { richTextField, slugField, publicTextRules };
