import type { LegalPage } from './types';

const base = { reviewState: 'draft' as const, updatedAt: '2026-11-03T00:00:00Z' };
const todo = 'This section must be written or approved by AblePoint’s compliance owner and a qualified adviser before publication.';

export const legalPages: LegalPage[] = [
  {
    ...base,
    slug: 'pricing-and-agreements',
    title: 'Pricing and service agreements',
    description: 'How AblePoint Australia prices supports and what to expect from a service agreement.',
    sections: [
      { heading: 'How we price', body: ['We charge in line with the NDIS Pricing Arrangements and Price Limits, and we do not charge participants more than others pay for the same support.'] },
      { heading: 'Your service agreement', body: ['You get a written service agreement before supports start. You can read it in your own time, ask us to explain it in plain language, and ask for it in another format such as Easy Read.'] },
      { heading: 'Changing or ending supports', body: ['Your agreement explains how you can change or end supports, and what notice applies. We will go through it with you before you sign.'] },
      { heading: 'Questions about money', body: ['Ask us before you agree to anything. We would rather you understand every cost than be surprised later.'] },
    ],
    missingFacts: ['Current price guide for each service', 'A sample service agreement', 'Actual notice and cancellation terms (check against unfair-contract-terms rules)', 'Compliance sign-off of the price-limit wording'],
  },
  {
    ...base,
    slug: 'privacy-policy',
    title: 'Privacy policy',
    description: 'How AblePoint Australia collects, uses, stores and discloses personal information.',
    sections: [
      { heading: 'What we collect and why', body: [todo] },
      { heading: 'Who can see your information', body: [todo] },
      { heading: 'Where your information is stored, including overseas disclosure', body: [todo] },
      { heading: 'How long we keep it', body: [todo] },
      { heading: 'Access, correction and deletion', body: [todo] },
      { heading: 'Making a privacy complaint', body: [todo] },
    ],
    missingFacts: ['Full policy text approved by compliance owner / privacy adviser', 'Named privacy officer and contact', 'Subprocessor and overseas-disclosure list'],
  },
  {
    ...base,
    slug: 'feedback-complaints',
    title: 'Feedback and complaints',
    description: 'How to give feedback or make a complaint to AblePoint Australia, and how to contact the NDIS Quality and Safeguards Commission.',
    sections: [
      { heading: 'Tell us what you think', body: [todo] },
      { heading: 'How we handle complaints', body: [todo] },
      { heading: 'Contacting the NDIS Commission', body: ['You can also contact the NDIS Quality and Safeguards Commission at ndiscommission.gov.au.'] },
    ],
    missingFacts: ['Approved complaints process and timeframes', 'Named complaints contact', 'Easy Read version'],
  },
  {
    ...base,
    slug: 'accessibility',
    title: 'Accessibility',
    description: 'AblePoint Australia’s commitment to an accessible website, and how to ask for information in another format.',
    sections: [
      { heading: 'Our aim', body: ['We aim to meet the Web Content Accessibility Guidelines (WCAG) 2.2 at level AA. We test with automated tools and by hand, using a keyboard and a screen reader.'] },
      { heading: 'Ask for another format', body: ['If you need information in another format, such as Easy Read, large print or audio, contact us and we will help.'] },
      { heading: 'Tell us about a problem', body: ['If something on this website is hard to use, please tell us so we can fix it.'] },
    ],
    missingFacts: ['Results of manual accessibility testing before the statement claims conformance', 'Named accessibility contact'],
  },
  {
    ...base,
    slug: 'easy-read',
    title: 'Easy Read',
    description: 'Easy Read information about AblePoint Australia.',
    sections: [{ heading: 'About AblePoint', body: ['Easy Read information about AblePoint.'] }],
    easyRead: [
      { icon: 'users', tint: 'blue', title: 'About AblePoint', lines: ['AblePoint Australia supports people with disability.', 'Our head office is in Gosford, New South Wales.'] },
      { icon: 'pin', tint: 'plum', title: 'Where we work', lines: ['We work in the Central Coast, Newcastle, Dubbo, Orange, Tamworth and Gunnedah.'] },
      { icon: 'phone', tint: 'orange', title: 'How to talk to us', lines: ['You can call us on 1300 088 549.', 'You can ask a family member or a support person to call for you.'] },
      { icon: 'referral', tint: 'green', title: 'You can send us a form', lines: ['Go to the referral page on this website.', 'Tell us your name and how to contact you.', 'We will get in touch with you.'] },
      { icon: 'shield', tint: 'blue', title: 'Your private information', lines: ['We will not ask for health information on the first form.', 'If we need it, we will ask in a safe way.'] },
      { icon: 'book', tint: 'plum', title: 'Other ways to get information', lines: ['You can ask us for information in other formats.'] },
    ],
    missingFacts: ['Confirm regions, phone and process wording', 'Easy Read illustrations (images, not only icons)', 'Review by people with intellectual disability before approval'],
  },
  {
    ...base,
    slug: 'about-us',
    title: 'About us',
    description: 'About AblePoint Australia, a registered NDIS provider based in Gosford, NSW.',
    sections: [
      { heading: 'Who we are', body: ['AblePoint Australia is an NDIS provider with its head office in Gosford, New South Wales.'] },
      { heading: 'Where we work', body: ['We work across the Central Coast, Newcastle, Dubbo, Orange, Tamworth and Gunnedah.'] },
    ],
    missingFacts: ['Organisation story, values, years operating (verifiable)', 'NDIS registration number and groups', 'CALD statistic source (roadmap cites 60% clients / 80% workers; verify before use)'],
  },
  {
    ...base,
    slug: 'our-support-team',
    title: 'Our support team',
    description: 'Meet the people who support participants at AblePoint Australia.',
    sections: [{ heading: 'Our team', body: ['Team profiles will be added with each person’s written consent.'] }],
    missingFacts: ['Approved team profiles with consent records'],
  },
];

export const getLegal = (slug: string) => legalPages.find((p) => p.slug === slug);
