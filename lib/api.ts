import ky from 'ky';
import { evidenceResponseSchema } from './schema';
import type { VersionChange, VersionChangeDraft } from './methodology';

const client = ky.create({ timeout: 10_000, retry: { limit: 1 } });

export async function fetchEvidence() {
  const payload = await client.get('/api/evidence').json<unknown>();
  return evidenceResponseSchema.parse(payload);
}

export async function submitEvidenceCorrection(payload: { recordId: string; value: number; reason: string; actor: string }) {
  const response = await client.post('/api/evidence', { json: payload }).json<{ accepted: boolean; revision: number; recordedAt: string }>();
  return response;
}

export type VersionChangeResponse = {
  accepted: boolean;
  idempotent?: boolean;
  conflict?: boolean;
  latestBatchVersion?: number;
  diff?: string[];
  change?: VersionChange;
  batchVersion?: number;
  pendingRecordIds?: string[];
  message?: string;
};

// 换版确认：携带批次版本快照与幂等令牌。409 表示后到者冲突，500 表示写入失败可恢复。
export async function submitVersionChange(payload: {
  draft: VersionChangeDraft;
  batchVersion: number;
  clientToken: string;
  actor: string;
  forceFail?: boolean;
}): Promise<{ status: number; data: VersionChangeResponse }> {
  const response = await client.post('/api/evidence', {
    json: { kind: 'version-change', ...payload },
    throwHttpErrors: false,
    retry: { limit: 0 }
  });
  const data = (await response.json()) as VersionChangeResponse;
  return { status: response.status, data };
}

export type IssuanceResponse = {
  accepted: boolean;
  blockers?: string[];
  batchId?: string;
  submittedAt?: string;
};

// 签发提交：服务端只受理完整批次，不完整返回 422 与阻塞项。
export async function submitIssuance(payload: { batchId: string; blockers: string[] }): Promise<{ status: number; data: IssuanceResponse }> {
  const response = await client.post('/api/evidence', {
    json: { kind: 'issuance', ...payload },
    throwHttpErrors: false,
    retry: { limit: 0 }
  });
  const data = (await response.json()) as IssuanceResponse;
  return { status: response.status, data };
}
