import { z } from 'zod';

export const factorKeySchema = z.enum(['electricity', 'steam', 'diesel', 'gas']);

export const recordStatusSchema = z.enum(['待核验', '复核中', '已核验', '需补证']);

export const methodologyVersionSchema = z.object({
  version: z.string(),
  label: z.string(),
  effectiveFrom: z.string(),
  basis: z.string(),
  status: z.enum(['现行', '已废止']),
  factors: z.record(z.string(), z.number())
});

export const versionChangeSchema = z.object({
  id: z.string(),
  fromVersion: z.string(),
  toVersion: z.string(),
  effectiveAt: z.string(),
  basis: z.string(),
  factors: z.record(z.string(), z.number()),
  factorChanges: z.array(z.object({ key: factorKeySchema, from: z.number(), to: z.number() })),
  affectedRecordIds: z.array(z.string()),
  pendingRecordIds: z.array(z.string()),
  diff: z.array(z.string()),
  batchVersionSnapshot: z.number(),
  status: z.enum(['待确认', '已确认', '写入失败']).optional(),
  batchVersion: z.number().optional(),
  confirmedBy: z.string().optional(),
  confirmedAt: z.string().optional(),
  clientToken: z.string().optional(),
  conflict: z.boolean().optional(),
  conflictLatestBatchVersion: z.number().optional(),
  conflictDiff: z.array(z.string()).optional()
});

export const batchSchema = z.object({
  id: z.string(),
  period: z.string(),
  version: z.number(),
  status: z.enum(['进行中', '已提交'])
});

export const evidenceResponseSchema = z.object({
  project: z.object({
    id: z.string(),
    name: z.string(),
    methodology: z.string(),
    vintage: z.string(),
    verifier: z.string()
  }),
  summary: z.object({
    period: z.string(),
    reduction: z.number(),
    evidenceRate: z.number(),
    openFindings: z.number(),
    sampled: z.number()
  }),
  records: z.array(z.object({
    id: z.string(),
    source: z.string(),
    activity: z.number(),
    unit: z.string(),
    factor: z.number(),
    factorUnit: z.string(),
    factorKey: factorKeySchema.optional(),
    timeRange: z.string(),
    occurredOn: z.string().optional(),
    evidenceCount: z.number(),
    anomaly: z.number(),
    owner: z.string(),
    status: recordStatusSchema,
    revision: z.number(),
    methodologyVersion: z.string().optional(),
    pendingReviewReason: z.string().optional()
  })),
  methodologyVersions: z.array(methodologyVersionSchema).optional(),
  versionChanges: z.array(versionChangeSchema).optional(),
  batch: batchSchema.optional()
});

export type EvidenceResponse = z.infer<typeof evidenceResponseSchema>;
