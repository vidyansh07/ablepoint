import { vacancyDisplay, type SiteEnv } from '@ablepoint/schemas';
import { isShown } from './gate';
import type { Guide, Post, Region, Service, Vacancy } from '../data/types';

/**
 * Public read-only content API (static JSON), docs/21-agent-api-and-content-pipeline.md.
 * Built from the same data as the website and passed through the same approval gate, so an agent can never read content
 * the public site would not show. Contains PUBLIC fields only: no internal notes, no personal data, no vacancy owners.
 */
export const API_VERSION = '1';

export interface ApiInputs {
  site: { name: string; phoneDisplay: string; email: string; headOffice: string; registrationNumber?: string; registrationGroups?: readonly string[] };
  services: Service[];
  regions: Region[];
  guides: Guide[];
  posts: Post[];
  vacancies: Vacancy[];
  env: SiteEnv;
  origin: string;
  now: Date;
  /** Overrides the compliance reviewer list (tests). */
  reviewers?: readonly string[];
}

const e164 = (display: string) => '+61' + display.replace(/\D/g, '').replace(/^0/, '');

export function buildApi(i: ApiInputs) {
  const vis = <T extends Parameters<typeof isShown>[0]>(xs: T[]) => xs.filter((x) => isShown(x, i.env, i.reviewers));
  const url = (p: string) => new URL(p, i.origin).toString();
  const status = (x: { reviewState: string }) => (i.env === 'production' ? 'approved' : x.reviewState);
  const envelope = <T,>(data: T) => ({ apiVersion: API_VERSION, environment: i.env, generatedAt: i.now.toISOString(), publisher: i.site.name, data });

  const services = vis(i.services).map((s) => ({
    id: s.slug, type: 'service', name: s.title, url: url(`/${s.slug}/`), summary: s.summary, whoFor: s.whoFor, provides: s.provides, process: s.process,
    faqs: s.faqs, regions: vis(i.regions).filter((r) => r.services.includes(s.slug)).map((r) => r.slug), related: s.related, status: status(s), updatedAt: s.updatedAt,
  }));
  const regions = vis(i.regions).map((r) => ({
    id: r.slug, type: 'region', name: r.name, url: url(`/locations/${r.slug}/`), summary: r.summary, services: r.services, headOfficeRegion: Boolean(r.isHeadOfficeRegion), faqs: r.faqs,
    // Only public, verified facts. `verifiedBy` and partner permission references stay internal.
    localFacts: r.facts ? { towns: r.facts.towns, about: r.facts.about ?? [], partners: (r.facts.partners ?? []).map((p) => ({ name: p.name, kind: p.kind, url: p.url ?? null })), gettingAround: r.facts.gettingAround ?? null, lastCheckedOn: r.facts.verifiedAt } : null,
    status: status(r), updatedAt: r.updatedAt,
  }));
  const article = <X extends object = object>(a: { slug: string; title: string; answer: string; sections: { heading: string; body: string[] }[]; faqs: { q: string; a: string }[]; sources: { label: string; url: string }[]; author: string; reviewer?: string; reviewedAt?: string; publishedAt?: string; updatedAt: string; reviewState: string }, kind: 'guide' | 'post', path: string, extra: X = {} as X) => ({
    id: a.slug, type: kind, title: a.title, url: url(path), answer: a.answer,
    sections: a.sections.map((s) => ({ heading: s.heading, text: s.body.join('\n\n') })), faqs: a.faqs, sources: a.sources,
    author: a.author, reviewer: a.reviewer ?? null, reviewedAt: a.reviewedAt ?? null, publishedAt: a.publishedAt ?? null, updatedAt: a.updatedAt, status: status(a), ...extra,
  });
  const guides = vis(i.guides).map((g) => article(g, 'guide', `/guides/${g.slug}/`));
  const posts = vis(i.posts).map((p) => article(p, 'post', `/blog/${p.slug}/`, { summary: p.summary, category: p.category, tags: p.tags, regions: p.regions, services: p.services, aiAssisted: p.aiAssisted }));
  const vacancies = vis(i.vacancies)
    .map((v) => ({ v, display: vacancyDisplay(v.status, v.lastVerifiedAt, i.now) }))
    .filter(({ display }) => display !== 'hidden')
    .map(({ v, display }) => ({ id: v.slug, type: 'vacancy', title: v.title, url: url(`/vacancies/${v.slug}/`), vacancyType: v.type, region: v.regionSlug, suburb: v.suburb, summary: v.summary, features: v.features, availability: display, lastVerifiedAt: v.lastVerifiedAt ?? null }));
  const faqs = [
    ...services.flatMap((s) => s.faqs.map((f) => ({ ...f, source: s.url }))),
    ...regions.flatMap((r) => r.faqs.map((f) => ({ ...f, source: r.url }))),
    ...guides.flatMap((g) => g.faqs.map((f) => ({ ...f, source: g.url }))),
    ...posts.flatMap((p) => p.faqs.map((f) => ({ ...f, source: p.url }))),
  ];
  const organisation = {
    name: i.site.name, url: url('/'), telephone: e164(i.site.phoneDisplay), telephoneDisplay: i.site.phoneDisplay, referralUrl: url('/referral/'), email: i.site.email, headOffice: i.site.headOffice,
    regionsServed: regions.map((r) => r.name),
    registration: i.site.registrationNumber ? { ndisRegistrationNumber: i.site.registrationNumber, registeredGroups: i.site.registrationGroups ?? [] } : null,
    notes: 'Only verified facts are published here. A null registration means the number has not been confirmed for publication.',
  };
  const searchIndex = [
    ...services.map((s) => ({ id: s.id, type: s.type, title: s.name, url: s.url, summary: s.summary, updatedAt: s.updatedAt })),
    ...regions.map((r) => ({ id: r.id, type: r.type, title: r.name, url: r.url, summary: r.summary, updatedAt: r.updatedAt })),
    ...guides.map((g) => ({ id: g.id, type: g.type, title: g.title, url: g.url, summary: g.answer, updatedAt: g.updatedAt })),
    ...posts.map((p) => ({ id: p.id, type: p.type, title: p.title, url: p.url, summary: p.summary, updatedAt: p.updatedAt })),
    ...vacancies.map((v) => ({ id: v.id, type: v.type, title: v.title, url: v.url, summary: v.summary, updatedAt: v.lastVerifiedAt })),
  ];
  const resources = { organisation, services, regions, guides, posts, vacancies, faqs, 'search-index': searchIndex };
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(resources)) out[k] = envelope(v);
  out.index = envelope({
    description: 'Read-only public content API for AblePoint Australia. Static JSON, versioned, CORS-enabled, not indexed by search engines.',
    openapi: url('/api/v1/openapi.json'),
    resources: Object.keys(resources).map((k) => ({ name: k, url: url(`/api/v1/${k}.json`) })),
    counts: Object.fromEntries(Object.entries(resources).map(([k, v]) => [k, Array.isArray(v) ? v.length : 1])),
    usage: 'Content is published for information. Do not present AblePoint as offering anything not listed here. Check status and lastVerifiedAt on vacancies.',
  });
  out.openapi = openApiDocument(i.origin, Object.keys(resources));
  return out as Record<string, object>;
}

