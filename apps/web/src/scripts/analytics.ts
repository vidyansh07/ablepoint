import { CONSENT_KEY, mayTrack, parseConsent, sanitiseEvent, type ConsentState } from '@ablepoint/schemas';

/**
 * Consent-gated analytics (docs/08 §6, docs/05 §10).
 * - Does nothing unless a GTM container id is configured AND the page allows analytics.
 * - Loads GTM only after an explicit "yes". Default is no tracking.
 * - Pushes only allow-listed events with allow-listed, personal-data-free parameters.
 */
declare global {
  interface Window { dataLayer?: Record<string, unknown>[]; }
}

const body = document.body;
const gtmId = body.dataset.gtmId ?? '';
const pageAllows = body.dataset.analytics === 'on';

if (gtmId && pageAllows && /^GTM-[A-Z0-9]+$/.test(gtmId)) {
  const banner = document.getElementById('consent-banner') as HTMLElement | null;
  const settingsBtn = document.getElementById('consent-settings') as HTMLButtonElement | null;
  const read = (): ConsentState | null => {
    try { return parseConsent(localStorage.getItem(CONSENT_KEY)); } catch { return null; }
  };
  const write = (analytics: boolean) => {
    const state: ConsentState = { v: 1, analytics, ts: new Date().toISOString() };
    try { localStorage.setItem(CONSENT_KEY, JSON.stringify(state)); } catch { /* storage blocked: choice not remembered */ }
    return state;
  };

  let loaded = false;
  const push = (name: string, params: Record<string, unknown>) => {
    const ev = sanitiseEvent(name, { page_path: location.pathname, ...params });
    if (!ev || !loaded) return;
    (window.dataLayer ??= []).push({ event: ev.event, ...ev.params });
  };

  const start = () => {
    if (loaded) return;
    loaded = true;
    const dl = (window.dataLayer ??= []);
    dl.push({ 'gtm.start': Date.now(), event: 'gtm.js' });
    const s = document.createElement('script');
    s.async = true;
    s.src = `https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(gtmId)}`;
    document.head.append(s);
    const pageEvent = body.dataset.pageEvent;
    if (pageEvent) push(pageEvent, {});
  };

  document.addEventListener('click', (e) => {
    const el = (e.target as Element | null)?.closest<HTMLElement>('[data-event]');
    if (el?.dataset.event) push(el.dataset.event, { cta_location: el.dataset.eventLocation });
  });

  const decide = (analytics: boolean) => {
    write(analytics);
    if (banner) banner.hidden = true;
    if (analytics) start();
    else if (loaded) location.reload(); // withdraw: reload so the third-party script is gone
  };
  banner?.querySelector('[data-consent="accept"]')?.addEventListener('click', () => decide(true));
  banner?.querySelector('[data-consent="decline"]')?.addEventListener('click', () => decide(false));
  settingsBtn?.addEventListener('click', () => {
    if (banner) { banner.hidden = false; banner.querySelector<HTMLElement>('h2')?.focus(); }
  });

  const current = read();
  if (mayTrack(current)) start();
  else if (current === null && banner) banner.hidden = false;
}
