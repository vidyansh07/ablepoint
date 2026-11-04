// Text-size and high-contrast controls (docs/17 §9). Preferences live in this browser only (localStorage) and are never sent anywhere.
type Prefs = { text?: '100' | '115' | '130'; contrast?: 'high' };
const KEY = 'ap_prefs';
const root = document.documentElement;

const load = (): Prefs => { try { return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Prefs; } catch { return {}; } };
const save = (p: Prefs) => { try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* not remembered */ } };

const prefs = load();
const sizeButtons = [...document.querySelectorAll<HTMLButtonElement>('[data-text-size]')];
const contrastBtn = document.getElementById('contrast-toggle') as HTMLButtonElement | null;

const render = () => {
  const size = prefs.text ?? '100';
  if (size === '100') root.removeAttribute('data-text'); else root.setAttribute('data-text', size);
  if (prefs.contrast === 'high') root.setAttribute('data-contrast', 'high'); else root.removeAttribute('data-contrast');
  for (const b of sizeButtons) b.setAttribute('aria-pressed', String(b.dataset.textSize === size));
  contrastBtn?.setAttribute('aria-pressed', String(prefs.contrast === 'high'));
};

for (const b of sizeButtons) b.addEventListener('click', () => { prefs.text = b.dataset.textSize as Prefs['text']; save(prefs); render(); });
contrastBtn?.addEventListener('click', () => { prefs.contrast = prefs.contrast === 'high' ? undefined : 'high'; save(prefs); render(); });
render();

export {};
