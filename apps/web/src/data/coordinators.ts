import type { DraftMeta } from './types';

/**
 * Referrer hub page content (docs/23-referrer-trust-checklist.md). DRAFT: every statement here is a proposal for the owner and
 * compliance reviewer to adopt or change. In particular the independence statement (support coordination vs SIL/SDA) is a policy
 * AblePoint must actually follow, and no response time is promised until the owner commits to one.
 */
export interface CoordinatorPage extends DraftMeta {
  steps: { title: string; text: string }[];
  need: string[];
  independence: string[];
  discharge: string[];
  safeguards: { text: string; carriedFromCurrentSite?: boolean }[];
}

export const coordinatorPage: CoordinatorPage = {
  reviewState: 'draft',
  updatedAt: '2026-11-03T00:00:00Z',
  steps: [
    { title: 'Send a referral or call us', text: 'Use the online form or phone us. You can refer on behalf of a participant, and the participant can also contact us directly.' },
    { title: 'We acknowledge it', text: 'You will get a message telling you we have it and who will be in touch. [Response time to be confirmed by AblePoint.]' },
    { title: 'We talk with you, and with the participant', text: 'We ask what the participant wants, what supports are needed, and where and when. The participant stays in charge of the conversation.' },
    { title: 'We tell you honestly what is possible', text: 'If we cannot help, we say so quickly and, where we can, point you to other options. If we can, we explain what is available now or expected soon.' },
    { title: 'We agree supports in writing', text: 'If it is a good fit, we agree the supports and the terms in a service agreement that the participant can read in their own time.' },
  ],
  need: [
    'Your name, organisation, phone and email',
    'How the participant would like to be contacted, and their preferred name',
    'The service and region you are asking about',
    'Funding type if you know it (for example SIL, SDA, short term accommodation, core support)',
    'How urgent it is, and any date that matters',
  ],
  independence: [
    'Support coordination at AblePoint is separate from our accommodation and support services.',
    'Nobody needs to use AblePoint support coordination to access SIL or SDA with us.',
    'If a participant would like other providers or an independent coordinator, we will say so and we will help them find options.',
  ],
  discharge: [
    'If someone is leaving hospital and needs somewhere to live, or short term accommodation, tell us the date and what is known.',
    'We will tell you what is possible and what we would need to know, so you can plan with the participant, their family and the hospital team.',
  ],
  safeguards: [
    { text: 'A clear complaints and feedback process that is easy to find and use.' },
    { text: 'NDIS Worker Screening check, current CPR and first aid, relevant experience, and two professional references for support workers.', carriedFromCurrentSite: true },
    { text: 'We ask for health information only when it is needed, and through a secure step. Please do not email health details.' },
    { text: 'Our registration details and how to check them on the NDIS Commission register (shown here once confirmed).' },
  ],
  missingFacts: [
    'NDIS registration number, registered support groups and audit status (and SIL registration status after the 2026 mandatory-registration change)',
    'A committed referral response time you can actually meet',
    'Adopt or change the independence statement (conflict of interest between support coordination and SIL/SDA)',
    'Named referral contact, phone and email',
    'Hospital and discharge process, if AblePoint offers one',
    'Confirm the worker screening and training statements',
  ],
};
