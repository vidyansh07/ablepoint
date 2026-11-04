import { describe, expect, it } from 'vitest';
import {
  ALLOWED_MIME_TYPES,
  DOWNLOAD_RESPONSE_HEADERS,
  DOWNLOAD_URL_TTL_SECONDS,
  DOCUMENT_STATES,
  MAX_UPLOAD_BYTES,
  UPLOAD_URL_TTL_SECONDS,
  UploadError,
  buildObjectKey,
  canDownload,
  detectType,
  issueDownloadUrl,
  issueUploadUrl,
  runScan,
  sanitiseFilename,
  transitionDocument,
  validateUploadContent,
  validateUploadRequest,
  type DocumentEvent,
  type DocumentState,
  type MalwareScanner,
  type ObjectStorage,
} from '../src/uploads';

const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 0x0a, 0x25, 0xe2, 0xe3]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const docx = (names: string[] = ['[Content_Types].xml', 'word/document.xml']) => Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from(names.join('\0'), 'latin1')]);
const MIME = { pdf: 'application/pdf', png: 'image/png', jpeg: 'image/jpeg', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' };
const req = (filename: string, declaredMime: string, sizeBytes: number) => ({ filename, declaredMime, sizeBytes });

describe('constants', () => {
  it('match docs/05 §6', () => {
    expect(MAX_UPLOAD_BYTES).toBe(10 * 1024 * 1024);
    expect(UPLOAD_URL_TTL_SECONDS).toBeLessThanOrEqual(300);
    expect(DOWNLOAD_URL_TTL_SECONDS).toBeLessThanOrEqual(60);
    expect(DOWNLOAD_RESPONSE_HEADERS['content-disposition']).toBe('attachment');
    expect(DOWNLOAD_RESPONSE_HEADERS['cache-control']).toContain('no-store');
  });
  it('allow-list is exactly pdf, png, jpeg, docx', () => expect([...ALLOWED_MIME_TYPES].sort()).toEqual(Object.values(MIME).sort()));
});

describe('request validation (stage 1)', () => {
  it('accepts each allowed type with a matching extension', () => {
    expect(validateUploadRequest(req('plan.pdf', MIME.pdf, 1000))).toMatchObject({ ok: true, policy: 'pdf' });
    expect(validateUploadRequest(req('scan.PNG', MIME.png, 1000))).toMatchObject({ ok: true, policy: 'png' });
    expect(validateUploadRequest(req('photo.jpg', MIME.jpeg, 1000))).toMatchObject({ ok: true, policy: 'jpeg' });
    expect(validateUploadRequest(req('photo.jpeg', MIME.jpeg, 1000))).toMatchObject({ ok: true, policy: 'jpeg' });
    expect(validateUploadRequest(req('report.docx', MIME.docx, 1000))).toMatchObject({ ok: true, policy: 'docx' });
  });
  it('enforces the 10 MB limit exactly', () => {
    expect(validateUploadRequest(req('a.pdf', MIME.pdf, MAX_UPLOAD_BYTES))).toMatchObject({ ok: true });
    expect(validateUploadRequest(req('a.pdf', MIME.pdf, MAX_UPLOAD_BYTES + 1))).toEqual({ ok: false, code: 'too_large' });
  });
  it('rejects empty, negative, fractional and non-finite sizes', () => {
    for (const size of [0, -1, 1.5, NaN, Infinity]) expect(validateUploadRequest(req('a.pdf', MIME.pdf, size))).toEqual({ ok: false, code: 'empty' });
  });
  it('rejects types not on the allow-list (executables, scripts, legacy office, archives, svg, html)', () => {
    for (const [name, mime] of [['a.exe', 'application/x-msdownload'], ['a.js', 'text/javascript'], ['a.doc', 'application/msword'], ['a.zip', 'application/zip'], ['a.svg', 'image/svg+xml'], ['a.html', 'text/html'], ['a.docm', 'application/vnd.ms-word.document.macroEnabled.12'], ['a.pdf', '']]) {
      expect(validateUploadRequest(req(name!, mime!, 100))).toEqual({ ok: false, code: 'type_not_allowed' });
    }
  });
  it('rejects extension/MIME mismatches and missing or double extensions that fool the type', () => {
    expect(validateUploadRequest(req('a.png', MIME.pdf, 100))).toEqual({ ok: false, code: 'extension_mismatch' });
    expect(validateUploadRequest(req('noextension', MIME.pdf, 100))).toEqual({ ok: false, code: 'extension_mismatch' });
    expect(validateUploadRequest(req('a.pdf.exe', MIME.pdf, 100))).toEqual({ ok: false, code: 'extension_mismatch' });
  });
  it('MIME matching is case-insensitive and trimmed', () => {
    expect(validateUploadRequest(req('a.pdf', ' Application/PDF ', 100))).toMatchObject({ ok: true });
  });
  it('rejects bad filenames', () => expect(validateUploadRequest(req('../a.pdf', MIME.pdf, 100))).toEqual({ ok: false, code: 'bad_filename' }));
});

describe('filename sanitisation and path traversal', () => {
  it.each([
    '../../etc/passwd',
    '..\\..\\windows\\system32',
    'a/b.pdf',
    'a\\b.pdf',
    '..',
    'a..b.pdf',
    '/absolute.pdf',
    'C:\\x.pdf',
    '％2e％2e／x.pdf', // full-width solidus normalises to "/" under NFKC
    '．．／x.pdf', // full-width dots and solidus
  ])('rejects traversal in %j', (name) => expect(sanitiseFilename(name)).toMatchObject({ ok: false, reason: 'traversal' }));
  it('rejects NUL and control characters', () => {
    for (const name of ['a\0.pdf', 'a\n.pdf', 'a\r.pdf', 'a\t.pdf', 'a\u007f.pdf']) expect(sanitiseFilename(name)).toMatchObject({ ok: false, reason: 'control_chars' });
  });
  it('rejects hidden files, reserved Windows names, empty and over-long names', () => {
    expect(sanitiseFilename('.htaccess')).toMatchObject({ ok: false, reason: 'hidden' });
    expect(sanitiseFilename('CON.pdf')).toMatchObject({ ok: false, reason: 'reserved' });
    expect(sanitiseFilename('nul')).toMatchObject({ ok: false, reason: 'reserved' });
    expect(sanitiseFilename('   ')).toMatchObject({ ok: false, reason: 'empty' });
    expect(sanitiseFilename('a'.repeat(97) + '.pdf')).toMatchObject({ ok: false, reason: 'too_long' });
  });
  it('replaces other unsafe characters instead of failing, and keeps the extension', () => {
    expect(sanitiseFilename('Plan <final> & "v2".pdf')).toEqual({ ok: true, name: 'Plan _final_ _ _v2_.pdf' });
    expect(sanitiseFilename('Zoë  report.pdf')).toEqual({ ok: true, name: 'Zoë report.pdf' });
    expect(sanitiseFilename('a;b|c$d.pdf')).toEqual({ ok: true, name: 'a_b_c_d.pdf' });
  });
  it('accepts a normal name unchanged', () => expect(sanitiseFilename('NDIS plan 2026 (v2).pdf')).toEqual({ ok: true, name: 'NDIS plan 2026 (v2).pdf' }));
  it('object keys are generated from the case ref and a UUID, never from the filename', () => {
    const key = buildObjectKey('AP-7K3M-9Q2');
    expect(key).toMatch(/^quarantine\/AP-7K3M-9Q2\/[0-9a-f-]{36}$/);
    expect(buildObjectKey('AP-7K3M-9Q2', '123e4567-e89b-12d3-a456-426614174000')).toBe('quarantine/AP-7K3M-9Q2/123e4567-e89b-12d3-a456-426614174000');
    expect(buildObjectKey('AP-7K3M-9Q2')).not.toBe(key);
  });
  it('refuses to build keys from unsafe case refs or upload ids', () => {
    expect(() => buildObjectKey('../x')).toThrow(UploadError);
    expect(() => buildObjectKey('AP-7K3M-9Q2', '../../etc')).toThrow(UploadError);
    expect(() => buildObjectKey('AP-7K3M-9Q2/..', '123e4567-e89b-12d3-a456-426614174000')).toThrow(UploadError);
  });
});

describe('magic-byte detection and content validation (stage 2)', () => {
  it('detects each allowed type from content only', () => {
    expect(detectType(PDF)).toBe('pdf');
    expect(detectType(PNG)).toBe('png');
    expect(detectType(JPEG)).toBe('jpeg');
    expect(detectType(docx())).toBe('docx');
  });
  it('rejects other content: executables, scripts, html, svg, gif, plain zip, empty, truncated signatures', () => {
    const MZ = new Uint8Array([0x4d, 0x5a, 0x90, 0x00]);
    const ELF = new Uint8Array([0x7f, 0x45, 0x4c, 0x46]);
    const text = (s: string) => new TextEncoder().encode(s);
    for (const bad of [MZ, ELF, text('#!/bin/sh\n'), text('<html><script>alert(1)</script>'), text('<svg xmlns="http://www.w3.org/2000/svg"/>'), text('GIF89a'), new Uint8Array(0), new Uint8Array([0x25, 0x50, 0x44]), new Uint8Array([0x89, 0x50, 0x4e, 0x47])]) {
      expect(detectType(bad)).toBeNull();
    }
  });
  it('a ZIP that is not a docx (no [Content_Types].xml / word/) is rejected', () => {
    expect(detectType(docx(['readme.txt']))).toBeNull();
    expect(detectType(docx(['[Content_Types].xml']))).toBeNull(); // e.g. xlsx/pptx lack word/
    expect(detectType(docx(['[Content_Types].xml', 'xl/workbook.xml']))).toBeNull();
  });
  it('accepts matching content', () => {
    expect(validateUploadContent(PDF, req('a.pdf', MIME.pdf, PDF.length))).toEqual({ ok: true, type: 'pdf' });
    const d = docx();
    expect(validateUploadContent(d, req('a.docx', MIME.docx, d.length))).toEqual({ ok: true, type: 'docx' });
  });
  it('rejects content that lies about its type (an exe or html renamed .pdf)', () => {
    const exe = new Uint8Array([0x4d, 0x5a, 0x90, 0, 3, 0, 0, 0]);
    expect(validateUploadContent(exe, req('a.pdf', MIME.pdf, exe.length))).toEqual({ ok: false, code: 'content_mismatch' });
    const html = new TextEncoder().encode('<html></html>');
    expect(validateUploadContent(html, req('a.png', MIME.png, html.length))).toEqual({ ok: false, code: 'content_mismatch' });
  });
  it('rejects a real PNG declared as a PDF, and a size that differs from the declared size', () => {
    expect(validateUploadContent(PNG, req('a.pdf', MIME.pdf, PNG.length))).toEqual({ ok: false, code: 'content_mismatch' });
    expect(validateUploadContent(PDF, req('a.pdf', MIME.pdf, PDF.length + 1))).toEqual({ ok: false, code: 'content_mismatch' });
  });
  it('rejects empty and oversized content', () => {
    expect(validateUploadContent(new Uint8Array(0), req('a.pdf', MIME.pdf, 0))).toEqual({ ok: false, code: 'empty' });
    expect(validateUploadContent(new Uint8Array(MAX_UPLOAD_BYTES + 1), req('a.pdf', MIME.pdf, MAX_UPLOAD_BYTES + 1))).toEqual({ ok: false, code: 'too_large' });
  });
});

describe('quarantine → scan → release state machine', () => {
  const path: Array<[DocumentState, DocumentEvent, DocumentState]> = [
    ['awaitingUpload', 'uploaded', 'quarantined'],
    ['awaitingUpload', 'uploadExpired', 'expired'],
    ['quarantined', 'scanStarted', 'scanning'],
    ['quarantined', 'contentRejected', 'rejected'],
    ['scanning', 'scanClean', 'released'],
    ['scanning', 'scanInfected', 'rejected'],
    ['scanning', 'scanError', 'scanFailed'],
    ['scanFailed', 'retryScan', 'scanning'],
    ['scanFailed', 'contentRejected', 'rejected'],
  ];
  it.each(path)('%s --%s--> %s', (from, ev, to) => expect(transitionDocument(from, ev)).toBe(to));

  it('every transition not in the table throws (exhaustive)', () => {
    const events: DocumentEvent[] = ['uploaded', 'scanStarted', 'scanClean', 'scanInfected', 'scanError', 'retryScan', 'contentRejected', 'uploadExpired'];
    const legal = new Set(path.map(([f, e]) => `${f}|${e}`));
    for (const s of DOCUMENT_STATES) for (const e of events) {
      if (legal.has(`${s}|${e}`)) continue;
      expect(() => transitionDocument(s, e), `${s} + ${e}`).toThrow(UploadError);
    }
  });
  it('cannot skip scanning: quarantined cannot be released directly', () => {
    expect(() => transitionDocument('quarantined', 'scanClean')).toThrow(UploadError);
    expect(() => transitionDocument('awaitingUpload', 'scanClean')).toThrow(UploadError);
  });
  it('released, rejected and expired are terminal', () => {
    for (const s of ['released', 'rejected', 'expired'] as const) for (const e of ['uploaded', 'scanStarted', 'scanClean', 'retryScan'] as const) expect(() => transitionDocument(s, e)).toThrow();
  });
  it('only released documents are downloadable', () => {
    for (const s of DOCUMENT_STATES) expect(canDownload(s)).toBe(s === 'released');
  });
});

describe('scanner and URL issuing', () => {
  const storage = () => {
    const calls: Array<{ kind: string; key: string; ttl: number; extra?: unknown }> = [];
    const s: ObjectStorage = {
      createUploadUrl: async (key, o) => (calls.push({ kind: 'up', key, ttl: o.ttlSeconds, extra: o }), `https://storage.invalid/up/${key}`),
      createDownloadUrl: async (key, o) => (calls.push({ kind: 'down', key, ttl: o.ttlSeconds }), `https://storage.invalid/down/${key}`),
    };
    return { s, calls };
  };
  const scanner = (verdict: 'clean' | 'infected' | 'error' | 'throw'): MalwareScanner => ({ scan: async () => (verdict === 'throw' ? Promise.reject(new Error('scanner down')) : { verdict }) });
  const doc = (state: DocumentState) => ({ objectKey: 'quarantine/AP-7K3M-9Q2/123e4567-e89b-12d3-a456-426614174000', state });

  it('clean scan releases; infected rejects; scanner error or crash → scanFailed (never released)', async () => {
    expect(await runScan(scanner('clean'), doc('quarantined'))).toBe('released');
    expect(await runScan(scanner('infected'), doc('quarantined'))).toBe('rejected');
    expect(await runScan(scanner('error'), doc('quarantined'))).toBe('scanFailed');
    expect(await runScan(scanner('throw'), doc('quarantined'))).toBe('scanFailed');
  });
  it('a failed scan can be retried', async () => {
    expect(await runScan(scanner('clean'), doc('scanFailed'))).toBe('released');
  });
  it('cannot scan a document that was never uploaded or is already released', async () => {
    await expect(runScan(scanner('clean'), doc('awaitingUpload'))).rejects.toBeInstanceOf(UploadError);
    await expect(runScan(scanner('clean'), doc('released'))).rejects.toBeInstanceOf(UploadError);
  });
  it('refuses download URLs for every state except released', async () => {
    const { s, calls } = storage();
    for (const state of DOCUMENT_STATES.filter((x) => x !== 'released')) await expect(issueDownloadUrl(s, doc(state))).rejects.toMatchObject({ code: 'not_released' });
    expect(calls).toEqual([]);
    expect(await issueDownloadUrl(s, doc('released'))).toContain('/down/');
  });
  it('download TTL defaults to and is capped at 60 seconds', async () => {
    const { s, calls } = storage();
    await issueDownloadUrl(s, doc('released'));
    await issueDownloadUrl(s, doc('released'), 3600);
    await issueDownloadUrl(s, doc('released'), 10);
    await issueDownloadUrl(s, doc('released'), -5);
    await issueDownloadUrl(s, doc('released'), NaN);
    expect(calls.map((c) => c.ttl)).toEqual([60, 60, 10, 60, 60]);
  });
  it('upload URLs are only issued for valid requests, capped at 300 s, size-limited and type-bound', async () => {
    const { s, calls } = storage();
    const key = buildObjectKey('AP-7K3M-9Q2');
    await issueUploadUrl(s, req('plan.pdf', MIME.pdf, 5000), key, 99999);
    expect(calls[0]).toMatchObject({ kind: 'up', ttl: 300, extra: { maxBytes: MAX_UPLOAD_BYTES, contentType: MIME.pdf } });
    await expect(issueUploadUrl(s, req('run.exe', 'application/x-msdownload', 5000), key)).rejects.toMatchObject({ code: 'type_not_allowed' });
    await expect(issueUploadUrl(s, req('big.pdf', MIME.pdf, MAX_UPLOAD_BYTES + 1), key)).rejects.toMatchObject({ code: 'too_large' });
    await expect(issueUploadUrl(s, req('../x.pdf', MIME.pdf, 100), key)).rejects.toMatchObject({ code: 'bad_filename' });
    expect(calls).toHaveLength(1);
  });
});
