import type { DraftMeta } from './types';

/** Help-centre questions (docs/24). Draft: answers must be confirmed by AblePoint before approval. */
export interface HelpFaq extends DraftMeta {
  topic: 'Referrals' | 'Housing' | 'Money and agreements' | 'Privacy and safety';
  q: string;
  a: string;
}
const base = { reviewState: 'draft' as const, updatedAt: '2026-11-03T00:00:00Z' };
export const helpFaqs: HelpFaq[] = [
  { ...base, topic: 'Referrals', q: 'Who can make a referral?', a: 'A participant, a family member, a support coordinator, a plan manager or a health professional. If you are not the participant, we will check that they are happy for us to get in touch.', missingFacts: ['Confirm referral process'] },
  { ...base, topic: 'Referrals', q: 'Do I need to use AblePoint support coordination to access SIL or SDA?', a: 'No. Support coordination at AblePoint is separate from our accommodation and support services. If you would like other options, we will say so and help you find them.', missingFacts: ['Adopt the independence statement'] },
  { ...base, topic: 'Referrals', q: 'What happens after I send a referral?', a: 'We let you know we have it, and someone will get in touch to talk about what is needed. We will tell you honestly whether we can help, and what is available now or expected soon.', missingFacts: ['Add a committed response time'] },
  { ...base, topic: 'Housing', q: 'How do I find out about vacancies?', a: 'See the vacancies page, which shows when each home was last checked. If nothing suits, ask us what is expected to be available.', missingFacts: [] },
  { ...base, topic: 'Housing', q: 'What is the difference between SIL and SDA?', a: 'Supported independent living (SIL) is the support provided in a home. Specialist disability accommodation (SDA) is the housing itself, designed for people with very high support needs. Some people have one and some have both.', missingFacts: ['Compliance review of NDIS wording'] },
  { ...base, topic: 'Money and agreements', q: 'Will I get a written service agreement?', a: 'Yes. We give you the agreement before supports start, so you can read it in your own time and ask questions.', missingFacts: ['Confirm practice; attach a sample agreement'] },
  { ...base, topic: 'Money and agreements', q: 'What happens if I want to change or stop supports?', a: 'You can talk to us at any time. Your service agreement explains notice and cancellation, and we will go through it with you in plain language.', missingFacts: ['Add actual notice and cancellation terms'] },
  { ...base, topic: 'Privacy and safety', q: 'Do you need health information when I first contact you?', a: 'No. The first form asks only who you are and how to reach you. If we need health information, we ask for it later through a secure step.', missingFacts: [] },
  { ...base, topic: 'Privacy and safety', q: 'How do I make a complaint?', a: 'Tell us by phone or email, or use the feedback and complaints page. You can also contact the NDIS Quality and Safeguards Commission at any time.', missingFacts: ['Confirm the complaints process and contacts'] },
];
