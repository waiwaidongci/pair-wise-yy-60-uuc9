import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  type BatchState,
  type CarbonRecord,
  type Finding,
  type MethodologyVersion,
  type VersionChange,
  type VersionChangeDraft,
  BACKFILL_REASON,
  buildV02Change,
  computeBlockers,
  defaultMethodologyVersions
} from '@/lib/methodology';
import { submitIssuance, submitVersionChange } from '@/lib/api';

export type { CarbonRecord, Finding, RecordStatus } from '@/lib/methodology';

const defaultRecords: CarbonRecord[] = [
  { id: 'ACT-0318', source: '电表 E-17 / 四号压缩机组', activity: 428650, unit: 'kWh', factor: 0.5568, factorUnit: 'tCO2/MWh', factorKey: 'electricity', timeRange: '2026-07-01 至 07-31', occurredOn: '2026-07-08', evidenceCount: 4, anomaly: 2.3, owner: '项目现场 O2', status: '复核中', revision: 3, methodologyVersion: 'CMS-052-V01' },
  { id: 'ACT-0321', source: '蒸汽流量计 ST-04', activity: 2038.4, unit: 'GJ', factor: 0.11, factorUnit: 'tCO2/GJ', factorKey: 'steam', timeRange: '2026-07-01 至 07-31', occurredOn: '2026-07-12', evidenceCount: 3, anomaly: 0, owner: '能源中心', status: '已核验', revision: 2, methodologyVersion: 'CMS-052-V01' },
  { id: 'ACT-0325', source: '柴油消耗台账 / 应急泵', activity: 1846, unit: 'L', factor: 2.68, factorUnit: 'kgCO2/L', factorKey: 'diesel', timeRange: '2026-07-01 至 07-31', occurredOn: '2026-07-18', evidenceCount: 2, anomaly: 8.6, owner: '设备保障部', status: '需补证', revision: 4, methodologyVersion: '' },
  { id: 'ACT-0331', source: '光伏逆变器阵列 PV-2', activity: 182460, unit: 'kWh', factor: 0.5568, factorUnit: 'tCO2/MWh', factorKey: 'electricity', timeRange: '2026-07-01 至 07-31', occurredOn: '2026-07-22', evidenceCount: 5, anomaly: -1.2, owner: '新能源运维', status: '已核验', revision: 1, methodologyVersion: 'CMS-052-V01' },
  { id: 'ACT-0337', source: '天然气流量计 NG-02', activity: 62.8, unit: 'kNm3', factor: 2.1622, factorUnit: 'tCO2/kNm3', factorKey: 'gas', timeRange: '2026-07-01 至 07-31', occurredOn: '2026-07-25', evidenceCount: 1, anomaly: 12.4, owner: '热力站', status: '待核验', revision: 1, methodologyVersion: '' }
];

const defaultFindings: Finding[] = [
  { id: 'F-104', recordId: 'ACT-0337', type: '缺失证据', title: '缺少天然气流量计校验证书', detail: '计量记录已提交，但校准有效期证明不足。', assignee: '热力站 · 韩跃', due: '09-30', status: '开放' },
  { id: 'F-105', recordId: 'ACT-0325', type: '异常波动', title: '柴油消耗较上期上升 18.6%', detail: '项目方尚未说明测试运行时长变化。', assignee: '设备保障部 · 姜婷', due: '10-02', status: '补证中' },
  { id: 'F-106', recordId: 'ACT-0318', type: '单位不一致', title: '原始表单位为 MWh，台账记录为 kWh', detail: '需补充单位换算链并保留原始记录。', assignee: '项目现场 · 徐璐', due: '09-30', status: '开放' }
];

const defaultBatch: BatchState = { id: 'BATCH-2026-Q3', period: '2026 年第三监测期', version: 1, status: '进行中' };

