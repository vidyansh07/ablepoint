import type { Service } from './types';

const base = { reviewState: 'draft' as const, updatedAt: '2026-11-03T00:00:00Z' };

export const services: Service[] = [
  {
    ...base,
    slug: 'core-support',
    icon: 'hand-heart',
    tint: 'blue',
    title: 'Core support',
    summary:
      'Help with everyday activities, so people with disability can live as independently as they choose.',
    whoFor: 'NDIS participants who have core supports funding in their plan, and the families and coordinators who support them.',
    provides: [
      'Personal care and daily living support',
      'Help with household tasks and meals',
      'Support to take part in everyday activities',
    ],
    process: ['Contact us', 'We talk about what matters to you', 'We agree the support and how it will be delivered', 'Support starts and we check in regularly'],
    faqs: [
      { q: 'Do I need a support coordinator to start?', a: 'No. You can contact us directly. If you have a support coordinator, we are happy to work with them.' },
    ],
    related: ['support-coordinator', 'community-access'],
    missingFacts: ['Registered support groups covering core supports', 'Regions where core support is currently available', 'Reviewed funding wording (compliance)'],
  },
  {
    ...base,
    slug: 'supported-independent-living',
    icon: 'home',
    tint: 'plum',
    title: 'Supported independent living (SIL)',
    summary:
      'Supported independent living is help with day-to-day tasks for people who live in a shared or individual home, so they can build skills and live as independently as possible.',
    whoFor: 'NDIS participants whose plan includes supported independent living funding, and the families and coordinators helping them find a home.',
    provides: [
      'Support with personal care, meals and household routines at home',
      'Help to build skills and independence',
      'Support to stay connected with family, friends and community',
    ],
    process: ['Enquire about a vacancy or ask us a question', 'Meet us and, where possible, visit the home', 'Talk through support needs and housemates', 'Agree a service agreement and a start date'],
    faqs: [
      { q: 'What is the difference between SIL and SDA?', a: 'SIL is the support provided in the home. Specialist disability accommodation (SDA) is the housing itself. Some people have one, some have both. See our guide for more detail.' },
      { q: 'Can I visit a house first?', a: 'Where a vacancy is available we aim to arrange a visit so you can meet us and see the home before you decide.' },
    ],
    related: ['sda', 'short-term-accommodation'],
    missingFacts: ['Current vacancies and property photos (approved)', 'Regions with SIL homes', 'Plain-English funding explainer (compliance review)', 'What a house visit involves'],
  },
  {
    ...base,
    slug: 'sda',
    icon: 'building',
    tint: 'orange',
    title: 'Specialist disability accommodation (SDA)',
    summary:
      'Specialist disability accommodation is housing designed for people with very high support needs or extreme functional impairment. It is the home itself, not the support provided in it.',
    whoFor: 'NDIS participants who have SDA funding approved in their plan, and the people helping them look for suitable housing.',
    provides: ['Information about available SDA homes', 'Help to understand how SDA and SIL fit together', 'Support to arrange a viewing'],
    process: ['Ask us about available homes', 'Check the home suits your needs', 'Arrange a viewing', 'Agree next steps with you and your support team'],
    faqs: [
      { q: 'Does my plan include SDA funding?', a: 'SDA funding is decided by the NDIA. Your plan or your support coordinator can tell you if SDA is included.' },
    ],
    related: ['supported-independent-living'],
    missingFacts: ['Whether AblePoint is the SDA provider, a tenant-support provider, or both', 'Current SDA properties (approved)', 'SDA registration details if applicable'],
  },
  {
    ...base,
    slug: 'short-term-accommodation',
    icon: 'bed',
    tint: 'green',
    title: 'Short term accommodation',
    summary: 'Short term accommodation, including respite, gives a planned break for participants and their families in a safe, supported setting.',
    whoFor: 'NDIS participants with short term accommodation funding in their plan, and their families and carers.',
    provides: ['Planned stays with support', 'A chance for families and carers to have a break', 'Time to try new activities and meet new people'],
    process: ['Contact us with the dates you need', 'We check availability and talk through support needs', 'We confirm the stay and what to bring'],
    faqs: [{ q: 'How far ahead should I book?', a: 'As early as you can. Availability varies, so contact us to check dates.' }],
    related: ['supported-independent-living'],
    missingFacts: ['Locations offering short term accommodation (existing site mentions Newcastle)', 'Booking process and notice period', 'Reviewed funding wording'],
  },
  {
    ...base,
    slug: 'support-coordinator',
    icon: 'compass',
    tint: 'blue',
    title: 'Support coordination',
    summary: 'A support coordinator helps you understand your NDIS plan, choose providers and put your supports in place.',
    whoFor: 'NDIS participants who have support coordination funding, and families who want help navigating the NDIS.',
    provides: ['Help to understand and use your plan', 'Help to find and connect with providers', 'Support to review how your plan is going'],
    process: ['Contact us', 'We talk about your goals and plan', 'We help you connect with the right supports', 'We check in and help at plan review'],
    faqs: [{ q: 'Can I change my support coordinator?', a: 'Yes. You can choose who supports you. Contact us if you would like to talk about working together.' }],
    related: ['core-support'],
    missingFacts: ['Regions where support coordination is offered', 'Independence of coordination vs other services (conflict-of-interest wording, compliance)'],
  },
  {
    ...base,
    slug: 'community-access',
    icon: 'users',
    tint: 'plum',
    title: 'Community access',
    summary: 'Support to take part in community, social and recreational activities and to build connections.',
    whoFor: 'NDIS participants who want support to get out and about, join activities and meet people.',
    provides: ['Support to attend activities and events', 'Help to try new hobbies and interests', 'Support to build social connections'],
    process: ['Tell us what you enjoy or want to try', 'We plan activities with you', 'We support you to take part'],
    faqs: [{ q: 'Can I choose the activities?', a: 'Yes. Activities are chosen with you, based on your goals and interests.' }],
    related: ['core-support'],
    missingFacts: ['Regions and activity types actually offered', 'Group vs one-to-one availability'],
  },
];

export const getService = (slug: string) => services.find((s) => s.slug === slug);
