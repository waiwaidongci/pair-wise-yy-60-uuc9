import { NextResponse } from 'next/server';
import {
  applyWrite,
  backfillLegacy,
  confirmBatch,
  markBatchComplete,
  resetAll,
  snapshot
} from '@/lib/methodology-state';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(snapshot());
}

export async function POST(request: Request) {
  const body = await request.json() as {
    action?: string;
    batchId?: string;
    recordId?: string;
    clientToken?: string;
    fail?: boolean;
    failRecordIds?: string[];
    expectedSequence?: number;
    verifier?: string;
  };

  try {
    switch (body.action) {
      case 'write': {
        if (!body.batchId || !body.recordId || !body.clientToken) {
          return NextResponse.json({ error: '缺少 batchId / recordId / clientToken' }, { status: 400 });
        }
        const result = applyWrite({
          batchId: body.batchId,
          recordId: body.recordId,
          clientToken: body.clientToken,
          fail: body.fail
        });
        return NextResponse.json({ ...result, snapshot: snapshot() }, { status: result.status === 'failed' ? 502 : 200 });
      }

      case 'recover': {
        // 写入失败后从未确认记录恢复：用确定性 clientToken 重试，保证不重复生成版本。
        // 已恢复成功的记录不在未确认区，按 duplicate 回显（幂等跳过，不产生新版本）。
        if (!body.batchId) return NextResponse.json({ error: '缺少 batchId' }, { status: 400 });
        const before = snapshot().batches.find((b) => b.id === body.batchId);
        const allRecordIds = [
          ...(before?.pendingWrites ?? []).map((p) => p.recordId),
          ...(before?.confirmedRows ?? []).map((r) => r.recordId)
        ];
        const results: { recordId: string; status: 'confirmed' | 'duplicate' | 'failed'; attempts: number; sequence?: number }[] = [];
        for (const recordId of allRecordIds) {
          const token = `recover:${body.batchId}:${recordId}`;
          const result = applyWrite({
            batchId: body.batchId,
            recordId,
            clientToken: token,
            fail: body.failRecordIds?.includes(recordId)
          });
          results.push({ recordId, status: result.status, attempts: 0, ...(result.sequence ? { sequence: result.sequence } : {}) });
        }
        return NextResponse.json({ recovered: results, snapshot: snapshot() });
      }

      case 'confirm': {
        if (!body.batchId || typeof body.expectedSequence !== 'number' || !body.verifier) {
          return NextResponse.json({ error: '缺少 batchId / expectedSequence / verifier' }, { status: 400 });
        }
        const result = confirmBatch({
          batchId: body.batchId,
          expectedSequence: body.expectedSequence,
          verifier: body.verifier
        });
        return NextResponse.json({ ...result, snapshot: snapshot() }, { status: result.ok ? 200 : 409 });
      }

      case 'backfill': {
        if (!body.batchId) return NextResponse.json({ error: '缺少 batchId' }, { status: 400 });
        const reasons = backfillLegacy(body.batchId);
        return NextResponse.json({ reasons, snapshot: snapshot() });
      }

      case 'importFieldData': {
        if (!body.batchId) return NextResponse.json({ error: '缺少 batchId' }, { status: 400 });
        const batch = markBatchComplete(body.batchId, true);
        return NextResponse.json({ batch, snapshot: snapshot() });
      }

      case 'reset': {
        resetAll();
        return NextResponse.json({ snapshot: snapshot() });
      }

      default:
        return NextResponse.json({ error: `未知操作 ${body.action ?? ''}` }, { status: 400 });
    }
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : '服务端错误' }, { status: 500 });
  }
}
