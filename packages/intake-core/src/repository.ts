import type { Enquiry } from '@ablepoint/schemas';
import type { AuditEvent } from './ports';
import { assertSafeAuditMeta } from './memory-guards';
import type { DocumentState } from './uploads';

export type EnquiryStatus = 'new' | 'contacted' | 'intakeCall' | 'serviceAgreement' | 'active' | 'lost';

export interface EnquiryRecord {
  caseRef: string;
  createdAt: string;
  status: EnquiryStatus;
  /** C2: name and contact details. */
  enquirer: { name: string; phoneE164?: string; email?: string };
  referrerType: Enquiry['referrerType'];
  services: Enquiry['services'];
  region: Enquiry['region'];
  contactMethod: Enquiry['contactMethod'];
  bestTime?: string;
  consent: { given: true; noticeVersion: string; at: string };
  idempotencyKeyHash: string;
  assignedTo: string[];
}

export interface DocumentRecord {
  id: string;
  caseRef: string;
  objectKey: string;
  originalFilename: string;
  mime: string;
  sizeBytes: number;
  sha256?: string;
  state: DocumentState;
  uploadedBy: string;
  createdAt: string;
}

/** C3 fields are stored only as encryption envelopes (see crypto.ts / profile.ts). */
export interface ParticipantProfileRecord {
  caseRef: string;
  displayName?: string;
  communicationPreferences?: string;
  ndisNumberEnc?: string;
  dobEnc?: string;
  supportNeedsEnc?: string;
  updatedAt: string;
}

export type CreateEnquiryResult = { status: 'created' } | { status: 'caseRefCollision' };

/**
 * Persistence port. Every mutating method takes the audit event so an implementation can write
 * record + audit in ONE transaction (the in-memory double does; a Postgres adapter must).
 * Authorisation is NOT done here: call `can()` first.
 */
export interface Repository {
  createEnquiry(record: EnquiryRecord, audit: AuditEvent): Promise<CreateEnquiryResult>;
  getEnquiry(caseRef: string): Promise<EnquiryRecord | undefined>;
  assignEnquiry(caseRef: string, staffId: string, audit: AuditEvent): Promise<boolean>;
  addDocument(doc: DocumentRecord, audit: AuditEvent): Promise<void>;
  getDocument(id: string): Promise<DocumentRecord | undefined>;
  setDocumentState(id: string, state: DocumentState, audit: AuditEvent): Promise<boolean>;
  saveParticipantProfile(profile: ParticipantProfileRecord, audit: AuditEvent): Promise<void>;
  getParticipantProfile(caseRef: string): Promise<ParticipantProfileRecord | undefined>;
}

/**
 * TEST DOUBLE — NOT A DATABASE. Process memory only: no durability, no encryption at rest, no RLS,
 * no concurrency control beyond JS single-threading. Exists so the core can be tested without a
 * database. Never wire this into a deployed service.
 */
export class InMemoryRepository implements Repository {
  private readonly enquiries = new Map<string, EnquiryRecord>();
  private readonly documents = new Map<string, DocumentRecord>();
  private readonly profiles = new Map<string, ParticipantProfileRecord>();
  private readonly audit: AuditEvent[] = [];

  async createEnquiry(record: EnquiryRecord, audit: AuditEvent): Promise<CreateEnquiryResult> {
    assertSafeAuditMeta(audit);
    if (this.enquiries.has(record.caseRef)) return { status: 'caseRefCollision' };
    this.enquiries.set(record.caseRef, structuredClone(record));
    this.audit.push(Object.freeze(structuredClone(audit)));
    return { status: 'created' };
  }

  async getEnquiry(caseRef: string): Promise<EnquiryRecord | undefined> {
    const r = this.enquiries.get(caseRef);
    return r ? structuredClone(r) : undefined;
  }

  async assignEnquiry(caseRef: string, staffId: string, audit: AuditEvent): Promise<boolean> {
    assertSafeAuditMeta(audit);
    const r = this.enquiries.get(caseRef);
    if (!r) return false;
    if (!r.assignedTo.includes(staffId)) r.assignedTo.push(staffId);
    this.audit.push(Object.freeze(structuredClone(audit)));
    return true;
  }

  async addDocument(doc: DocumentRecord, audit: AuditEvent): Promise<void> {
    assertSafeAuditMeta(audit);
    if (this.documents.has(doc.id)) throw new Error('duplicate document id');
    this.documents.set(doc.id, structuredClone(doc));
    this.audit.push(Object.freeze(structuredClone(audit)));
  }

  async getDocument(id: string): Promise<DocumentRecord | undefined> {
    const d = this.documents.get(id);
    return d ? structuredClone(d) : undefined;
  }

  async setDocumentState(id: string, state: DocumentState, audit: AuditEvent): Promise<boolean> {
    assertSafeAuditMeta(audit);
    const d = this.documents.get(id);
    if (!d) return false;
    d.state = state;
    this.audit.push(Object.freeze(structuredClone(audit)));
    return true;
  }

  async saveParticipantProfile(profile: ParticipantProfileRecord, audit: AuditEvent): Promise<void> {
    assertSafeAuditMeta(audit);
    this.profiles.set(profile.caseRef, structuredClone(profile));
    this.audit.push(Object.freeze(structuredClone(audit)));
  }

  async getParticipantProfile(caseRef: string): Promise<ParticipantProfileRecord | undefined> {
    const p = this.profiles.get(caseRef);
    return p ? structuredClone(p) : undefined;
  }

  // ---- test helpers (not part of the Repository port) ----
  get auditEvents(): readonly AuditEvent[] {
    return this.audit.map((e) => structuredClone(e));
  }
  get enquiryCount(): number {
    return this.enquiries.size;
  }
  allEnquiries(): EnquiryRecord[] {
    return [...this.enquiries.values()].map((e) => structuredClone(e));
  }
}
