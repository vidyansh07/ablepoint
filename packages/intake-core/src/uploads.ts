import { randomUUID } from 'node:crypto';

/**
 * Upload validation and document lifecycle (docs/05 §6). Interfaces only for storage and scanning:
 * no object store or scanner adapter exists yet.
 */

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const UPLOAD_URL_TTL_SECONDS = 300;
export const DOWNLOAD_URL_TTL_SECONDS = 60;
export const MAX_FILENAME_LENGTH = 100;

/** Headers every download response must carry (no CDN/browser caching, no inline rendering). */
export const DOWNLOAD_RESPONSE_HEADERS = {
  'cache-control': 'private, no-store',
  'content-disposition': 'attachment',
  'x-content-type-options': 'nosniff',
} as const;

export type DetectedType = 'pdf' | 'png' | 'jpeg' | 'docx';

interface TypePolicy {
  type: DetectedType;
  mime: string;
  extensions: readonly string[];
}

/**
 * Allow-list. Policy notes:
 *  - pdf/png/jpeg: leading magic bytes.
 *  - docx: ZIP local-file-header magic (PK\x03\x04) PLUS a minimal structure heuristic: the archive must
 *    contain the entry names `[Content_Types].xml` and `word/` (entry names are stored uncompressed in
 *    local and central headers). This is a heuristic, not proof: a crafted ZIP can satisfy it. The malware
 *    scan and viewer sandboxing are the real controls. Legacy .doc, generic .zip and macro formats are rejected.
 */
const TYPE_POLICIES: readonly TypePolicy[] = [
  { type: 'pdf', mime: 'application/pdf', extensions: ['pdf'] },
  { type: 'png', mime: 'image/png', extensions: ['png'] },
  { type: 'jpeg', mime: 'image/jpeg', extensions: ['jpg', 'jpeg'] },
  { type: 'docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', extensions: ['docx'] },
];

export const ALLOWED_MIME_TYPES: readonly string[] = TYPE_POLICIES.map((p) => p.mime);

export type UploadErrorCode =
  | 'empty'
  | 'too_large'
  | 'bad_filename'
  | 'type_not_allowed'
  | 'extension_mismatch'
  | 'content_mismatch'
  | 'not_released'
  | 'bad_transition';

export class UploadError extends Error {
  constructor(readonly code: UploadErrorCode) {
    super(`upload error: ${code}`);
    this.name = 'UploadError';
  }
}

// ---------- filenames ----------

const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;

export type FilenameResult = { ok: true; name: string } | { ok: false; reason: 'traversal' | 'control_chars' | 'reserved' | 'empty' | 'too_long' | 'hidden' };

/**
 * Traversal and control characters are REJECTED (not silently repaired): a name containing `/`, `\`,
 * `..` or a NUL is an attack or a broken client. Other unsafe characters are replaced with `_`.
 * The sanitised name is display/metadata only: object keys never use it (see `buildObjectKey`).
 */
export function sanitiseFilename(raw: string): FilenameResult {
  const nfkc = raw.normalize('NFKC').trim();
  if (nfkc === '') return { ok: false, reason: 'empty' };
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(nfkc)) return { ok: false, reason: 'control_chars' };
  if (/[\\/]/.test(nfkc) || nfkc.includes('..')) return { ok: false, reason: 'traversal' };
  if (nfkc.startsWith('.')) return { ok: false, reason: 'hidden' };
  const cleaned = nfkc.replace(/[^\p{L}\p{N} ._()-]/gu, '_').replace(/\s+/g, ' ');
  if (WINDOWS_RESERVED.test(cleaned)) return { ok: false, reason: 'reserved' };
  if (cleaned.length > MAX_FILENAME_LENGTH) return { ok: false, reason: 'too_long' };
  return { ok: true, name: cleaned };
}

/** Object keys are generated, never derived from user input. */
export function buildObjectKey(caseRef: string, uploadId: string = randomUUID()): string {
  if (!/^AP-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{3}$/.test(caseRef)) throw new UploadError('bad_filename');
  if (!/^[0-9a-f-]{36}$/.test(uploadId)) throw new UploadError('bad_filename');
  return `quarantine/${caseRef}/${uploadId}`;
}

// ---------- request & content validation ----------

const extensionOf = (name: string): string => {
  const i = name.lastIndexOf('.');
  return i < 0 ? '' : name.slice(i + 1).toLowerCase();
};

export interface UploadRequest {
  filename: string;
  declaredMime: string;
  sizeBytes: number;
}

export type RequestValidation = { ok: true; filename: string; policy: DetectedType } | { ok: false; code: UploadErrorCode };

/** Stage 1: before issuing an upload URL (no bytes exist yet). */
export function validateUploadRequest(req: UploadRequest): RequestValidation {
  if (!Number.isInteger(req.sizeBytes) || req.sizeBytes <= 0) return { ok: false, code: 'empty' };
  if (req.sizeBytes > MAX_UPLOAD_BYTES) return { ok: false, code: 'too_large' };
  const name = sanitiseFilename(req.filename);
  if (!name.ok) return { ok: false, code: 'bad_filename' };
  const policy = TYPE_POLICIES.find((p) => p.mime === req.declaredMime.toLowerCase().trim());
  if (!policy) return { ok: false, code: 'type_not_allowed' };
  if (!policy.extensions.includes(extensionOf(name.name))) return { ok: false, code: 'extension_mismatch' };
  return { ok: true, filename: name.name, policy: policy.type };
}

