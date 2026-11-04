import { site } from '../data/site';

export interface Crumb {
  name: string;
  path: string;
}

export function abs(path: string, origin: string): string {
  return new URL(path, origin).toString();
}

export function organization(origin: string) {
  return {
    '@type': 'Organization',
    '@id': `${origin}/#organization`,
    name: site.name,
    url: `${origin}/`,
    logo: `${origin}/icon-192.png`,
    telephone: '+611300088549',
    email: site.email,
    // Address deliberately limited to locality. No street address until verified (docs/08 §2).
    address: { '@type': 'PostalAddress', addressLocality: 'Gosford', addressRegion: 'NSW', addressCountry: 'AU' },
    areaServed: ['Central Coast', 'Newcastle', 'Dubbo', 'Orange', 'Tamworth', 'Gunnedah'].map((name) => ({ '@type': 'AdministrativeArea', name })),
  };
}

export function website(origin: string) {
  return { '@type': 'WebSite', '@id': `${origin}/#website`, url: `${origin}/`, name: site.name, publisher: { '@id': `${origin}/#organization` } };
}

export function breadcrumbs(crumbs: Crumb[], origin: string) {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: abs(c.path, origin) })),
  };
}

export function serviceSchema(args: { name: string; description: string; path: string; areaServed?: string[] }, origin: string) {
  return {
    '@type': 'Service',
    name: args.name,
    description: args.description,
    url: abs(args.path, origin),
    provider: { '@id': `${origin}/#organization` },
    ...(args.areaServed?.length ? { areaServed: args.areaServed.map((name) => ({ '@type': 'AdministrativeArea', name })) } : {}),
  };
}

export function article(args: { headline: string; description: string; path: string; author: string; datePublished?: string; dateModified: string; reviewedBy?: string }, origin: string) {
  return {
    '@type': 'Article',
    headline: args.headline,
    description: args.description,
    mainEntityOfPage: abs(args.path, origin),
    author: { '@type': 'Person', name: args.author },
    publisher: { '@id': `${origin}/#organization` },
    ...(args.datePublished ? { datePublished: args.datePublished } : {}),
    dateModified: args.dateModified,
    ...(args.reviewedBy ? { reviewedBy: { '@type': 'Person', name: args.reviewedBy } } : {}),
  };
}

export function faqPage(faqs: { q: string; a: string }[]) {
  return {
    '@type': 'FAQPage',
    mainEntity: faqs.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
  };
}

export function graph(...nodes: object[]) {
  return { '@context': 'https://schema.org', '@graph': nodes };
}
