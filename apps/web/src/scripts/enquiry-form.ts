import { enquirySchema, type EnquirySubmission } from '@ablepoint/schemas';

declare global {
  interface Window {
    turnstile?: {
      render(el: string | HTMLElement, opts: { sitekey: string; callback: (token: string) => void; 'expired-callback'?: () => void; 'error-callback'?: () => void }): string;
      reset(id?: string): void;
    };
  }
}

const root = document.getElementById('enquiry-root');
const form = document.getElementById('enquiry-form') as HTMLFormElement | null;

if (root && form) {
  const endpoint = root.dataset.endpoint ?? '';
  const noticeVersion = root.dataset.noticeVersion ?? 'draft-0';
  const summary = document.getElementById('error-summary') as HTMLElement;
  const list = document.getElementById('error-list') as HTMLUListElement;
  const status = document.getElementById('form-status') as HTMLElement;
  const submit = document.getElementById('submit-btn') as HTMLButtonElement;
  // Bot check (Cloudflare Turnstile). Tokens are single use: after any failed attempt the widget is reset and a fresh token is required.
  const sitekey = root.dataset.turnstile ?? '';
  let turnstileToken: string | undefined;
  let widgetId: string | undefined;
  if (sitekey) {
    const s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    s.async = true;
    s.onload = () => {
      widgetId = window.turnstile?.render('#turnstile-slot', {
        sitekey,
        callback: (t) => { turnstileToken = t; },
        'expired-callback': () => { turnstileToken = undefined; },
        'error-callback': () => { turnstileToken = undefined; },
      });
    };
    document.head.append(s);
  }
  const resetBotCheck = () => { turnstileToken = undefined; if (widgetId !== undefined) window.turnstile?.reset(widgetId); };

  // One key per page load: a double-click or retry replays the same submission (idempotent server-side).
  const idempotencyKey = crypto.randomUUID();

  const fieldAnchor = (path: string): string => {
    if (path === 'referrerType' || path === 'contactMethod') return `${path}-${path === 'referrerType' ? 'self' : 'phone'}`;
    if (path === 'services') return 'services-core-support';
    return path;
  };

  const read = () => {
    const fd = new FormData(form);
    return {
      name: String(fd.get('name') ?? ''),
      phone: String(fd.get('phone') ?? ''),
      email: String(fd.get('email') ?? ''),
      referrerType: fd.get('referrerType') ?? undefined,
      services: fd.getAll('services'),
      region: String(fd.get('region') ?? '') || undefined,
      contactMethod: fd.get('contactMethod') ?? undefined,
      bestTime: String(fd.get('bestTime') ?? ''),
      consent: form.querySelector<HTMLInputElement>('#consent')?.checked ? true : false,
      website: String(fd.get('website') ?? ''),
    };
  };

  const clearErrors = () => {
    summary.hidden = true;
    list.replaceChildren();
    form.querySelectorAll<HTMLElement>('.error').forEach((e) => { e.hidden = true; e.textContent = ''; });
    form.querySelectorAll('[aria-invalid]').forEach((e) => e.removeAttribute('aria-invalid'));
  };

  const showErrors = (issues: { path: string; message: string }[]) => {
    const seen = new Set<string>();
    for (const issue of issues) {
      if (seen.has(issue.path)) continue;
      seen.add(issue.path);
      const li = document.createElement('li');
      const a = document.createElement('a');
      a.href = `#${fieldAnchor(issue.path)}`;
      a.textContent = issue.message;
      li.append(a);
      list.append(li);
      const err = document.getElementById(`${issue.path}-error`);
      if (err) { err.textContent = issue.message; err.hidden = false; }
      document.getElementById(issue.path)?.setAttribute('aria-invalid', 'true');
    }
    summary.hidden = false;
    summary.focus();
  };

  const setStatus = (kind: 'ok' | 'error', html: string) => {
    status.className = `notice notice--${kind}`;
    status.innerHTML = html;
    status.focus();
  };

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    clearErrors();
    const result = enquirySchema.safeParse(read());
    if (!result.success) {
      showErrors(result.error.issues.map((i) => ({ path: String(i.path[0] ?? 'form'), message: i.message })));
      return;
    }
    if (!endpoint) {
      setStatus('ok', '<p><strong>Demonstration only.</strong> Your details were checked in your browser and were <strong>not</strong> sent anywhere.</p>');
      return;
    }
    if (sitekey && !turnstileToken) {
      setStatus('error', '<p><strong>Please wait for the security check to finish,</strong> then send your enquiry again.</p>');
      return;
    }
    submit.disabled = true;
    const payload: EnquirySubmission = { idempotencyKey, noticeVersion, ...(turnstileToken ? { turnstileToken } : {}), enquiry: result.data };
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
      });
      if (!res.ok) throw new Error(String(res.status));
      window.location.assign('/thank-you/');
    } catch {
      submit.disabled = false;
      resetBotCheck();
      setStatus('error', '<p><strong>Sorry, we could not send your enquiry.</strong> Please try again, or call us on 1300 088 549.</p>');
    }
  });
}