const startsWith = (buf: Uint8Array, sig: readonly number[]): boolean => buf.length >= sig.length && sig.every((b, i) => buf[i] === b);

function includesAscii(buf: Uint8Array, needle: string): boolean {
  return Buffer.from(buf.buffer, buf.byteOffset, buf.byteLength).includes(needle, 0, 'latin1');
}

/** Detect the type from content bytes only. Returns null if not on the allow-list. */
export function detectType(buf: Uint8Array): DetectedType | null {
  if (startsWith(buf, [0x25, 0x50, 0x44, 0x46, 0x2d])) return 'pdf'; // %PDF-
  if (startsWith(buf, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'png';
  if (startsWith(buf, [0xff, 0xd8, 0xff])) return 'jpeg';
  if (startsWith(buf, [0x50, 0x4b, 0x03, 0x04]) && includesAscii(buf, '[Content_Types].xml') && includesAscii(buf, 'word/')) return 'docx';
  return null;
}

/** Stage 2: once bytes are in quarantine (or at least the head and tail of the file). */
export function validateUploadContent(content: Uint8Array, req: UploadRequest): { ok: true; type: DetectedType } | { ok: false; code: UploadErrorCode } {
  if (content.length === 0) return { ok: false, code: 'empty' };
  if (content.length > MAX_UPLOAD_BYTES) return { ok: false, code: 'too_large' };
  const pre = validateUploadRequest(req);
  if (!pre.ok) return pre;
  if (content.length !== req.sizeBytes) return { ok: false, code: 'content_mismatch' };
  const detected = detectType(content);
  if (!detected || detected !== pre.policy) return { ok: false, code: 'content_mismatch' };
  return { ok: true, type: detected };
}

// ---------- quarantine → scan → release ----------

export const DOCUMENT_STATES = ['awaitingUpload', 'quarantined', 'scanning', 'released', 'rejected', 'scanFailed', 'expired'] as const;
export type DocumentState = (typeof DOCUMENT_STATES)[number];
export type DocumentEvent = 'uploaded' | 'scanStarted' | 'scanClean' | 'scanInfected' | 'scanError' | 'retryScan' | 'contentRejected' | 'uploadExpired';

const NEXT: Record<DocumentState, Partial<Record<DocumentEvent, DocumentState>>> = {
  awaitingUpload: { uploaded: 'quarantined', uploadExpired: 'expired' },
  quarantined: { scanStarted: 'scanning', contentRejected: 'rejected' },
  scanning: { scanClean: 'released', scanInfected: 'rejected', scanError: 'scanFailed' },
  scanFailed: { retryScan: 'scanning', contentRejected: 'rejected' },
  released: {},
  rejected: {},
  expired: {},
};

export function transitionDocument(state: DocumentState, event: DocumentEvent): DocumentState {
  const next = NEXT[state][event];
  if (!next) throw new UploadError('bad_transition');
  return next;
}

/** Only a scanned-clean, released document may ever be downloaded. */
export const canDownload = (state: DocumentState): boolean => state === 'released';

export interface DocumentLike {
  objectKey: string;
  state: DocumentState;
}

export interface ObjectStorage {
  /** Pre-signed, single-object, size- and type-constrained upload URL into the quarantine area. */
  createUploadUrl(key: string, opts: { maxBytes: number; contentType: string; ttlSeconds: number }): Promise<string>;
  /** Pre-signed download URL for a released object; the adapter must also set the headers in DOWNLOAD_RESPONSE_HEADERS. */
  createDownloadUrl(key: string, opts: { ttlSeconds: number }): Promise<string>;
}

export interface MalwareScanner {
  scan(key: string): Promise<{ verdict: 'clean' | 'infected' | 'error' }>;
}

const clampTtl = (requested: number | undefined, max: number): number => {
  const v = requested ?? max;
  return Number.isFinite(v) && v > 0 ? Math.min(Math.floor(v), max) : max;
};

export async function issueUploadUrl(storage: ObjectStorage, req: UploadRequest, key: string, ttlSeconds?: number): Promise<string> {
  const v = validateUploadRequest(req);
  if (!v.ok) throw new UploadError(v.code);
  return storage.createUploadUrl(key, { maxBytes: MAX_UPLOAD_BYTES, contentType: req.declaredMime.toLowerCase().trim(), ttlSeconds: clampTtl(ttlSeconds, UPLOAD_URL_TTL_SECONDS) });
}

/** Authorisation (`can(..., 'read', document)`) is the caller's job; this enforces lifecycle and TTL. */
export async function issueDownloadUrl(storage: ObjectStorage, doc: DocumentLike, ttlSeconds?: number): Promise<string> {
  if (!canDownload(doc.state)) throw new UploadError('not_released');
  return storage.createDownloadUrl(doc.objectKey, { ttlSeconds: clampTtl(ttlSeconds, DOWNLOAD_URL_TTL_SECONDS) });
}

/** Drive one scan: quarantined (or scanFailed, as a retry) → scanning → released | rejected | scanFailed. */
export async function runScan(scanner: MalwareScanner, doc: DocumentLike): Promise<DocumentState> {
  let state = transitionDocument(doc.state, doc.state === 'scanFailed' ? 'retryScan' : 'scanStarted');
  let verdict: 'clean' | 'infected' | 'error';
  try {
    verdict = (await scanner.scan(doc.objectKey)).verdict;
  } catch {
    verdict = 'error';
  }
  state = transitionDocument(state, verdict === 'clean' ? 'scanClean' : verdict === 'infected' ? 'scanInfected' : 'scanError');
  return state;
}
