// 换版确认状态机（模块级内存态，模拟服务端持久化）
//
// 规则落地：
// 1. 确认带“当前批次版本” expectedSequence：两位核验员同时提交时，先到者把 sequence 进位，
//    后到者携带旧版本号提交 -> 409，返回最新版本与未处理差异。
// 2. 写入失败后只保留“未确认记录”（pendingWrites，不含版本号）；恢复重试时从未确认记录
//    继续提交，凭 clientToken 幂等去重，不会重复生成版本。
// 3. 整批确认成功后批次版本才进位，且批次必须完整。

import {
  batches,
  factorEntry,
  records,
  resetDataset,
  versionForDate,
  type BatchInfo,
  type FactorKind,
  type MethodologyVersionId,
  type RecordRow
} from './methodology-data';

type ConfirmedRow = {
  recordId: string;
  occurredOn: string;
  appliedVersion: MethodologyVersionId;
  factor: number;
  factorUnit: string;
  factorBasis: string;
  backfilled: boolean;
};

export type VersionDiff = {
  recordId: string;
  occurredOn: string;
  currentVersion: MethodologyVersionId;
  expectedVersion: MethodologyVersionId;
  currentFactor: number;
  expectedFactor: number;
  reason: string;
};

export type PendingWrite = {
  recordId: string;
  occurredOn: string;
  kind: FactorKind;
  backfill: boolean;
  attempts: number;
  lastError: string | null;
};

type BatchState = {
  info: BatchInfo;
  confirmedVersionId: MethodologyVersionId | null; // 批次已确认成立的版本（先到者）
  confirmedBy: string | null;
  confirmedAt: string | null;
  confirmedRows: ConfirmedRow[];
  pendingWrites: PendingWrite[]; // 未确认记录：写入失败后从这里恢复
  writeLog: { clientToken: string; recordId: string; sequence: number }[]; // 幂等台账
};

const state = new Map<string, BatchState>();

function seed() {
  for (const info of batches) {
    const rows = records.filter((row) => row.batchId === info.id);
    state.set(info.id, {
      info,
      confirmedVersionId: null,
      confirmedBy: null,
      confirmedAt: null,
      confirmedRows: [],
      // 初始即把每条记录的版本确认登记为“未确认写入”，尚无版本号
      pendingWrites: rows.map((row) => ({
        recordId: row.id,
        occurredOn: row.occurredOn,
        kind: row.kind,
        backfill: row.id.startsWith('ACT-02'),
        attempts: 0,
        lastError: null
      })),
      writeLog: []
    });
  }
}
seed();

function findRecord(id: string): RecordRow {
  const row = records.find((item) => item.id === id);
  if (!row) throw new Error(`未知记录 ${id}`);
  return row;
}

// 当前批次中“版本/因子与发生日期适用版本不一致”的差异
export function unresolvedDiffs(batch: BatchState): VersionDiff[] {
  return batch.pendingWrites
    .map((pending) => {
      const row = findRecord(pending.recordId);
      const expectedVersion = versionForDate(pending.occurredOn);
      const expected = factorEntry(expectedVersion, pending.kind);
      if (row.methodologyVersion === expectedVersion && row.factor === expected.value) return null;
      return {
        recordId: pending.recordId,
        occurredOn: pending.occurredOn,
        currentVersion: (row.methodologyVersion ?? 'CMS-052-V01'),
        expectedVersion,
        currentFactor: row.factor,
        expectedFactor: expected.value,
        reason: row.methodologyVersion === null
          ? '旧数据缺少方法学版本，需回填首版并复核'
          : expectedVersion === 'CMS-052-V02'
            ? '发生日期在换版日后，应按 V02 新因子计算'
            : '发生日期在换版日前，保留 V01 原因子，不整批套新因子'
      } satisfies VersionDiff;
    })
    .filter((item): item is VersionDiff => item !== null);
}

export type Snapshot = {
  batches: ReturnType<typeof snapshotBatch>[];
};

function snapshotBatch(batch: BatchState) {
  return {
    ...batch.info,
    confirmedVersionId: batch.confirmedVersionId,
    confirmedBy: batch.confirmedBy,
    confirmedAt: batch.confirmedAt,
    pendingCount: batch.pendingWrites.length,
    pendingWrites: batch.pendingWrites,
    confirmedRows: batch.confirmedRows,
    diffs: unresolvedDiffs(batch)
  };
}

export function snapshot(): Snapshot {
  return { batches: [...state.values()].map(snapshotBatch) };
}