type State = {
  records: CarbonRecord[];
  findings: Finding[];
  selectedRecordId: string;
  sampledIds: string[];
  issuanceChecks: Record<string, boolean>;
  methodologyVersions: MethodologyVersion[];
  versionChanges: VersionChange[];
  batch: BatchState;
  backfilledIds: string[];
  selectRecord: (id: string) => void;
  toggleSample: (id: string) => void;
  startCorrection: (id: string) => void;
  verifyRecord: (id: string) => void;
  batchVerify: () => void;
  requestEvidence: (findingId: string) => void;
  closeFinding: (findingId: string) => void;
  toggleIssuanceCheck: (id: string) => void;
  reviseValue: (id: string, value: number, reason: string) => void;
  backfillMethodologyVersions: () => void;
  createVersionChangeDraft: () => void;
  confirmVersionChange: (draftId: string, actor: string, forceFail?: boolean) => Promise<void>;
  recoverVersionChange: (draftId: string) => Promise<void>;
  dismissConflict: (draftId: string) => void;
  submitIssuance: () => Promise<{ ok: boolean; blockers: string[] }>;
};

// 换版确认成功后的状态归并：若新版已生效则只确认不重复套因子（幂等），否则按发生日期切换
function confirmedState(state: State, draft: VersionChange, actor: string, confirmedAt: string): Partial<State> {
  const alreadyCurrent = state.methodologyVersions.some(
    (version) => version.version === draft.toVersion && version.status === '现行'
  );
  if (alreadyCurrent) {
    return {
      versionChanges: state.versionChanges.map((change) =>
        change.id === draft.id
          ? { ...change, status: '已确认' as const, confirmedBy: actor, confirmedAt, batchVersion: state.batch.version, conflict: false, conflictLatestBatchVersion: undefined, conflictDiff: undefined }
          : change
      )
    };
  }
  return {
    methodologyVersions: [
      ...state.methodologyVersions.map((version) =>
        version.version === draft.fromVersion ? { ...version, status: '已废止' as const } : version
      ),
      {
        version: draft.toVersion,
        label: '方法学换版',
        effectiveFrom: draft.effectiveAt,
        basis: draft.basis,
        status: '现行',
        factors: draft.factors
      }
    ],
    records: state.records.map((record) =>
      draft.affectedRecordIds.includes(record.id)
        ? { ...record, methodologyVersion: draft.toVersion, factor: draft.factors[record.factorKey], pendingReviewReason: undefined }
        : record
    ),
    versionChanges: state.versionChanges.map((change) =>
      change.id === draft.id
        ? { ...change, status: '已确认' as const, confirmedBy: actor, confirmedAt, batchVersion: state.batch.version + 1, conflict: false, conflictLatestBatchVersion: undefined, conflictDiff: undefined }
        : change
    ),
    batch: { ...state.batch, version: state.batch.version + 1 }
  };
}

// 冲突归并：后到者看到最新版本与未处理差异，并把快照更新为最新，便于其核对后重试
function conflictState(state: State, draftId: string, latestBatchVersion: number | undefined, diff: string[] | undefined): Partial<State> {
  return {
    versionChanges: state.versionChanges.map((change) =>
      change.id === draftId
        ? {
            ...change,
            status: '待确认' as const,
            conflict: true,
            conflictLatestBatchVersion: latestBatchVersion,
            conflictDiff: diff,
            batchVersionSnapshot: latestBatchVersion ?? change.batchVersionSnapshot
          }
        : change
    ),
    batch: { ...state.batch, version: latestBatchVersion ?? state.batch.version }
  };
}

