import { z } from 'zod';

export const methodologyVersionIdSchema = z.enum(['CMS-052-V01', 'CMS-052-V02']);

export const versionDiffSchema = z.object({
  recordId: z.string(),
  occurredOn: z.string(),
  currentVersion: methodologyVersionIdSchema,
  expectedVersion: methodologyVersionIdSchema,
  currentFactor: z.number(),
  expectedFactor: z.number(),
  reason: z.string()
});

export const pendingWriteSchema = z.object({
  recordId: z.string(),
  occurredOn: z.string(),
  kind: z.string(),
  backfill: z.boolean(),
  attempts: z.number(),
  lastError: z.string().nullable()
});

export const confirmedRowSchema = z.object({
  recordId: z.string(),
  occurredOn: z.string(),
  appliedVersion: methodologyVersionIdSchema,
  factor: z.number(),
  factorUnit: z.string(),
  factorBasis: z.string(),
  backfilled: z.boolean()
});

export const methodologySnapshotSchema = z.object({
  batches: z.array(z.object({
    id: z.string(),
    label: z.string(),
    period: z.string(),
    sequence: z.number(),
    complete: z.boolean(),
    completenessNote: z.string(),
    confirmedVersionId: methodologyVersionIdSchema.nullable(),
    confirmedBy: z.string().nullable(),
    confirmedAt: z.string().nullable(),
    pendingCount: z.number(),
    pendingWrites: z.array(pendingWriteSchema),
    confirmedRows: z.array(confirmedRowSchema),
    diffs: z.array(versionDiffSchema)
  }))
});

export type MethodologySnapshot = z.infer<typeof methodologySnapshotSchema>;
export type VersionDiff = z.infer<typeof versionDiffSchema>;
export type PendingWrite = z.infer<typeof pendingWriteSchema>;
export type ConfirmedRow = z.infer<typeof confirmedRowSchema>;

export type ConfirmResult =
  | { ok: true; sequence: number; confirmedVersionId: 'CMS-052-V02'; confirmedAt: string; snapshot: MethodologySnapshot }
  | {
      ok: false;
      code: 'version_conflict' | 'incomplete_batch' | 'pending_writes' | 'already_confirmed';
      latestSequence: number;
      latestVersionId: 'CMS-052-V01' | 'CMS-052-V02' | null;
      diffs: VersionDiff[];
      message: string;
      snapshot: MethodologySnapshot;
    };
