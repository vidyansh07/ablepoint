import type { StructureResolver } from 'sanity/structure';
import { DOCUMENT_TYPES, SINGLETON_TYPES, VACANCY_STATUSES, VACANCY_STATUS_TITLES } from './constants';

const SINGLETON_TITLES: Record<(typeof SINGLETON_TYPES)[number], string> = {
  siteSettings: 'Site settings',
  navigation: 'Navigation',
  footer: 'Footer',
};

const LIST_TITLES: Partial<Record<(typeof DOCUMENT_TYPES)[number], string>> = {
  page: 'Pages',
  service: 'Services',
  region: 'Regions',
  serviceCoverage: 'Service coverage',
  property: 'Properties',
  guide: 'Guides',
  faq: 'FAQs',
  author: 'Authors and reviewers',
  teamMember: 'Team profiles',
  testimonial: 'Testimonials',
  landingPage: 'Campaign landing pages',
  cta: 'Calls to action',
  legalPage: 'Legal and policy pages',
  redirect: 'Redirects',
};

const isSingleton = (t: string) => (SINGLETON_TYPES as readonly string[]).includes(t);

export const structure: StructureResolver = (S) =>
  S.list()
    .title('Content')
    .items([
      S.listItem()
        .title('Awaiting compliance review')
        .id('awaitingReview')
        .child(S.documentList().title('Awaiting compliance review').filter('reviewState == "inReview"').apiVersion('2024-01-01')),
      S.divider(),
      ...SINGLETON_TYPES.map((type) => S.listItem().title(SINGLETON_TITLES[type]).id(type).child(S.document().schemaType(type).documentId(type))),
      S.divider(),
      S.listItem()
        .title('Vacancies')
        .id('vacancies')
        .child(
          S.list()
            .title('Vacancies by status')
            .items(
              VACANCY_STATUSES.map((status) =>
                S.listItem()
                  .title(VACANCY_STATUS_TITLES[status])
                  .id(`vacancy-${status}`)
                  .child(S.documentList().title(VACANCY_STATUS_TITLES[status]).apiVersion('2024-01-01').filter('_type == "vacancy" && status == $status').params({ status })),
              ),
            ),
        ),
      ...DOCUMENT_TYPES.filter((t) => !isSingleton(t) && t !== 'vacancy' && LIST_TITLES[t]).map((t) =>
        S.documentTypeListItem(t).title(LIST_TITLES[t] as string),
      ),
    ]);