export const useCarbonStore = create<State>()(
  persist(
    (set, get) => ({
      records: defaultRecords,
      findings: defaultFindings,
      selectedRecordId: 'ACT-0318',
      sampledIds: ['ACT-0318', 'ACT-0337'],
      issuanceChecks: { evidence: false, calculation: true, revisions: true, methodology: false },
      methodologyVersions: defaultMethodologyVersions,
      versionChanges: [],
      batch: defaultBatch,
      backfilledIds: [],
      selectRecord: (id) => set({ selectedRecordId: id }),
      toggleSample: (id) => set((state) => ({ sampledIds: state.sampledIds.includes(id) ? state.sampledIds.filter((item) => item !== id) : [...state.sampledIds, id] })),
      startCorrection: (id) => set((state) => ({ records: state.records.map((record) => record.id === id ? { ...record, status: '复核中' } : record) })),
      verifyRecord: (id) => set((state) => ({ records: state.records.map((record) => record.id === id ? { ...record, status: '已核验' } : record) })),
      batchVerify: () => set((state) => ({ records: state.records.map((record) => state.sampledIds.includes(record.id) && record.status !== '需补证' ? { ...record, status: '已核验' } : record) })),
      requestEvidence: (findingId) => set((state) => ({ findings: state.findings.map((finding) => finding.id === findingId ? { ...finding, status: '补证中' } : finding) })),
      closeFinding: (findingId) => set((state) => ({ findings: state.findings.map((finding) => finding.id === findingId ? { ...finding, status: '已关闭' } : finding) })),
      toggleIssuanceCheck: (id) => set((state) => ({ issuanceChecks: { ...state.issuanceChecks, [id]: !state.issuanceChecks[id] } })),
      reviseValue: (id, value, reason) => set((state) => ({
        records: state.records.map((record) => record.id === id ? { ...record, activity: value, revision: record.revision + 1, status: '复核中' } : record),
        findings: reason ? state.findings : state.findings
      })),

      // 升级回填：旧数据缺方法学版本，回填首版并登记待复核原因（幂等，可重复扫描）
      backfillMethodologyVersions: () => set((state) => {
        const backfilled: string[] = [];
        const records = state.records.map((record) => {
          if (record.methodologyVersion) return record;
          backfilled.push(record.id);
          return { ...record, methodologyVersion: 'CMS-052-V01', pendingReviewReason: BACKFILL_REASON };
        });
        return {
          records,
          backfilledIds: backfilled.length ? Array.from(new Set([...state.backfilledIds, ...backfilled])) : state.backfilledIds
        };
      }),

      // 发起 V01 → V02 换版草案（按发生日期确定受影响记录，旧数据不整批套新因子）
      createVersionChangeDraft: () => set((state) => {
        if (state.versionChanges.some((change) => change.toVersion === 'CMS-052-V02')) return state;
        const fromVersion = state.methodologyVersions.find((version) => version.version === 'CMS-052-V01') ?? state.methodologyVersions[0];
        const draft = buildV02Change(state.records, fromVersion, state.batch.version);
        return {
          versionChanges: [
            ...state.versionChanges,
            { ...draft, status: '待确认' as const, batchVersion: state.batch.version }
          ]
        };
      }),

      // 换版确认：携带批次版本快照与幂等令牌。先到者成立，后到者看到最新版本与未处理差异。
      confirmVersionChange: async (draftId, actor, forceFail = false) => {
        const state = get();
        const draft = state.versionChanges.find((change) => change.id === draftId);
        if (!draft || draft.status === '已确认') return;
        const clientToken = draft.clientToken ?? crypto.randomUUID();
        set((s) => ({
          versionChanges: s.versionChanges.map((change) =>
            change.id === draftId ? { ...change, clientToken, status: '待确认' as const, conflict: false } : change
          )
        }));
        try {
          const res = await submitVersionChange({
            draft,
            batchVersion: draft.batchVersionSnapshot,
            clientToken,
            actor,
            forceFail
          });
          if (res.status === 409 && res.data.conflict) {
            set((s) => conflictState(s, draftId, res.data.latestBatchVersion, res.data.diff));
            return;
          }
          if (res.status >= 500 || !res.data.accepted) {
            // 写入失败：未确认记录保留为待恢复，不重复生成版本
            set((s) => ({
              versionChanges: s.versionChanges.map((change) =>
                change.id === draftId ? { ...change, status: '写入失败' as const } : change
              )
            }));
            return;
          }
          const confirmedAt = res.data.change?.confirmedAt ?? new Date().toISOString();
          set((s) => confirmedState(s, draft, actor, confirmedAt));
        } catch {
          set((s) => ({
            versionChanges: s.versionChanges.map((change) =>
              change.id === draftId ? { ...change, status: '写入失败' as const } : change
            )
          }));
        }
      },

      // 写入失败恢复：从未确认记录恢复，沿用同一幂等令牌重试，不重复生成版本
      recoverVersionChange: async (draftId) => {
        const state = get();
        const draft = state.versionChanges.find((change) => change.id === draftId);
        if (!draft || draft.status !== '写入失败' || !draft.clientToken) return;
        try {
          const res = await submitVersionChange({
            draft,
            batchVersion: draft.batchVersionSnapshot,
            clientToken: draft.clientToken,
            actor: draft.confirmedBy ?? '核验员',
            forceFail: false
          });
          if (res.status === 409 && res.data.conflict) {
            set((s) => conflictState(s, draftId, res.data.latestBatchVersion, res.data.diff));
            return;
          }
          if (!res.data.accepted) {
            set((s) => ({
              versionChanges: s.versionChanges.map((change) =>
                change.id === draftId ? { ...change, status: '写入失败' as const } : change
              )
            }));
            return;
          }
          const confirmedAt = res.data.change?.confirmedAt ?? new Date().toISOString();
          set((s) => confirmedState(s, draft, draft.confirmedBy ?? '核验员', confirmedAt));
        } catch {
          set((s) => ({
            versionChanges: s.versionChanges.map((change) =>
              change.id === draftId ? { ...change, status: '写入失败' as const } : change
            )
          }));
        }
      },

      dismissConflict: (draftId) => set((state) => ({
        versionChanges: state.versionChanges.map((change) =>
          change.id === draftId ? { ...change, conflict: false } : change
        )
      })),

      // 签发准备：只接收完整批次，门禁不通过则不受理
      submitIssuance: async () => {
        const state = get();
        const blockers = computeBlockers({ records: state.records, findings: state.findings, versionChanges: state.versionChanges });
        if (blockers.length) return { ok: false, blockers };
        try {
          const res = await submitIssuance({ batchId: state.batch.id, blockers });
          if (res.status >= 400 || !res.data.accepted) {
            return { ok: false, blockers: res.data.blockers ?? blockers };
          }
          set((s) => ({ batch: { ...s.batch, status: '已提交' } }));
          return { ok: true, blockers: [] };
        } catch {
          return { ok: false, blockers: ['签发请求写入失败，请重试'] };
        }
      }
    }),
    {
      name: 'yy60-carbon-evidence',
      version: 2,
      migrate: (persisted) => {
        const previous = (persisted ?? {}) as Partial<State>;
        return {
          ...previous,
          records: (previous.records ?? defaultRecords).map((record, index) => ({
            ...record,
            factorKey: record.factorKey ?? defaultRecords[index]?.factorKey ?? 'electricity',
            occurredOn: record.occurredOn ?? defaultRecords[index]?.occurredOn ?? '2026-07-01',
            methodologyVersion: record.methodologyVersion ?? ''
          })),
          findings: previous.findings ?? defaultFindings,
          methodologyVersions: previous.methodologyVersions ?? defaultMethodologyVersions,
          versionChanges: previous.versionChanges ?? [],
          batch: previous.batch ?? defaultBatch,
          backfilledIds: previous.backfilledIds ?? []
        };
      },
      onRehydrateStorage: () => (state) => {
        // 升级后自动回填历史数据并发起换版草案，保证开箱即看到完整链路
        state?.backfillMethodologyVersions();
        state?.createVersionChangeDraft();
      }
    }
  )
);
