import { describe, expect, it } from 'vitest';
import { assessDraft, blogDraftSchema, draftText, fleschKincaidGrade, similarity, type BlogDraft } from '../index';

// Distinct plain-English sentences so fixtures read like real content and pass the reading-level gate.
const S = [
  'A support coordinator helps a participant turn a plan into real supports.',
  'Start by asking the participant what a good week looks like for them.',
  'Write down the goals in the plan and match each goal to a kind of support.',
  'Ask each provider how quickly they can reply to a referral and who will reply.',
  'Check the public register to confirm that the provider is registered for the supports you need.',
  'Look for a clear complaints process that is easy to find and easy to use.',
  'Ask how the provider screens and trains the workers who will visit the home.',
  'A good provider explains the service agreement in plain language and gives time to read it.',
  'Choice and control stay with the participant at every step of the process.',
  'Visit the home in person if you can, and bring the participant if they would like to come.',
  'Note how the staff talk to the people who already live there.',
  'Ask what happens when a worker is sick or a shift cannot be filled.',
  'Find out how the provider handles incidents and how it tells families and coordinators.',
  'Compare the written agreement with what you were told during the visit.',
  'Keep a simple record of each call, including the date, the name and the answer.',
  'Follow up in writing so that nothing depends on memory alone.',
  'Respect the participant when they decide a house is not the right fit.',
  'Share what you learn with the participant in a format that suits them.',
  'Review the arrangement after the first few weeks and make changes if needed.',
  'Tell the provider quickly when something is not working so it can be fixed.',
  'Every region has different services, so local knowledge matters a great deal.',
  'Some homes have space for a person who uses a wheelchair and some do not.',
  'Ask about step-free entry, wide doorways, bathrooms and the way the kitchen is laid out.',
  'Ask whether a support worker will be on site overnight or on call.',
  'Confirm who pays for which costs before anyone signs an agreement.',
  'Funding decisions belong to the NDIA, so describe options and avoid promising outcomes.',
  'Use the official NDIS pages for current rules, because rules can change.',
  'Talk with other coordinators about which providers answer questions honestly.',
  'Keep the focus on the person and what they want their life to look like.',
  'A short, clear referral form saves everyone time and reduces mistakes.',
  'Give providers the information they need and nothing more than they need.',
  'Never send health details by ordinary email if a secure option exists.',
  'Ask providers how they keep personal information private and where they store it.',
  'Look for providers who tell you plainly when they cannot help.',
  'That honesty saves time for the participant and for the coordinator.',
  'Plan for the move itself, including transport, belongings and who will be there on the day.',
  'Check that the home feels welcoming and that the person has a say in their room.',
  'Agree how family and friends can visit and stay in touch.',
  'Ask what the first month will look like, day by day.',
  'Write down the questions that are still open and who will answer them.',
];
const para = (i: number) => S.slice(i, i + 5).join(' ');
export const goodDraft = (over: Partial<BlogDraft> = {}): BlogDraft => ({
  slug: 'checklist-for-choosing-a-sil-provider',
  kind: 'post',
  title: 'A practical checklist for choosing a SIL provider',
  summary: 'A plain-English checklist support coordinators can use when comparing supported independent living providers in regional NSW.',
  answer: 'Choose a supported independent living provider by checking registration, asking how quickly they respond, visiting the home, reading the service agreement and keeping the participant in charge of every decision. Use the official NDIS pages for current rules.',
  category: 'for-coordinators',
  tags: ['sil', 'coordinators'],
  regions: [],
  services: ['supported-independent-living'],
  sections: [
    { heading: 'Start with the participant', body: [para(0), para(5), para(10)] },
    { heading: 'Check the provider', body: [para(3), para(8), para(13), para(18)] },
    { heading: 'Visit the home', body: [para(9), para(21), para(22), para(26)] },
    { heading: 'Read the agreement and follow up', body: [para(7), para(14), para(16), para(25)] },
    { heading: 'Plan the move and review it', body: [para(31), para(33), para(34), para(36)] },
  ],
  faqs: [{ q: 'Who decides which provider a participant uses?', a: 'The participant decides. A coordinator gives information and support, and a provider explains what it can offer, but choice and control stay with the participant.' }],
  sources: [
    { label: 'NDIS: Supported independent living', url: 'https://www.ndis.gov.au/participants/home-and-living' },
    { label: 'NDIS Quality and Safeguards Commission: provider register', url: 'https://www.ndiscommission.gov.au/provider-registration' },
  ],
  author: 'AblePoint team (reviewer to be named)',
  aiAssisted: true,
  aiNotes: 'First draft outline by an AI assistant; facts checked by a human editor.',
  ...over,
});