export function openApiDocument(origin: string, resourceNames: string[]) {
  const envelopeSchema = (item: object) => ({
    type: 'object', required: ['apiVersion', 'environment', 'generatedAt', 'publisher', 'data'],
    properties: { apiVersion: { type: 'string', const: API_VERSION }, environment: { type: 'string', enum: ['production', 'staging', 'development'] }, generatedAt: { type: 'string', format: 'date-time' }, publisher: { type: 'string' }, data: item },
  });
  const arr = (ref: string) => ({ type: 'array', items: { $ref: `#/components/schemas/${ref}` } });
  const schemaFor: Record<string, object> = {
    organisation: { $ref: '#/components/schemas/Organisation' }, services: arr('Service'), regions: arr('Region'), guides: arr('Article'), posts: arr('Article'),
    vacancies: arr('Vacancy'), faqs: arr('Faq'), 'search-index': arr('SearchItem'),
  };
  const paths: Record<string, object> = {};
  for (const name of resourceNames) {
    paths[`/api/v1/${name}.json`] = { get: { operationId: `get_${name.replace(/-/g, '_')}`, summary: `Get ${name}`, responses: { '200': { description: 'OK', content: { 'application/json': { schema: envelopeSchema(schemaFor[name] ?? {}) } } } } } };
  }
  paths['/api/v1/index.json'] = { get: { operationId: 'get_index', summary: 'Discovery document', responses: { '200': { description: 'OK' } } } };
  return {
    openapi: '3.1.0',
    info: { title: 'AblePoint Australia public content API', version: API_VERSION, description: 'Read-only, static, public content. Writing content is done through the CMS or the draft-ingest pipeline, never through this API. Only approved content appears in production.' },
    servers: [{ url: origin }],
    paths,
    components: {
      schemas: {
        Organisation: { type: 'object', properties: { name: { type: 'string' }, url: { type: 'string', format: 'uri' }, referralUrl: { type: 'string', format: 'uri', description: 'Where to send a referral.' }, telephone: { type: 'string' }, email: { type: 'string' }, headOffice: { type: 'string' }, regionsServed: { type: 'array', items: { type: 'string' } }, registration: { type: ['object', 'null'] } } },
        Service: { type: 'object', required: ['id', 'name', 'url', 'summary'], properties: { id: { type: 'string' }, name: { type: 'string' }, url: { type: 'string', format: 'uri' }, summary: { type: 'string' }, whoFor: { type: 'string' }, provides: { type: 'array', items: { type: 'string' } }, process: { type: 'array', items: { type: 'string' } }, regions: { type: 'array', items: { type: 'string' } }, status: { type: 'string' } } },
        Region: { type: 'object', required: ['id', 'name', 'url'], properties: { id: { type: 'string' }, name: { type: 'string' }, url: { type: 'string', format: 'uri' }, summary: { type: 'string' }, services: { type: 'array', items: { type: 'string' } }, headOfficeRegion: { type: 'boolean' }, localFacts: { type: ['object', 'null'], description: 'Verified local facts; null until operations supply them.' } } },
        Article: { type: 'object', required: ['id', 'type', 'title', 'url', 'answer'], properties: { id: { type: 'string' }, type: { enum: ['guide', 'post'] }, title: { type: 'string' }, url: { type: 'string', format: 'uri' }, answer: { type: 'string' }, sections: { type: 'array', items: { type: 'object', properties: { heading: { type: 'string' }, text: { type: 'string' } } } }, sources: { type: 'array', items: { type: 'object', properties: { label: { type: 'string' }, url: { type: 'string', format: 'uri' } } } }, author: { type: 'string' }, reviewer: { type: ['string', 'null'] }, updatedAt: { type: 'string' } } },
        Vacancy: { type: 'object', required: ['id', 'title', 'availability'], properties: { id: { type: 'string' }, title: { type: 'string' }, vacancyType: { enum: ['SIL', 'SDA', 'STA'] }, region: { type: 'string' }, suburb: { type: 'string' }, availability: { enum: ['available', 'unconfirmed', 'temporarilyUnavailable', 'noLongerAvailable'] }, lastVerifiedAt: { type: ['string', 'null'] } } },
        Faq: { type: 'object', properties: { q: { type: 'string' }, a: { type: 'string' }, source: { type: 'string', format: 'uri' } } },
        SearchItem: { type: 'object', properties: { id: { type: 'string' }, type: { type: 'string' }, title: { type: 'string' }, url: { type: 'string', format: 'uri' }, summary: { type: 'string' }, updatedAt: { type: ['string', 'null'] } } },
      },
    },
  };
}

