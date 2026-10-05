// 方法学版本目录与批次数据（API 路由与服务端状态机共用）

import {
  factorEntry as factorEntryBase,
  methodologyVersions as versions,
  versionForDate as versionForDateBase,
  type FactorKind,
  type MethodologyVersion,
  type MethodologyVersionId
} from './methodology-schema-types';

export type { FactorKind, MethodologyVersion, MethodologyVersionId };
export const methodologyVersions = versions;

export const VERSION_SWITCH_DATE = '2026-07-16';
export const versionForDate = versionForDateBase;
export const factorEntry = factorEntryBase;

export type ConfirmState = 'unconfirmed' | 'confirmed';

export type BatchInfo = {
  id: string;
  label: string;
  period: string;
  sequence: number; // 换版确认带的“当前批次版本”（单调递增，确认成功才进位）
  complete: boolean;
  completenessNote: string;
};

export type RecordRow = {
  id: string;
  source: string;
  activity: number;
  unit: string;
  kind: FactorKind;
  factor: number;
  factorUnit: string;
  factorBasis: string;
  occurredOn: string;
  batchId: string;
  methodologyVersion: MethodologyVersionId | null; // 旧数据升级前为 null
  timeRange: string;
  evidenceCount: number;
  anomaly: number;
  owner: string;
  status: string;
  revision: number;
};

export const batches: BatchInfo[] = [
  { id: 'B-2026-Q2', label: '第二监测期批次', period: '2026-04-01 至 06-30', sequence: 7, complete: false, completenessNote: '含 3 条升级前历史记录，方法学版本待复核确认' },
  { id: 'B-2026-07', label: '第三监测期批次', period: '2026-07-01 至 07-31', sequence: 8, complete: false, completenessNote: '方法学 07-16 换版，批次确认尚未成立' }
];

export const records: RecordRow[] = [
  // —— 第三监测期：跨换版日（07-16）。新到现场数据暂挂旧因子，待按发生日期切换；
  //    换版日之前的记录保留 V01 原因子与计算依据，不随整批改写。 ——
  { id: 'ACT-0318', source: '电表 E-17 / 四号压缩机组', activity: 428650, unit: 'kWh', kind: 'electricity', factor: 0.5568, factorUnit: 'tCO2/MWh', factorBasis: 'V01 · 2024 华东电网平均排放因子 0.5568', occurredOn: '2026-07-14', batchId: 'B-2026-07', methodologyVersion: 'CMS-052-V01', timeRange: '2026-07-14 抄表', evidenceCount: 4, anomaly: 2.3, owner: '项目现场 O2', status: '复核中', revision: 3 },
  { id: 'ACT-0321', source: '蒸汽流量计 ST-04', activity: 2038.4, unit: 'GJ', kind: 'steam', factor: 0.11, factorUnit: 'tCO2/GJ', factorBasis: 'V01 暂挂 · 燃料低位热值与含碳量缺省值（待按发生日期切换 V02）', occurredOn: '2026-07-21', batchId: 'B-2026-07', methodologyVersion: 'CMS-052-V01', timeRange: '2026-07-21 抄表', evidenceCount: 3, anomaly: 0, owner: '能源中心', status: '已核验', revision: 2 },
  { id: 'ACT-0325', source: '柴油消耗台账 / 应急泵', activity: 1846, unit: 'L', kind: 'diesel', factor: 2.68, factorUnit: 'kgCO2/L', factorBasis: 'V01 暂挂 · 柴油 IPCC 缺省含碳量旧口径（待按发生日期切换 V02）', occurredOn: '2026-07-19', batchId: 'B-2026-07', methodologyVersion: 'CMS-052-V01', timeRange: '2026-07-19 台账', evidenceCount: 2, anomaly: 8.6, owner: '设备保障部', status: '需补证', revision: 4 },
  { id: 'ACT-0331', source: '光伏逆变器阵列 PV-2', activity: 182460, unit: 'kWh', kind: 'electricity', factor: 0.5568, factorUnit: 'tCO2/MWh', factorBasis: 'V01 暂挂 · 2024 华东电网平均因子（待按发生日期切换 V02）', occurredOn: '2026-07-18', batchId: 'B-2026-07', methodologyVersion: 'CMS-052-V01', timeRange: '2026-07-18 抄表', evidenceCount: 5, anomaly: -1.2, owner: '新能源运维', status: '已核验', revision: 1 },
  { id: 'ACT-0337', source: '天然气流量计 NG-02', activity: 62.8, unit: 'kNm3', kind: 'gas', factor: 2.1622, factorUnit: 'tCO2/kNm3', factorBasis: 'V01 暂挂 · 天然气高位热值缺省因子（待按发生日期切换 V02）', occurredOn: '2026-07-24', batchId: 'B-2026-07', methodologyVersion: 'CMS-052-V01', timeRange: '2026-07-24 抄表', evidenceCount: 1, anomaly: 12.4, owner: '热力站', status: '待核验', revision: 1 },
  // —— 第二监测期：升级前历史数据，缺少方法学版本，升级时回填首版并列待复核原因 ——
  { id: 'ACT-0205', source: '电表 E-09 / 空分车间（历史）', activity: 391240, unit: 'kWh', kind: 'electricity', factor: 0.5568, factorUnit: 'tCO2/MWh', factorBasis: '升级前仅登记数值，缺方法学版本与计算依据', occurredOn: '2026-06-18', batchId: 'B-2026-Q2', methodologyVersion: null, timeRange: '2026-06-18 抄表', evidenceCount: 3, anomaly: 0, owner: '项目现场 O2', status: '已核验', revision: 1 },
  { id: 'ACT-0211', source: '蒸汽流量计 ST-01（历史）', activity: 1987.6, unit: 'GJ', kind: 'steam', factor: 0.11, factorUnit: 'tCO2/GJ', factorBasis: '升级前仅登记数值，缺方法学版本与计算依据', occurredOn: '2026-05-26', batchId: 'B-2026-Q2', methodologyVersion: null, timeRange: '2026-05-26 抄表', evidenceCount: 2, anomaly: 1.8, owner: '能源中心', status: '已核验', revision: 1 },
  { id: 'ACT-0218', source: '柴油台账 / 备用锅炉（历史）', activity: 1264, unit: 'L', kind: 'diesel', factor: 2.68, factorUnit: 'kgCO2/L', factorBasis: '升级前仅登记数值，缺方法学版本与计算依据', occurredOn: '2026-04-30', batchId: 'B-2026-Q2', methodologyVersion: null, timeRange: '2026-04-30 台账', evidenceCount: 2, anomaly: 0, owner: '设备保障部', status: '已核验', revision: 1 }
];

// 深拷贝初始数据，供场景重置时复位（状态机会就地改写 factor / methodologyVersion）
export function resetDataset() {
  records.forEach((row, index) => {
    const initial = initialRows[index];
    if (initial.id !== row.id) throw new Error('初始记录顺序被破坏，无法复位');
    row.factor = initial.factor;
    row.factorUnit = initial.factorUnit;
    row.factorBasis = initial.factorBasis;
    row.methodologyVersion = initial.methodologyVersion;
  });
  batches.forEach((batch, index) => {
    batch.sequence = initialBatches[index].sequence;
    batch.complete = initialBatches[index].complete;
    batch.completenessNote = initialBatches[index].completenessNote;
  });
}

const initialRows = records.map((row) => ({ ...row }));
const initialBatches = batches.map((batch) => ({ ...batch }));
