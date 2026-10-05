import { z } from 'zod';

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
    factorBasis: z.string(),
    occurredOn: z.string(),
    batchId: z.string(),
    methodologyVersion: z.enum(['CMS-052-V01', 'CMS-052-V02']).nullable(),
    timeRange: z.string(),
    evidenceCount: z.number(),
    anomaly: z.number(),
    owner: z.string(),
    status: z.enum(['待核验', '复核中', '已核验', '需补证']),
    revision: z.number()
  }))
});

export type EvidenceResponse = z.infer<typeof evidenceResponseSchema>;
