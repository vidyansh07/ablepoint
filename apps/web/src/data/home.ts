import type { DraftMeta } from './types';

/** Home page blocks that make claims. Draft: hidden in production until the compliance reviewer approves (docs/24). */
export interface HomeBlocks extends DraftMeta {
  safety: { icon: string; tint: 'blue' | 'plum' | 'orange' | 'green'; title: string; text: string }[];
  funding: string[];
}

export const homeBlocks: HomeBlocks = {
  reviewState: 'draft',
  updatedAt: '2026-11-03T00:00:00Z',
  safety: [
    { icon: 'shield', tint: 'blue', title: 'Screened and trained support workers', text: 'Support workers complete an NDIS Worker Screening check, hold current first aid and CPR, and give two professional references.' },
    { icon: 'phone', tint: 'orange', title: 'A real person to talk to', text: 'Call us, or send a referral. You choose how we contact you back.' },
    { icon: 'family', tint: 'green', title: 'Your privacy comes first', text: 'We only ask for health details later, through a secure step, and only if we need them.' },
    { icon: 'info', tint: 'plum', title: 'Clear ways to give feedback', text: 'You can give feedback or make a complaint, and we will explain how it is handled.' },
  ],
  funding: ['Plan-managed participants', 'Self-managed participants', 'NDIA-managed participants'],
  missingFacts: [
    'Confirm worker screening, first aid/CPR and reference statements (carried from the current website)',
    'Confirm a real person answers the phone and the opening hours',
    'Confirm the complaints and feedback process described',
    'Confirm which funding-management types AblePoint works with',
  ],
};