describe('blogDraftSchema', () => {
  it('accepts a complete draft', () => expect(blogDraftSchema.safeParse(goodDraft()).success).toBe(true));
  it('rejects bad slugs, short titles, http sources and too few sources/sections', () => {
    expect(blogDraftSchema.safeParse(goodDraft({ slug: 'Bad Slug' })).success).toBe(false);
    expect(blogDraftSchema.safeParse(goodDraft({ title: 'Short' })).success).toBe(false);
    expect(blogDraftSchema.safeParse(goodDraft({ sources: [{ label: 'One source only', url: 'https://www.ndis.gov.au/x' }] })).success).toBe(false);
    expect(blogDraftSchema.safeParse(goodDraft({ sources: [{ label: 'Insecure source', url: 'http://www.ndis.gov.au/x' }, { label: 'Other source', url: 'https://www.ndis.gov.au/y' }] })).success).toBe(false);
    expect(blogDraftSchema.safeParse(goodDraft({ sections: goodDraft().sections.slice(0, 2) })).success).toBe(false);
  });
  it('rejects unknown regions and categories', () => {
    expect(blogDraftSchema.safeParse({ ...goodDraft(), regions: ['sydney'] }).success).toBe(false);
    expect(blogDraftSchema.safeParse({ ...goodDraft(), category: 'seo-spam' }).success).toBe(false);
  });
});

describe('assessDraft quality gates', () => {
  it('passes a good draft', () => {
    const a = assessDraft(goodDraft());
    expect(a.errors).toEqual([]);
    expect(a.ok).toBe(true);
    expect(a.metrics.words).toBeGreaterThan(600);
    expect(a.metrics.authoritativeSources).toBe(2);
    expect(a.metrics.fleschKincaidGrade).toBeLessThan(10.5);
  });
  it('blocks thin content', () => {
    const d = goodDraft({ sections: goodDraft().sections.map((s) => ({ ...s, body: [s.body[0]!] })) });
    expect(assessDraft(d).errors.join()).toMatch(/too thin/);
  });
  it('blocks keyword stuffing', () => {
    const stuffed = goodDraft({ sections: goodDraft().sections.map((s) => ({ ...s, body: s.body.map((b) => b + ' NDIS provider NDIS provider NDIS provider NDIS provider NDIS provider NDIS provider NDIS provider.') })) });
    expect(assessDraft(stuffed).errors.join()).toMatch(/keyword stuffing/);
  });
  it('blocks banned NDIS wording and guarantees', () => {
    const d = goodDraft({ summary: 'We are the best provider and we guarantee approval for every participant who contacts us today.' });
    const errs = assessDraft(d).errors.join();
    expect(errs).toMatch(/banned phrase/);
    const e2 = assessDraft(goodDraft({ answer: goodDraft().answer + ' We guarantee you will be funded.' })).errors.join();
    expect(e2).toMatch(/claim not allowed|banned phrase/);
  });
  it('requires two authoritative sources', () => {
    const d = goodDraft({ sources: [{ label: 'A random blog about ndis', url: 'https://example.com/a' }, { label: 'Another random blog page', url: 'https://example.org/b' }] });
    expect(assessDraft(d).errors.join()).toMatch(/authoritative/);
  });
  it('rejects an AI as author', () => expect(assessDraft(goodDraft({ author: 'ChatGPT' })).errors.join()).toMatch(/never an AI/));
  it('blocks near-duplicates of existing content and notes overlap', () => {
    const base = goodDraft();
    const copy = assessDraft(goodDraft({ slug: 'another-checklist-post' }), [{ slug: base.slug, text: draftText(base) }]);
    expect(copy.errors.join()).toMatch(/too similar/);
    expect(copy.nearestExisting?.slug).toBe(base.slug);
    expect(assessDraft(base, [{ slug: base.slug, text: draftText(base) }]).errors).toEqual([]); // itself is ignored
  });
  it('flags text that is too hard to read', () => {
    const hard = 'Notwithstanding multidisciplinary interdependencies, organisational accountability necessitates comprehensive contextualisation of stakeholder expectations. '.repeat(40);
    expect(fleschKincaidGrade(hard)).toBeGreaterThan(13);
  });
  it('similarity is symmetric and bounded', () => {
    const a = 'one two three four five six seven eight nine ten';
    expect(similarity(a, a)).toBe(1);
    expect(similarity(a, 'completely different words here that do not overlap at all ok')).toBe(0);
  });
});
