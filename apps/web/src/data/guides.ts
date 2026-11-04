import type { Guide } from './types';

const base = {
  reviewState: 'draft' as const,
  updatedAt: '2026-11-03T00:00:00Z',
  author: 'AblePoint team (draft, reviewer to be named)',
};
const ndis = { label: 'NDIS: official information for participants', url: 'https://www.ndis.gov.au/participants' };
const commission = { label: 'NDIS Quality and Safeguards Commission', url: 'https://www.ndiscommission.gov.au/' };

export const guides: Guide[] = [
  {
    ...base,
    slug: 'changing-ndis-providers',
    title: 'How to change NDIS providers',
    answer:
      'You can choose and change your NDIS providers. Talk with your current provider about the notice in your service agreement, agree an end date, and arrange a handover so your supports continue without a gap.',
    sections: [
      { heading: 'Before you decide', body: ['Think about what is and is not working. Write down the supports you need to keep.', 'Check your service agreement for notice periods and any cancellation terms.'] },
      { heading: 'Making the change', body: ['Tell your current provider in writing when you plan to finish.', 'Agree a start date with the new provider so there is no gap in support.'] },
      { heading: 'If something goes wrong', body: ['You can raise a complaint with your provider or with the NDIS Quality and Safeguards Commission.'] },
    ],
    sources: [ndis, commission],
    faqs: [{ q: 'Can I change providers during my plan?', a: 'Generally yes. Check your service agreement for notice periods.' }],
    missingFacts: ['Named NDIS-experienced reviewer', 'Fact-check of notice and plan-management points against current NDIS guidance'],
  },
  {
    ...base,
    slug: 'sil-vs-sda',
    title: 'SIL and SDA: what is the difference?',
    answer:
      'SIL is the support provided in your home, such as help with personal care and daily tasks. SDA is the housing itself, designed for people with very high support needs. Some participants have SIL, some have SDA, and some have both.',
    sections: [
      { heading: 'Supported independent living (SIL)', body: ['SIL pays for support workers who help with day-to-day tasks at home.'] },
      { heading: 'Specialist disability accommodation (SDA)', body: ['SDA funding contributes to the cost of specially designed housing. It is separate from the support provided in the home.'] },
      { heading: 'How they fit together', body: ['A person can live in an SDA home and receive SIL support there, or receive SIL support in a home that is not SDA.'] },
    ],
    sources: [ndis],
    faqs: [{ q: 'Who decides if I get SDA or SIL?', a: 'The NDIA decides what funding is included in your plan. Your support coordinator can help you understand the process.' }],
    missingFacts: ['Named NDIS-experienced reviewer', 'Source citations to specific NDIS pages', 'Table comparing SIL and SDA (after fact-check)'],
  },
  {
    ...base,
    slug: 'short-term-accommodation-and-respite',
    title: 'How short term accommodation and respite work',
    answer:
      'Short term accommodation (STA) is a planned stay away from home with support. Respite is a break for you and your carers. Both can be funded by the NDIS if they are in your plan.',
    sections: [
      { heading: 'What it is for', body: ['A short break, a chance to try new things, or time for families and carers to rest.'] },
      { heading: 'Planning a stay', body: ['Contact the provider early, tell them the dates and your support needs, and ask what to bring.'] },
    ],
    sources: [ndis],
    faqs: [{ q: 'Is respite the same as short term accommodation?', a: 'They overlap. Check your plan to see how the funding is described.' }],
    missingFacts: ['Named NDIS-experienced reviewer', 'Fact-check of funding categories against current NDIS guidance'],
  },
  {
    ...base,
    slug: 'what-support-coordination-does',
    title: 'What does a support coordinator do?',
    answer:
      'A support coordinator helps you understand your NDIS plan, find providers, set up your supports and keep them working. They do not deliver your day-to-day supports.',
    sections: [
      { heading: 'What they help with', body: ['Understanding your plan, choosing providers, setting up service agreements, and preparing for plan review.'] },
      { heading: 'Choosing one', body: ['Ask how they work, whether they also provide other services, and how they manage conflicts of interest.'] },
    ],
    sources: [ndis],
    faqs: [{ q: 'Do I need support coordination funding?', a: 'You need it in your plan to use a support coordinator. Ask the NDIA or your planner if you are unsure.' }],
    missingFacts: ['Named NDIS-experienced reviewer', 'Conflict-of-interest wording agreed by compliance'],
  },
];

export const getGuide = (slug: string) => guides.find((g) => g.slug === slug);
