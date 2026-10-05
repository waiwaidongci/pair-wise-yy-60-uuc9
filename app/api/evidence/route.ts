import { NextResponse } from 'next/server';
import { evidenceResponseSchema } from '@/lib/schema';
import { records as sharedRecords } from '@/lib/methodology-data';

const project = {
  id: 'CN-ER-2026-041',
  name: '临港工业园区能效提升项目',
  methodology: 'CMS-052-V01 / V02（07-16 期中换版）',
  vintage: '2026 监测年度',
  verifier: '华碳认证 · 核验组 B'
};

const summary = {
  period: '2026 年第三监测期',
  reduction: 18426,
  evidenceRate: 92,
  openFindings: 3,
  sampled: 18
};

export async function GET() {
  return NextResponse.json(
    evidenceResponseSchema.parse({
      project,
      summary,
      records: sharedRecords.filter((record) => record.batchId === 'B-2026-07')
    })
  );
}

export async function POST(request: Request) {
  const body = await request.json() as { recordId?: string; value?: number; reason?: string };
  return NextResponse.json({
    accepted: Boolean(body.recordId && body.reason && typeof body.value === 'number'),
    revision: 5,
    recordedAt: new Date().toISOString()
  });
}
