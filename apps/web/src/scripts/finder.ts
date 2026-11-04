import { findSupport, type FRegion, type FService, type FVacancy } from '../lib/finder';

// Progressive enhancement of the finder form: results appear below it. Without JavaScript the form links to the locations page.
// Data comes from the site's own public API; nothing about the search is sent anywhere or tracked.
const form = document.getElementById('finder-form') as HTMLFormElement | null;
const out = document.getElementById('finder-results') as HTMLElement | null;
if (form && out) {
  let cache: Promise<{ regions: FRegion[]; services: FService[]; vacancies: FVacancy[] }> | undefined;
  const load = () => (cache ??= Promise.all(['regions', 'services', 'vacancies'].map((k) => fetch(`/api/v1/${k}.json`).then((r) => r.json()))).then(([r, s, v]) => ({ regions: r.data, services: s.data, vacancies: v.data })));
  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}, ...kids: (Node | string)[]) => { const e = Object.assign(document.createElement(tag), props); e.append(...kids); return e; };
  // The API returns absolute URLs for the build origin; links stay on whatever origin the visitor is on.
  const local = (u: string) => { try { return new URL(u, location.origin).pathname; } catch { return u; } };
  const link = (href: string, text: string) => el('a', { href: href.startsWith('http') ? local(href) : href }, text);

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const fd = new FormData(form);
    out.replaceChildren(el('p', { className: 'muted' }, 'Looking…'));
    try {
      const r = findSupport(await load(), { region: String(fd.get('region') ?? ''), service: String(fd.get('service') ?? '') });
      const h = el('h3', { tabIndex: -1, id: 'finder-results-heading' }, r.region ? `Support in ${r.region.name}` : 'Support across regional NSW');
      const list = el('ul', { className: 'checklist' });
      if (r.region) list.append(el('li', {}, link(r.region.url, `About ${r.region.name}`), ' (services, vacancies and contact)'));
      if (r.service) list.append(el('li', {}, link(r.service.url, r.service.name), r.offeredHere === true ? ` is offered in ${r.region?.name}.` : r.region ? ` — call us to check availability in ${r.region.name}.` : ''));
      if (!r.region && !r.service) list.append(el('li', {}, link('/locations/', 'See all regions')), el('li', {}, link('/services/', 'See all services')));
      out.replaceChildren(h, list);
      if (r.asksAboutVacancies) {
        const vh = el('h4', {}, 'Vacancies');
        if (r.vacancies.length) out.append(vh, el('ul', { className: 'checklist' }, ...r.vacancies.map((v) => el('li', {}, link(v.url, v.title), ` (${v.vacancyType}, ${v.suburb})${v.availability === 'unconfirmed' ? ': please call us to confirm' : ''}`))));
        else out.append(vh, el('p', {}, 'There are no matching vacancies listed right now. ', link('/referral/', 'Send a referral'), ' and we will tell you what is expected to be available.'));
      }
      out.append(el('p', { className: 'hero__actions' }, el('a', { className: 'btn btn--primary', href: '/referral/' }, 'Make a referral'), el('a', { className: 'btn btn--secondary', href: 'tel:1300088549' }, 'Call 1300 088 549')));
      h.focus();
    } catch {
      out.replaceChildren(el('p', {}, 'Sorry, the search did not load. Please ', link('/locations/', 'browse the regions'), ' or call 1300 088 549.'));
    }
  });
}

export {};
