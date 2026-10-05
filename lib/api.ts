import ky from 'ky';
import { evidenceResponseSchema } from './schema';
import { methodologySnapshotSchema, type ConfirmResult, type MethodologySnapshot } from './methodology-schema';

const client = ky.create({ timeout: 10_000, retry: { limit: 1 } });

export async function fetchEvidence() {
  const payload = await client.get('/api/evidence').json<unknown>();
  return evidenceResponseSchema.parse(payload);
}

export async function submitEvidenceCorrection(payload: { recordId: string; value: number; reason: string; actor: string }) {
  const response = await client.post('/api/evidence', { json: payload }).json<{ accepted: boolean; revision: number; recordedAt: string }>();
  return response;
}

// —— 方法学期中换版 ——

export async function fetchMethodology(): Promise<MethodologySnapshot> {
  const payload = await client.get('/api/methodology').json<unknown>();
  return methodologySnapshotSchema.parse(payload);
}

export async function writeFactorAssignment(input: {
  batchId: string;
  recordId: string;
  clientToken: string;
  fail?: boolean;
}) {
  const payload = await client
    .post('/api/methodology', { json: { action: 'write', ...input } })
    .json<{ status: 'confirmed' | 'duplicate' | 'failed'; sequence?: number; snapshot: unknown }>();
  return { ...payload, snapshot: methodologySnapshotSchema.parse(payload.snapshot) };
}

export async function recoverPendingWrites(batchId: string, failRecordIds: string[] = []) {
  const payload = await client
    .post('/api/methodology', { json: { action: 'recover', batchId, failRecordIds } })
    .json<{ recovered: { recordId: string; status: string; attempts: number; sequence?: number }[]; snapshot: unknown }>();
  return { ...payload, snapshot: methodologySnapshotSchema.parse(payload.snapshot) };
}

export async function confirmMethodologySwitch(input: {
  batchId: string;
  expectedSequence: number;
  verifier: string;
}): Promise<ConfirmResult> {
  const payload = await client.post('/api/methodology', { json: { action: 'confirm', ...input } }).json<Record<string, unknown>>();
  const snapshot = methodologySnapshotSchema.parse(payload.snapshot);
  if (payload.ok === true) {
    return {
      ok: true,
      sequence: payload.sequence as number,
      confirmedVersionId: payload.confirmedVersionId as 'CMS-052-V02',
      confirmedAt: payload.confirmedAt as string,
      snapshot
    };
  }
  return {
    ok: false,
    code: payload.code as Exclude<ConfirmResult, { ok: true }>['code'],
    latestSequence: payload.latestSequence as number,
    latestVersionId: (payload.latestVersionId as 'CMS-052-V01' | 'CMS-052-V02' | null) ?? null,
    diffs: methodologySnapshotSchema.shape.batches.element.shape.diffs.parse(payload.diffs),
    message: payload.message as string,
    snapshot
  };
}

export async function backfillLegacyRecords(batchId: string) {
  const payload = await client
    .post('/api/methodology', { json: { action: 'backfill', batchId } })
    .json<{ reasons: { recordId: string; reason: string }[]; snapshot: unknown }>();
  return { ...payload, snapshot: methodologySnapshotSchema.parse(payload.snapshot) };
}

export async function importFieldData(batchId: string) {
  const payload = await client
    .post('/api/methodology', { json: { action: 'importFieldData', batchId } })
    .json<{ snapshot: unknown }>();
  return methodologySnapshotSchema.parse(payload.snapshot);
}

export async function resetMethodology() {
  const payload = await client.post('/api/methodology', { json: { action: 'reset' } }).json<{ snapshot: unknown }>();
  return methodologySnapshotSchema.parse(payload.snapshot);
}
