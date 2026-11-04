/**
 * "Find support near you": pure matching logic for the finder widget (docs/24). Works on the public API data, so it can only
 * ever show what the site is allowed to show. Nothing about the search leaves the browser.
 */
export interface FRegion { id: string; name: string; url: string; services: string[] }
export interface FService { id: string; name: string; url: string }
export interface FVacancy { id: string; title: string; url: string; vacancyType: 'SIL' | 'SDA' | 'STA'; region: string; suburb: string; availability: string }

export const SERVICE_VACANCY_TYPE: Record<string, FVacancy['vacancyType']> = { 'supported-independent-living': 'SIL', sda: 'SDA', 'short-term-accommodation': 'STA' };

export interface FinderResult {
  region?: FRegion;
  service?: FService;
  /** true: listed as offered here; false: not listed (ask us); undefined: no service chosen */
  offeredHere?: boolean;
  vacancies: FVacancy[];
  asksAboutVacancies: boolean;
}

export function findSupport(data: { regions: FRegion[]; services: FService[]; vacancies: FVacancy[] }, q: { region?: string; service?: string }): FinderResult {
  const region = data.regions.find((r) => r.id === q.region);
  const service = data.services.find((s) => s.id === q.service);
  const type = service ? SERVICE_VACANCY_TYPE[service.id] : undefined;
  const asksAboutVacancies = !service || Boolean(type);
  const vacancies = data.vacancies.filter((v) => (!region || v.region === region.id) && (!type || v.vacancyType === type) && v.availability !== 'noLongerAvailable');
  return { region, service, offeredHere: region && service ? region.services.includes(service.id) : undefined, vacancies: asksAboutVacancies ? vacancies : [], asksAboutVacancies };
}