export function buildLlmsTxt(i: ApiInputs): string {
  const vis = <T extends Parameters<typeof isShown>[0]>(xs: T[]) => xs.filter((x) => isShown(x, i.env, i.reviewers));
  const u = (p: string) => new URL(p, i.origin).toString();
  const line = (t: string, p: string, d: string) => `- [${t}](${u(p)}): ${d.replace(/\s+/g, ' ').slice(0, 200)}`;
  const parts = [
    `# ${i.site.name}`, '',
    `> ${i.site.name} provides NDIS supports in regional New South Wales. This file is a plain-text guide to our public content for people and automated tools. It does not change how any search engine treats this site.`, '',
    'Contact: ' + i.site.phoneDisplay + ' · ' + i.site.email, '',
    '## Services', ...vis(i.services).map((s) => line(s.title, `/${s.slug}/`, s.summary)), '',
    '## Locations', ...vis(i.regions).map((r) => line(r.name, `/locations/${r.slug}/`, r.summary)), '',
    '## Guides and articles', ...vis(i.guides).map((g) => line(g.title, `/guides/${g.slug}/`, g.answer)), ...vis(i.posts).map((p) => line(p.title, `/blog/${p.slug}/`, p.summary)), '',
    '## Data', line('Public content API (JSON)', '/api/v1/index.json', 'Read-only, versioned JSON for services, regions, guides, posts and vacancies.'), line('OpenAPI description', '/api/v1/openapi.json', 'Machine-readable API description.'), line('Atom feed', '/feed.xml', 'Latest guides and articles.'), '',
    '## Optional', line('Contact', '/contact-us/', 'How to reach us'), line('Make a referral', '/referral/', 'Referral and enquiry form'), '',
  ];
  return parts.join('\n');
}

export function buildAtomFeed(i: ApiInputs): string {
  const vis = <T extends Parameters<typeof isShown>[0]>(xs: T[]) => xs.filter((x) => isShown(x, i.env, i.reviewers));
  const u = (p: string) => new URL(p, i.origin).toString();
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const items = [
    ...vis(i.guides).map((g) => ({ id: u(`/guides/${g.slug}/`), title: g.title, summary: g.answer, updated: g.updatedAt, author: g.author })),
    ...vis(i.posts).map((p) => ({ id: u(`/blog/${p.slug}/`), title: p.title, summary: p.summary, updated: p.updatedAt, author: p.author })),
  ].sort((a, b) => b.updated.localeCompare(a.updated));
  const updated = items[0]?.updated ?? i.now.toISOString();
  return `<?xml version="1.0" encoding="utf-8"?>\n<feed xmlns="http://www.w3.org/2005/Atom" xml:lang="en-AU">\n  <title>${esc(i.site.name)}: guides and blog</title>\n  <id>${u('/feed.xml')}</id>\n  <link rel="self" href="${u('/feed.xml')}"/>\n  <link rel="alternate" href="${u('/')}"/>\n  <updated>${new Date(updated).toISOString()}</updated>\n${items.map((x) => `  <entry>\n    <id>${x.id}</id>\n    <title>${esc(x.title)}</title>\n    <link rel="alternate" href="${x.id}"/>\n    <updated>${new Date(x.updated).toISOString()}</updated>\n    <author><name>${esc(x.author)}</name></author>\n    <summary>${esc(x.summary)}</summary>\n  </entry>`).join('\n')}\n</feed>\n`;
}
