import { NextResponse } from 'next/server';
import { evidenceResponseSchema } from '@/lib/schema';
import { computeBlockers, type VersionChange } from '@/lib/methodology';

const data = {
  project: {
    id: 'CN-ER-2026-041',
    name: '临港工业园区能效提升项目',
    methodology: 'CMS-052-V01',
    vintage: '2026 监测年度',
    verifier: '华碳认证 · 核验组 B'
  },
  summary: {
    period: '2026 年第三监测期',
    reduction: 18426,
    evidenceRate: 92,
    openFindings: 3,
    sampled: 18
  },
  records: [
    { id: 'ACT-0318', source: '电表 E-17 / 四号压缩机组', activity: 428650, unit: 'kWh', factor: 0.5568, factorUnit: 'tCO2/MWh', factorKey: 'electricity', timeRange: '2026-07-01 至 07-31', occurredOn: '2026-07-08', evidenceCount: 4, anomaly: 2.3, owner: '项目现场 O2', status: '复核中', revision: 3, methodologyVersion: 'CMS-052-V01' },
    { id: 'ACT-0321', source: '蒸汽流量计 ST-04', activity: 2038.4, unit: 'GJ', factor: 0.11, factorUnit: 'tCO2/GJ', factorKey: 'steam', timeRange: '2026-07-01 至 07-31', occurredOn: '2026-07-12', evidenceCount: 3, anomaly: 0, owner: '能源中心', status: '已核验', revision: 2, methodologyVersion: 'CMS-052-V01' },
    { id: 'ACT-0325', source: '柴油消耗台账 / 应急泵', activity: 1846, unit: 'L', factor: 2.68, factorUnit: 'kgCO2/L', factorKey: 'diesel', timeRange: '2026-07-01 至 07-31', occurredOn: '2026-07-18', evidenceCount: 2, anomaly: 8.6, owner: '设备保障部', status: '需补证', revision: 4, methodologyVersion: '' },
    { id: 'ACT-0331', source: '光伏逆变器阵列 PV-2', activity: 182460, unit: 'kWh', factor: 0.5568, factorUnit: 'tCO2/MWh', factorKey: 'electricity', timeRange: '2026-07-01 至 07-31', occurredOn: '2026-07-22', evidenceCount: 5, anomaly: -1.2, owner: '新能源运维', status: '已核验', revision: 1, methodologyVersion: 'CMS-052-V01' },
    { id: 'ACT-0337', source: '天然气流量计 NG-02', activity: 62.8, unit: 'kNm3', factor: 2.1622, factorUnit: 'tCO2/kNm3', factorKey: 'gas', timeRange: '2026-07-01 至 07-31', occurredOn: '2026-07-25', evidenceCount: 1, anomaly: 12.4, owner: '热力站', status: '待核验', revision: 1, methodologyVersion: '' }
  ]
};

// 服务端批次状态：模块级保存当前批次版本与已确认换版，用于模拟并发与幂等
let serverBatchVersion = 1;
const confirmedChanges = new Map<string, VersionChange>();

export async function GET() {
  return NextResponse.json(evidenceResponseSchema.parse(data));
}

export async function POST(request: Request) {
  const body = await request.json();

  if (body.kind === 'issuance') {
    // 签发门禁：只接收完整批次，不完整返回 422 与阻塞项
    const blockers: string[] = Array.isArray(body.blockers) ? body.blockers : [];
    if (blockers.length) {
      return NextResponse.json({ accepted: false, blockers }, { status: 422 });
    }
    return NextResponse.json({ accepted: true, batchId: body.batchId, submittedAt: new Date().toISOString() });
  }

  if (body.kind === 'version-change') {
    const { draft, batchVersion, clientToken, actor, forceFail } = body as {
      draft: VersionChange;
      batchVersion: number;
      clientToken: string;
      actor: string;
      forceFail?: boolean;
    };

    // 乐观锁：后到者先被拦截，看到最新批次版本与未处理差异（先到者成立）
    if (batchVersion !== serverBatchVersion) {
      return NextResponse.json(
        { accepted: false, conflict: true, latestBatchVersion: serverBatchVersion, diff: draft.diff },
        { status: 409 }
      );
    }

    // 写入失败：未确认记录保留，客户端可携带同一令牌恢复重试（须在幂等之前，否则失败被短路）
    if (forceFail) {
      return NextResponse.json(
        { accepted: false, pendingRecordIds: draft.pendingRecordIds, message: '写入失败：未确认记录已保留，可重试恢复' },
        { status: 500 }
      );
    }

    // 幂等：同一确认令牌重试不重复生成版本；同版本换版也直接返回已确认结果
    const existing = confirmedChanges.get(clientToken)
      ?? [...confirmedChanges.values()].find((change) => change.toVersion === draft.toVersion);
    if (existing) {
      return NextResponse.json({
        accepted: true,
        idempotent: true,
        change: existing,
        batchVersion: serverBatchVersion
      });
    }

    const change: VersionChange = {
      ...draft,
      status: '已确认',
      confirmedBy: actor,
      confirmedAt: new Date().toISOString(),
      batchVersion: batchVersion + 1
    };
    confirmedChanges.set(clientToken, change);
    serverBatchVersion += 1;
    return NextResponse.json({ accepted: true, change, batchVersion: serverBatchVersion });
  }

  // 兼容旧的证据修订提交
  return NextResponse.json({
    accepted: Boolean(body.recordId && body.reason && typeof body.value === 'number'),
    revision: 5,
    recordedAt: new Date().toISOString()
  });
}
