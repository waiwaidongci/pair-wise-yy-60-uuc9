import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type RecordStatus = '待核验' | '复核中' | '已核验' | '需补证';
export type CarbonRecord = {
  id: string;
  source: string;
  activity: number;
  unit: string;
  factor: number;
  factorUnit: string;
  factorBasis: string;
  occurredOn: string;
  batchId: string;
  methodologyVersion: 'CMS-052-V01' | 'CMS-052-V02' | null;
  timeRange: string;
  evidenceCount: number;
  anomaly: number;
  owner: string;
  status: RecordStatus;
  revision: number;
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

// 第三监测期（换版当期）+ 第二监测期（升级前历史数据，缺方法学版本，待回填首版）
const defaultRecords: CarbonRecord[] = [
  { id: 'ACT-0318', source: '电表 E-17 / 四号压缩机组', activity: 428650, unit: 'kWh', factor: 0.5568, factorUnit: 'tCO2/MWh', factorBasis: 'V01 · 2024 华东电网平均排放因子 0.5568', occurredOn: '2026-07-14', batchId: 'B-2026-07', methodologyVersion: 'CMS-052-V01', timeRange: '2026-07-14 抄表', evidenceCount: 4, anomaly: 2.3, owner: '项目现场 O2', status: '复核中', revision: 3 },
  { id: 'ACT-0321', source: '蒸汽流量计 ST-04', activity: 2038.4, unit: 'GJ', factor: 0.1100, factorUnit: 'tCO2/GJ', factorBasis: 'V01 暂挂 · 燃料低位热值缺省值（待按日期切 V02）', occurredOn: '2026-07-21', batchId: 'B-2026-07', methodologyVersion: 'CMS-052-V01', timeRange: '2026-07-21 抄表', evidenceCount: 3, anomaly: 0, owner: '能源中心', status: '已核验', revision: 2 },
  { id: 'ACT-0325', source: '柴油消耗台账 / 应急泵', activity: 1846, unit: 'L', factor: 2.6800, factorUnit: 'kgCO2/L', factorBasis: 'V01 暂挂 · 柴油旧口径因子（待按日期切 V02）', occurredOn: '2026-07-19', batchId: 'B-2026-07', methodologyVersion: 'CMS-052-V01', timeRange: '2026-07-19 台账', evidenceCount: 2, anomaly: 8.6, owner: '设备保障部', status: '需补证', revision: 4 },
  { id: 'ACT-0331', source: '光伏逆变器阵列 PV-2', activity: 182460, unit: 'kWh', factor: 0.5568, factorUnit: 'tCO2/MWh', factorBasis: 'V01 暂挂 · 2024 电网平均因子（待按日期切 V02）', occurredOn: '2026-07-18', batchId: 'B-2026-07', methodologyVersion: 'CMS-052-V01', timeRange: '2026-07-18 抄表', evidenceCount: 5, anomaly: -1.2, owner: '新能源运维', status: '已核验', revision: 1 },
  { id: 'ACT-0337', source: '天然气流量计 NG-02', activity: 62.8, unit: 'kNm3', factor: 2.1622, factorUnit: 'tCO2/kNm3', factorBasis: 'V01 暂挂 · 天然气高位热值缺省因子（待按日期切 V02）', occurredOn: '2026-07-24', batchId: 'B-2026-07', methodologyVersion: 'CMS-052-V01', timeRange: '2026-07-24 抄表', evidenceCount: 1, anomaly: 12.4, owner: '热力站', status: '待核验', revision: 1 },
  { id: 'ACT-0205', source: '电表 E-09 / 空分车间（历史）', activity: 391240, unit: 'kWh', factor: 0.5568, factorUnit: 'tCO2/MWh', factorBasis: '升级前仅登记数值，缺方法学版本与计算依据', occurredOn: '2026-06-18', batchId: 'B-2026-Q2', methodologyVersion: null, timeRange: '2026-06-18 抄表', evidenceCount: 3, anomaly: 0, owner: '项目现场 O2', status: '已核验', revision: 1 },
  { id: 'ACT-0211', source: '蒸汽流量计 ST-01（历史）', activity: 1987.6, unit: 'GJ', factor: 0.1100, factorUnit: 'tCO2/GJ', factorBasis: '升级前仅登记数值，缺方法学版本与计算依据', occurredOn: '2026-05-26', batchId: 'B-2026-Q2', methodologyVersion: null, timeRange: '2026-05-26 抄表', evidenceCount: 2, anomaly: 1.8, owner: '能源中心', status: '已核验', revision: 1 },
  { id: 'ACT-0218', source: '柴油台账 / 备用锅炉（历史）', activity: 1264, unit: 'L', factor: 2.6800, factorUnit: 'kgCO2/L', factorBasis: '升级前仅登记数值，缺方法学版本与计算依据', occurredOn: '2026-04-30', batchId: 'B-2026-Q2', methodologyVersion: null, timeRange: '2026-04-30 台账', evidenceCount: 2, anomaly: 0, owner: '设备保障部', status: '已核验', revision: 1 }
];

const defaultFindings: Finding[] = [
  { id: 'F-104', recordId: 'ACT-0337', type: '缺失证据', title: '缺少天然气流量计校验证书', detail: '计量记录已提交，但校准有效期证明不足。', assignee: '热力站 · 韩跃', due: '09-30', status: '开放' },
  { id: 'F-105', recordId: 'ACT-0325', type: '异常波动', title: '柴油消耗较上期上升 18.6%', detail: '项目方尚未说明测试运行时长变化。', assignee: '设备保障部 · 姜婷', due: '10-02', status: '补证中' },
  { id: 'F-106', recordId: 'ACT-0318', type: '单位不一致', title: '原始表单位为 MWh，台账记录为 kWh', detail: '需补充单位换算链并保留原始记录。', assignee: '项目现场 · 徐璐', due: '09-30', status: '开放' }
];

// 签发批次门禁：只有完整批次（现场数据齐备 + 换版确认成立）可进入签发准备
export type IssuanceBatchGate = {
  batchId: string;
  label: string;
  complete: boolean;
  reason: string;
};

const defaultIssuanceBatches: IssuanceBatchGate[] = [
  { batchId: 'B-2026-07', label: '第三监测期批次（换版当期）', complete: false, reason: '换版确认尚未成立，新到现场数据仍挂旧因子' },
  { batchId: 'B-2026-Q2', label: '第二监测期批次（历史）', complete: false, reason: '3 条旧数据缺方法学版本，回填首版后待复核确认' }
];

type State = {
  records: CarbonRecord[];
  findings: Finding[];
  selectedRecordId: string;
  sampledIds: string[];
  issuanceChecks: Record<string, boolean>;
  issuanceBatches: IssuanceBatchGate[];
  selectRecord: (id: string) => void;
  toggleSample: (id: string) => void;
  startCorrection: (id: string) => void;
  verifyRecord: (id: string) => void;
  batchVerify: () => void;
  requestEvidence: (findingId: string) => void;
  closeFinding: (findingId: string) => void;
  toggleIssuanceCheck: (id: string) => void;
  setBatchComplete: (batchId: string, complete: boolean, reason?: string) => void;
  reviseValue: (id: string, value: number, reason: string) => void;
};

export const useCarbonStore = create<State>()(
  persist(
    (set) => ({
      records: defaultRecords,
      findings: defaultFindings,
      selectedRecordId: 'ACT-0318',
      sampledIds: ['ACT-0318', 'ACT-0337'],
      issuanceChecks: { evidence: false, calculation: true, revisions: true, methodology: false },
      issuanceBatches: defaultIssuanceBatches,
      selectRecord: (id) => set({ selectedRecordId: id }),
      toggleSample: (id) => set((state) => ({ sampledIds: state.sampledIds.includes(id) ? state.sampledIds.filter((item) => item !== id) : [...state.sampledIds, id] })),
      startCorrection: (id) => set((state) => ({ records: state.records.map((record) => record.id === id ? { ...record, status: '复核中' } : record) })),
      verifyRecord: (id) => set((state) => ({ records: state.records.map((record) => record.id === id ? { ...record, status: '已核验' } : record) })),
      batchVerify: () => set((state) => ({ records: state.records.map((record) => state.sampledIds.includes(record.id) && record.status !== '需补证' ? { ...record, status: '已核验' } : record) })),
      requestEvidence: (findingId) => set((state) => ({ findings: state.findings.map((finding) => finding.id === findingId ? { ...finding, status: '补证中' } : finding) })),
      closeFinding: (findingId) => set((state) => ({ findings: state.findings.map((finding) => finding.id === findingId ? { ...finding, status: '已关闭' } : finding) })),
      toggleIssuanceCheck: (id) => set((state) => ({ issuanceChecks: { ...state.issuanceChecks, [id]: !state.issuanceChecks[id] } })),
      setBatchComplete: (batchId, complete, reason) => set((state) => ({
        issuanceBatches: state.issuanceBatches.map((batch) => batch.batchId === batchId
          ? { ...batch, complete, ...(reason ? { reason } : complete ? { reason: '批次完整：数据齐备且换版确认成立' } : {}) }
          : batch)
      })),
      reviseValue: (id, value, reason) => set((state) => ({
        records: state.records.map((record) => record.id === id ? { ...record, activity: value, revision: record.revision + 1, status: '复核中' } : record),
        findings: reason ? state.findings : state.findings
      }))
    }),
    {
      name: 'yy60-carbon-evidence',
      version: 2,
      // 旧版本本地缓存缺少方法学版本/发生日期/批次门禁等字段：不直接合并，回落到当前默认值
      merge: (persisted, current) => {
        const saved = persisted as Partial<State> | null;
        if (!saved || !Array.isArray(saved.records) || saved.records.some((r) => !('occurredOn' in r) || !('batchId' in r))) {
          return current;
        }
        return { ...current, ...saved };
      }
    }
  )
);