// 单条未确认记录的写入。failRecordIds 用于演示写入失败：标记的记录会落到未确认区。
export function applyWrite(input: {
  batchId: string;
  recordId: string;
  clientToken: string;
  fail?: boolean;
}): { status: 'confirmed' | 'duplicate' | 'failed'; sequence?: number } {
  const batch = state.get(input.batchId);
  if (!batch) throw new Error(`未知批次 ${input.batchId}`);

  // 幂等：同一 clientToken 重试，直接返回已登记结果，不重复生成版本
  const seen = batch.writeLog.find((entry) => entry.clientToken === input.clientToken);
  if (seen) {
    return { status: 'duplicate', sequence: seen.sequence };
  }

  const pending = batch.pendingWrites.find((item) => item.recordId === input.recordId);
  if (!pending) {
    // 记录已确认且本 token 未登记：不补登版本，按幂等跳过处理
    return { status: 'duplicate' };
  }

  pending.attempts += 1;
  if (input.fail) {
    pending.lastError = '写入失败：服务端暂存未确认记录，等待恢复重试';
    return { status: 'failed' };
  }

  const row = findRecord(input.recordId);
  const appliedVersion = versionForDate(pending.occurredOn);
  const factor = factorEntry(appliedVersion, pending.kind);
  row.methodologyVersion = appliedVersion;
  row.factor = factor.value;
  row.factorUnit = factor.unit;
  row.factorBasis = factor.basis;

  const sequence = batch.info.sequence + batch.confirmedRows.length + 1;
  batch.writeLog.push({ clientToken: input.clientToken, recordId: input.recordId, sequence });
  batch.confirmedRows.push({
    recordId: input.recordId,
    occurredOn: pending.occurredOn,
    appliedVersion,
    factor: factor.value,
    factorUnit: factor.unit,
    factorBasis: factor.basis,
    backfilled: pending.backfill
  });
  batch.pendingWrites = batch.pendingWrites.filter((item) => item.recordId !== input.recordId);
  return { status: 'confirmed', sequence };
}

export type ConfirmResult =
  | { ok: true; sequence: number; confirmedVersionId: MethodologyVersionId; confirmedAt: string }
  | {
      ok: false;
      code: 'version_conflict' | 'incomplete_batch' | 'pending_writes' | 'already_confirmed';
      latestSequence: number;
      latestVersionId: MethodologyVersionId | null;
      diffs: VersionDiff[];
      message: string;
    };

// 整批换版确认：携带当前批次版本做乐观锁
export function confirmBatch(input: {
  batchId: string;
  expectedSequence: number;
  verifier: string;
}): ConfirmResult {
  const batch = state.get(input.batchId);
  if (!batch) throw new Error(`未知批次 ${input.batchId}`);

  // 已被先到者确认成立：后到者看到最新版本
  if (batch.confirmedVersionId) {
    return {
      ok: false,
      code: 'already_confirmed',
      latestSequence: batch.info.sequence,
      latestVersionId: batch.confirmedVersionId,
      diffs: unresolvedDiffs(batch),
      message: `批次版本已由 ${batch.confirmedBy} 先确认成立（${batch.confirmedVersionId}），你看到的是最新版本与剩余差异`
    };
  }

  // 乐观锁：批次版本不匹配说明期间已有提交进位
  if (input.expectedSequence !== batch.info.sequence) {
    return {
      ok: false,
      code: 'version_conflict',
      latestSequence: batch.info.sequence,
      latestVersionId: batch.confirmedVersionId,
      diffs: unresolvedDiffs(batch),
      message: '批次版本已变化：已有核验员先行提交，请基于最新版本与差异处理后再确认'
    };
  }

  if (!batch.info.complete) {
    return {
      ok: false,
      code: 'incomplete_batch',
      latestSequence: batch.info.sequence,
      latestVersionId: null,
      diffs: unresolvedDiffs(batch),
      message: `批次不完整：${batch.info.completenessNote}`
    };
  }

  // 仍有未确认记录（含写入失败未恢复）不允许确认
  if (batch.pendingWrites.length > 0) {
    return {
      ok: false,
      code: 'pending_writes',
      latestSequence: batch.info.sequence,
      latestVersionId: null,
      diffs: unresolvedDiffs(batch),
      message: `仍有 ${batch.pendingWrites.length} 条未确认记录（可能写入失败待恢复），不能整批确认`
    };
  }

  batch.confirmedVersionId = 'CMS-052-V02';
  batch.confirmedBy = input.verifier;
  batch.confirmedAt = new Date().toISOString();
  batch.info.sequence += 1; // 先到者成立，批次版本进位
  return {
    ok: true,
    sequence: batch.info.sequence,
    confirmedVersionId: batch.confirmedVersionId,
    confirmedAt: batch.confirmedAt
  };
}

// 标记批次数据齐备（完整性由现场数据导入驱动）
export function markBatchComplete(batchId: string, complete: boolean) {
  const batch = state.get(batchId);
  if (!batch) throw new Error(`未知批次 ${batchId}`);
  batch.info.complete = complete;
  if (complete) batch.info.completenessNote = '现场数据齐备，待换版确认';
  return snapshotBatch(batch);
}

// 升级旧数据：缺少方法学版本的记录回填首版，并列出待复核原因
export function backfillLegacy(batchId: string): { recordId: string; reason: string }[] {
  const batch = state.get(batchId);
  if (!batch) throw new Error(`未知批次 ${batchId}`);
  const reasons: { recordId: string; reason: string }[] = [];
  for (const pending of batch.pendingWrites) {
    if (!pending.backfill) continue;
    const row = findRecord(pending.recordId);
    const v01 = factorEntry('CMS-052-V01', pending.kind);
    row.methodologyVersion = 'CMS-052-V01';
    row.factor = v01.value;
    row.factorUnit = v01.unit;
    row.factorBasis = `回填首版 · ${v01.basis}`;
    reasons.push({
      recordId: pending.recordId,
      reason: `旧数据缺方法学版本：按发生日期 ${pending.occurredOn}（早于换版日）回填 CMS-052-V01 首版因子 ${v01.value} ${v01.unit}，计算依据为「${v01.basis}」，列入待复核`
    });
  }
  return reasons;
}

export function resetAll() {
  resetDataset();
  state.clear();
  seed();
}
