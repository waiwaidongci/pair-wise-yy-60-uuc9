// 方法学版本管理：类型与纯计算逻辑（store 与 API 共用，避免循环依赖）

export type RecordStatus = '待核验' | '复核中' | '已核验' | '需补证';
export type FactorKey = 'electricity' | 'steam' | 'diesel' | 'gas';

export type CarbonRecord = {
  id: string;
  source: string;
  activity: number;
  unit: string;
  factor: number;
  factorUnit: string;
  factorKey: FactorKey;
  timeRange: string;
  occurredOn: string; // 发生日期，用于按日期追溯适用的方法学版本
  evidenceCount: number;
  anomaly: number;
  owner: string;
  status: RecordStatus;
  revision: number;
  methodologyVersion: string; // 适用的方法学版本；空串表示历史数据缺版本，待回填
  pendingReviewReason?: string; // 回填待复核原因
};

export type Finding = {
  id: string;
  recordId: string;
  type: '缺失证据' | '单位不一致' | '时间范围' | '异常波动';
  title: string;
  detail: string;
  assignee: string;
  due: string;
  status: '开放' | '补证中' | '已关闭';
};

export type MethodologyVersion = {
  version: string;
  label: string;
  effectiveFrom: string; // 生效日期
  basis: string; // 计算依据
  status: '现行' | '已废止';
  factors: Record<FactorKey, number>;
};

export type VersionChangeDraft = {
  id: string;
  fromVersion: string;
  toVersion: string;
  effectiveAt: string;
  basis: string;
  factors: Record<FactorKey, number>;
  factorChanges: { key: FactorKey; from: number; to: number }[];
  affectedRecordIds: string[]; // 按发生日期走新版的记录
  pendingRecordIds: string[]; // 写入失败时未确认、需保留恢复的记录
  diff: string[]; // 未处理差异说明
  batchVersionSnapshot: number; // 换版确认携带的当前批次版本（乐观锁快照）
};

export type VersionChange = VersionChangeDraft & {
  status: '待确认' | '已确认' | '写入失败';
  batchVersion: number; // 确认时所在的批次版本
  confirmedBy?: string;
  confirmedAt?: string;
  clientToken?: string; // 幂等令牌：重试不重复生成版本
  conflict?: boolean;
  conflictLatestBatchVersion?: number;
  conflictDiff?: string[];
};

export type BatchState = {
  id: string;
  period: string;
  version: number;
  status: '进行中' | '已提交';
};

export const FACTOR_KEY_LABELS: Record<FactorKey, string> = {
  electricity: '电力',
  steam: '蒸汽',
  diesel: '柴油',
  gas: '天然气'
};

// 历史数据缺方法学版本，升级时回填首版并列出待复核原因
export const BACKFILL_REASON =
  '历史数据缺少方法学版本字段，升级时回填首版 CMS-052-V01；排放因子计算依据需补录后方可签发';

export const defaultMethodologyVersions: MethodologyVersion[] = [
  {
    version: 'CMS-052-V01',
    label: '方法学首版',
    effectiveFrom: '2026-07-01',
    basis: 'IPCC 2006 指南第二卷 · 项目监测计划 MP-2026-041',
    status: '现行',
    factors: { electricity: 0.5568, steam: 0.11, diesel: 2.68, gas: 2.1622 }
  }
];

// 构造 V01 → V02 换版草案：按发生日期确定受影响记录，旧数据不整批套新因子
export function buildV02Change(
  records: CarbonRecord[],
  fromVersion: MethodologyVersion,
  batchVersion: number
): VersionChangeDraft {
  const toFactors: Record<FactorKey, number> = {
    electricity: 0.521,
    steam: 0.105,
    diesel: 2.68,
    gas: 2.098
  };
  const effectiveAt = '2026-07-20';
  const factorChanges = (Object.keys(toFactors) as FactorKey[])
    .filter((key) => toFactors[key] !== fromVersion.factors[key])
    .map((key) => ({ key, from: fromVersion.factors[key], to: toFactors[key] }));
  const affectedRecordIds = records.filter((record) => record.occurredOn >= effectiveAt).map((record) => record.id);
  const retainedRecordIds = records
    .filter((record) => record.occurredOn < effectiveAt)
    .map((record) => record.id);
  const diff = [
    `方法学版本 ${fromVersion.version} → CMS-052-V02，生效日期 ${effectiveAt}`,
    ...factorChanges.map((change) => `${FACTOR_KEY_LABELS[change.key]}排放因子 ${change.from} → ${change.to}`),
    `按发生日期保留：${retainedRecordIds.join('、')} 沿用 ${fromVersion.version} 原因子与计算依据`,
    `新到现场数据（发生日期 ≥ ${effectiveAt}）${affectedRecordIds.join('、')} 走新版因子`
  ];
  return {
    id: 'CHG-V02',
    fromVersion: fromVersion.version,
    toVersion: 'CMS-052-V02',
    effectiveAt,
    basis: '2026 年度区域电网排放因子更新 · 生态环境部公告 2026-12',
    factors: toFactors,
    factorChanges,
    affectedRecordIds,
    pendingRecordIds: affectedRecordIds,
    diff,
    batchVersionSnapshot: batchVersion
  };
}

// 签发门禁：只接收完整批次。任一阻塞项存在则签发不受理。
export function computeBlockers(input: {
  records: CarbonRecord[];
  findings: Finding[];
  versionChanges: VersionChange[];
}): string[] {
  const blockers: string[] = [];
  const openFindings = input.findings.filter((finding) => finding.status !== '已关闭');
  if (openFindings.length) {
    blockers.push(`存在 ${openFindings.length} 项未关闭发现项（${openFindings.map((finding) => finding.id).join('、')}）`);
  }
  const unverified = input.records.filter((record) => record.status !== '已核验');
  if (unverified.length) {
    blockers.push(`存在 ${unverified.length} 条未核验记录（${unverified.map((record) => record.id).join('、')}）`);
  }
  const pendingChanges = input.versionChanges.filter((change) => change.status !== '已确认');
  if (pendingChanges.length) {
    blockers.push(`存在 ${pendingChanges.length} 项未完成方法学换版（${pendingChanges.map((change) => change.toVersion).join('、')}）`);
  }
  const backfilled = input.records.filter((record) => record.pendingReviewReason);
  if (backfilled.length) {
    blockers.push(`存在 ${backfilled.length} 条回填待复核历史数据（${backfilled.map((record) => record.id).join('、')}）`);
  }
  return blockers;
}
