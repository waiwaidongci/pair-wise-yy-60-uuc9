// 客户端可安全引用的方法学版本目录与静态类型（不含服务端状态机）

export type MethodologyVersionId = 'CMS-052-V01' | 'CMS-052-V02';
export type FactorKind = 'electricity' | 'steam' | 'diesel' | 'gas';

export const VERSION_SWITCH_DATE = '2026-07-16';

export type MethodologyVersion = {
  id: MethodologyVersionId;
  label: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  basis: string;
  factorByKind: Record<FactorKind, { value: number; unit: string; basis: string }>;
};

export const methodologyVersions: MethodologyVersion[] = [
  {
    id: 'CMS-052-V01',
    label: '方法学首版',
    effectiveFrom: '2024-01-01',
    effectiveTo: '2026-07-15',
    basis: '2024 区域电网平均排放因子 · 首版监测方法',
    factorByKind: {
      electricity: { value: 0.5568, unit: 'tCO2/MWh', basis: 'V01 · 2024 华东电网平均排放因子 0.5568' },
      steam: { value: 0.11, unit: 'tCO2/GJ', basis: 'V01 · 燃料低位热值与含碳量缺省值' },
      diesel: { value: 2.68, unit: 'kgCO2/L', basis: 'V01 · 柴油 IPCC 缺省含碳量（旧口径）' },
      gas: { value: 2.1622, unit: 'tCO2/kNm3', basis: 'V01 · 天然气高位热值缺省排放因子' }
    }
  },
  {
    id: 'CMS-052-V02',
    label: '方法学第二版',
    effectiveFrom: '2026-07-16',
    effectiveTo: null,
    basis: '2026 修订版：区域电网更新因子、低位热值口径修订',
    factorByKind: {
      electricity: { value: 0.5203, unit: 'tCO2/MWh', basis: 'V02 · 2025 华东电网公告因子 0.5203（修订）' },
      steam: { value: 0.1064, unit: 'tCO2/GJ', basis: 'V02 · 低位热值修订参数 0.1064' },
      diesel: { value: 2.73, unit: 'kgCO2/L', basis: 'V02 · 柴油单位热值含碳量更新 2.7300' },
      gas: { value: 2.0925, unit: 'tCO2/kNm3', basis: 'V02 · 天然气 LHV 修订因子 2.0925' }
    }
  }
];

export function versionForDate(date: string): MethodologyVersionId {
  return date >= VERSION_SWITCH_DATE ? 'CMS-052-V02' : 'CMS-052-V01';
}

export function factorEntry(versionId: MethodologyVersionId, kind: FactorKind) {
  const version = methodologyVersions.find((item) => item.id === versionId) ?? methodologyVersions[0];
  return version.factorByKind[kind];
}
