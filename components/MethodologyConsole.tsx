'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Divider,
  Stack,
  Tooltip,
  Typography
} from '@mui/material';
import {
  AutoAwesomeOutlined,
  AutorenewOutlined,
  FactCheckOutlined,
  HistoryToggleOffOutlined,
  PeopleAltOutlined,
  RestartAltOutlined,
  SystemUpdateAltOutlined,
  UploadFileOutlined,
  WarningAmberOutlined
} from '@mui/icons-material';
import {
  backfillLegacyRecords,
  confirmMethodologySwitch,
  fetchMethodology,
  importFieldData,
  recoverPendingWrites,
  resetMethodology,
  writeFactorAssignment
} from '@/lib/api';
import { methodologyVersions, VERSION_SWITCH_DATE } from '@/lib/methodology-schema-types';
import type { PendingWrite, VersionDiff } from '@/lib/methodology-schema';
import { useCarbonStore } from '@/lib/store';

type LogEntry = { id: number; tone: 'success' | 'warning' | 'error' | 'info'; text: string };

export default function MethodologyConsole() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['methodology'], queryFn: fetchMethodology });
  const [batchId, setBatchId] = useState('B-2026-07');
  const [verifier, setVerifier] = useState<'沈楠' | '韩跃'>('沈楠');
  const [backfillReasons, setBackfillReasons] = useState<{ recordId: string; reason: string }[]>([]);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [tokenSeq, setTokenSeq] = useState(1);
  const [confirmOutcome, setConfirmOutcome] = useState<{ tone: 'success' | 'error'; title: string; detail: string } | null>(null);
  const setBatchComplete = useCarbonStore((state) => state.setBatchComplete);

  const batch = data?.batches.find((item) => item.id === batchId);
  const pushLog = (entry: Omit<LogEntry, 'id'>) => setLog((prev) => [{ ...entry, id: Date.now() + Math.random() }, ...prev].slice(0, 12));

  const refresh = (snapshot: typeof data) => {
    queryClient.setQueryData(['methodology'], snapshot);
  };

  const writeMutation = useMutation({
    mutationFn: (input: { recordId: string; fail?: boolean }) =>
      writeFactorAssignment({ batchId, recordId: input.recordId, clientToken: `w:${batchId}:${input.recordId}:${tokenSeq}`, fail: input.fail }),
    onMutate: () => setTokenSeq((n) => n + 1),
    onSuccess: (result, variables) => {
      refresh(result.snapshot);
      if (result.status === 'failed') {
        pushLog({ tone: 'error', text: `${variables.recordId} 写入失败：已保留为未确认记录（无版本号），可从恢复区重试` });
      } else if (result.status === 'duplicate') {
        pushLog({ tone: 'info', text: `${variables.recordId} 幂等命中：clientToken 已处理过，未重复生成版本（沿用 V${result.sequence}` });
      } else {
        pushLog({ tone: 'success', text: `${variables.recordId} 按发生日期确认因子，登记批次版本 #${result.sequence}，原计算依据已归档保留` });
      }
    }
  });

  const recoverMutation = useMutation({
    mutationFn: (failRecordIds: string[]) => recoverPendingWrites(batchId, failRecordIds),
    onSuccess: (result) => {
      refresh(result.snapshot);
      const dup = result.recovered.filter((r) => r.status === 'duplicate').length;
      const ok = result.recovered.filter((r) => r.status === 'confirmed').length;
      const failed = result.recovered.filter((r) => r.status === 'failed').length;
      pushLog({
        tone: failed ? 'warning' : 'success',
        text: `从未确认记录恢复：成功 ${ok} 条、幂等跳过 ${dup} 条${failed ? `、仍失败 ${failed} 条` : ''}；恢复使用确定性 token，重试不重复生成版本`
      });
    }
  });

  const confirmMutation = useMutation({
    mutationFn: () => confirmMethodologySwitch({
      batchId,
      expectedSequence: batch?.sequence ?? 0,
      verifier
    }),
    onSuccess: (result) => {
      refresh(result.snapshot);
      if (result.ok) {
        setConfirmOutcome({ tone: 'success', title: `换版确认成立 · 批次版本 #${result.sequence}`, detail: `${verifier} 的提交先到，批次锁定 ${result.confirmedVersionId}（${new Date(result.confirmedAt).toLocaleTimeString()}）。` });
        pushLog({ tone: 'success', text: `整批确认成功，批次版本进位至 #${result.sequence}` });
      } else {
        setConfirmOutcome({
          tone: 'error',
          title: result.code === 'already_confirmed' ? '确认未成立：批次已被先到者锁定' : `确认被拒（${result.code}）`,
          detail: `${result.message} 最新批次版本 #${result.latestSequence}，未处理差异 ${result.diffs.length} 条。`
        });
        pushLog({ tone: 'error', text: `确认被拒：${result.code}，最新版本 #${result.latestSequence}，差异 ${result.diffs.length} 条` });
      }
    }
  });

  // 两位核验员同时提交：先到者成立，后到者看到最新版本与未处理差异
  const concurrentConfirm = async () => {
    if (!batch) return;
    const expected = batch.sequence;
    setConfirmOutcome(null);
    const requests = [
      confirmMethodologySwitch({ batchId, expectedSequence: expected, verifier: '沈楠' }),
      confirmMethodologySwitch({ batchId, expectedSequence: expected, verifier: '韩跃' })
    ];
    const results = await Promise.allSettled(requests);
    const lastSnapshot = (results.find((r) => r.status === 'fulfilled') as PromiseFulfilledResult<Awaited<ReturnType<typeof confirmMethodologySwitch>>> | undefined)?.value?.snapshot;
    if (lastSnapshot) refresh(lastSnapshot);
    const lines = results.map((r, i) => {
      const name = i === 0 ? '沈楠' : '韩跃';
      if (r.status === 'rejected') return { tone: 'error' as const, text: `${name} 请求异常` };
      return r.value.ok
        ? { tone: 'success' as const, text: `先到者 ${name} 成立：批次锁定 ${r.value.confirmedVersionId}，版本进位 #${r.value.sequence}` }
        : { tone: 'error' as const, text: `后到者 ${name} 被拒（${r.value.code}）：看到最新版本 #${r.value.latestSequence} 与 ${r.value.diffs.length} 条未处理差异` };
    });
    lines.forEach((line) => pushLog(line));
    setConfirmOutcome({
      tone: lines.some((l) => l.tone === 'success') ? 'success' : 'error',
      title: '并发提交完成（两人同版本号）',
      detail: lines.map((l) => l.text).join('；')
    });
  };

  const backfillMutation = useMutation({
    mutationFn: () => backfillLegacyRecords(batchId),
    onSuccess: (result) => {
      refresh(result.snapshot);
      setBackfillReasons(result.reasons);
      pushLog({ tone: 'info', text: `旧数据升级：${result.reasons.length} 条记录回填首版 CMS-052-V01，已列出待复核原因` });
    }
  });

  const importMutation = useMutation({
    mutationFn: () => importFieldData(batchId),
    onSuccess: (snapshot) => {
      refresh(snapshot);
      setBatchComplete(batchId, true, '现场数据齐备，待换版确认');
      pushLog({ tone: 'info', text: '新到现场数据导入完成，批次标记为数据齐备（旧记录不整批套新因子）' });
    }
  });

  const resetMutation = useMutation({
    mutationFn: () => resetMethodology(),
    onSuccess: (snapshot) => {
      refresh(snapshot);
      setBackfillReasons([]);
      setConfirmOutcome(null);
      setLog([]);
      useCarbonStore.getState().setBatchComplete('B-2026-07', false, '换版确认尚未成立，新到现场数据仍挂旧因子');
      useCarbonStore.getState().setBatchComplete('B-2026-Q2', false, '3 条旧数据缺方法学版本，回填首版后待复核确认');
    }
  });

  const runSequentialWrite = async (firstFails: boolean) => {
    if (!batch) return;
    const ids = queryClient.getQueryData<{ batches: { id: string; pendingWrites: { recordId: string }[] }[] }>(['methodology'])
      ?.batches.find((item) => item.id === batchId)?.pendingWrites.map((p) => p.recordId) ?? [];
    for (let i = 0; i < ids.length; i++) {
      await writeMutation.mutateAsync({ recordId: ids[i], fail: firstFails && i === 0 });
    }
  };

  return (
    <Box>
      <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="flex-end" sx={{ mb: { xs: 0, md: -1 } }}>
        <Button size="small" variant="outlined" startIcon={<RestartAltOutlined />} onClick={() => resetMutation.mutate()}>重置场景</Button>
      </Stack>

      {isLoading && <Typography fontSize={12}>加载批次状态…</Typography>}

      {data && batch && (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', xl: '300px minmax(0, 1fr) 360px' }, gap: 1.5, alignItems: 'start' }}>
          {/* 左：版本目录与规则 */}
          <Stack spacing={1.5}>
            <Card elevation={0} variant="outlined">
              <CardContent>
                <Typography fontWeight={800} fontSize={14}>排放因子目录</Typography>
                <Typography fontSize={11} color="text.secondary" mb={1.2}>因子绑定方法学版本，换版不覆盖历史值</Typography>
                {methodologyVersions.map((version) => (
                  <Box key={version.id} sx={{ border: '1px solid', borderColor: version.id === 'CMS-052-V02' ? 'primary.light' : 'divider', borderRadius: 1, p: 1.2, mb: 1, bgcolor: version.id === 'CMS-052-V02' ? 'rgba(22,107,85,.05)' : 'white' }}>
                    <Stack direction="row" justifyContent="space-between" alignItems="center">
                      <Typography fontSize={12.5} fontWeight={800}>{version.id}</Typography>
                      {version.id === 'CMS-052-V02' ? <Chip size="small" color="primary" label="新版" /> : <Chip size="small" variant="outlined" label="首版" />}
                    </Stack>
                    <Typography fontSize={10.5} color="text.secondary" mt={.3}>生效 {version.effectiveFrom}{version.effectiveTo ? ` 至 ${version.effectiveTo}` : ' 起'} · {version.basis}</Typography>
                    <Box sx={{ mt: .8, fontFamily: 'monospace', fontSize: 10.5, lineHeight: 1.7 }}>
                      {Object.entries(version.factorByKind).map(([kind, factor]) => (
                        <Box key={kind}>{factor.value} {factor.unit} <Box component="span" sx={{ color: 'text.secondary' }}>· {kind}</Box></Box>
                      ))}
                    </Box>
                  </Box>
                ))}
              </CardContent>
            </Card>
            <Card elevation={0} variant="outlined">
              <CardContent>
                <Typography fontWeight={800} fontSize={13} mb={1}>六条处置规则</Typography>
                {[
                  ['按发生日期保留原因子', '换版日之前的数据不整批套新因子，因子与计算依据随版本归档'],
                  ['新现场数据走新版', '07-16（含）后到的数据按 V02 新因子计算'],
                  ['确认带批次版本', '两位核验员同版本号提交：先到者成立，后到者收 409 + 最新版本/差异'],
                  ['失败从未确认记录恢复', '重试凭确定性 token 幂等，不重复生成版本'],
                  ['旧数据回填首版', '缺方法学版本的历史数据回填 V01 并列待复核原因'],
                  ['签发只接收完整批次', '数据齐备 + 确认成立，批次才进入签发准备门禁']
                ].map(([title, detail]) => (
                  <Stack key={title} direction="row" spacing={1} sx={{ py: .8, borderTop: '1px solid #edf0ef' }}>
                    <FactCheckOutlined color="primary" sx={{ fontSize: 15, mt: .2 }} />
                    <Box><Typography fontSize={11.5} fontWeight={700}>{title}</Typography><Typography fontSize={10.5} color="text.secondary">{detail}</Typography></Box>
                  </Stack>
                ))}
              </CardContent>
            </Card>
          </Stack>

          {/* 中：批次工作区 */}
          <Stack spacing={1.5}>
            <Card elevation={0} variant="outlined">
              <CardContent>
                <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'flex-start', sm: 'center' }} spacing={1.2}>
                  <Box>
                    <Typography fontWeight={800} fontSize={14}>批次</Typography>
                    <Stack direction="row" spacing={1} mt={.8} flexWrap="wrap" useFlexGap>
                      {data.batches.map((item) => (
                        <Chip
                          key={item.id}
                          clickable
                          size="small"
                          variant={item.id === batchId ? 'filled' : 'outlined'}
                          color={item.id === batchId ? 'primary' : 'default'}
                          label={`${item.label} · #${item.sequence}`}
                          onClick={() => { setBatchId(item.id); setConfirmOutcome(null); setBackfillReasons([]); }}
                        />
                      ))}
                    </Stack>
                  </Box>
                  <Stack direction="row" spacing={.8} flexWrap="wrap" useFlexGap>
                    <Button size="small" variant="outlined" startIcon={<UploadFileOutlined />} onClick={() => importMutation.mutate()}>新到现场数据导入</Button>
                    <Button size="small" variant="outlined" startIcon={<AutoAwesomeOutlined />} onClick={() => backfillMutation.mutate()} disabled={!batch.pendingWrites.some((p) => p.backfill)}>回填首版并复核</Button>
                  </Stack>
                </Stack>
                <Divider sx={{ my: 1.3 }} />
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
                  <MetaItem label="监测期" value={batch.period} />
                  <MetaItem label="当前批次版本" value={`#${batch.sequence}`} />
                  <MetaItem label="数据齐备" value={batch.complete ? '是' : '否'} warn={!batch.complete} />
                  <MetaItem label="未确认记录" value={`${batch.pendingCount} 条`} warn={batch.pendingCount > 0} />
                  <MetaItem label="确认状态" value={batch.confirmedVersionId ? `已锁定 ${batch.confirmedVersionId}` : '未确认'} warn={!batch.confirmedVersionId} />
                </Stack>
                <Typography fontSize={10.5} color="text.secondary" mt={1}>{batch.completenessNote}{batch.confirmedBy ? ` · 先到核验员：${batch.confirmedBy}` : ''}</Typography>
              </CardContent>
            </Card>

            {batch.pendingWrites.length > 0 && (
              <Card elevation={0} variant="outlined">
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ p: 1.6, pb: 1 }}>
                  <Box>
                    <Typography fontWeight={800} fontSize={14}>未确认记录 / 待处理差异</Typography>
                    <Typography fontSize={11} color="text.secondary">按发生日期逐条确认适用版本；可模拟写入失败后从恢复区重试</Typography>
                  </Box>
                  <Stack direction="row" spacing={.8}>
                    <Button size="small" variant="outlined" color="warning" startIcon={<WarningAmberOutlined />} onClick={() => runSequentialWrite(true)} disabled={writeMutation.isPending}>逐条确认（首条模拟失败）</Button>
                    <Button size="small" variant="contained" startIcon={<SystemUpdateAltOutlined />} onClick={() => recoverMutation.mutate([])} disabled={!batch.pendingWrites.some((p) => p.attempts > 0)}>从未确认记录恢复</Button>
                  </Stack>
                </Stack>
                <Divider />
                {batch.pendingWrites.map((pending) => {
                  const diff = batch.diffs.find((item) => item.recordId === pending.recordId);
                  return <PendingRow key={pending.recordId} pending={pending} diff={diff}
                    onConfirm={(fail) => writeMutation.mutate({ recordId: pending.recordId, fail })}
                    busy={writeMutation.isPending} />;
                })}
              </Card>
            )}

            {batch.confirmedRows.length > 0 && (
              <Card elevation={0} variant="outlined">
                <Typography fontWeight={800} fontSize={14} sx={{ p: 1.6, pb: 1 }}>已确认记录（版本与计算依据归档）</Typography>
                <Divider />
                {batch.confirmedRows.map((row) => (
                  <Box key={row.recordId} sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1.2fr .8fr 1fr .8fr' }, gap: 1, px: 1.6, py: 1.1, borderTop: '1px solid #edf0ef', alignItems: 'center' }}>
                    <Box><Typography fontSize={12} fontWeight={700}>{row.recordId}</Typography><Typography fontSize={10.5} color="text.secondary">发生日期 {row.occurredOn}</Typography></Box>
                    <Chip size="small" color={row.appliedVersion === 'CMS-052-V02' ? 'primary' : 'default'} variant={row.appliedVersion === 'CMS-052-V02' ? 'filled' : 'outlined'} label={row.appliedVersion} sx={{ justifySelf: 'start' }} />
                    <Typography fontSize={11.5}>{row.factor} {row.factorUnit}</Typography>
                    <Typography fontSize={10} color="text.secondary" sx={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{row.factorBasis}</Typography>
                  </Box>
                ))}
              </Card>
            )}

            {backfillReasons.length > 0 && (
              <Card elevation={0} variant="outlined">
                <CardContent>
                  <Stack direction="row" spacing={1} alignItems="center" mb={1}>
                    <HistoryToggleOffOutlined color="secondary" fontSize="small" />
                    <Typography fontWeight={800} fontSize={13.5}>旧数据回填首版 · 待复核原因（{backfillReasons.length}）</Typography>
                  </Stack>
                  {backfillReasons.map((item) => (
                    <Alert key={item.recordId} severity="warning" sx={{ mb: .8, py: .2, '& .MuiAlert-message': { fontSize: 11.5 } }}>
                      <b>{item.recordId}</b>：{item.reason}
                    </Alert>
                  ))}
                </CardContent>
              </Card>
            )}
          </Stack>

          {/* 右：确认与审计 */}
          <Stack spacing={1.5}>
            <Card elevation={0} variant="outlined">
              <CardContent>
                <Typography fontWeight={800} fontSize={14}>换版确认（带批次版本）</Typography>
                <Typography fontSize={11} color="text.secondary" mt={.3}>提交携带当前批次版本 #{batch.sequence} 做乐观锁</Typography>
                <Stack direction="row" spacing={.8} mt={1.3}>
                  {(['沈楠', '韩跃'] as const).map((name) => (
                    <Chip key={name} size="small" clickable color={verifier === name ? 'primary' : 'default'} variant={verifier === name ? 'filled' : 'outlined'} label={name} onClick={() => setVerifier(name)} />
                  ))}
                </Stack>
                <Stack spacing={1} mt={1.5}>
                  <Button fullWidth variant="contained" startIcon={<FactCheckOutlined />} disabled={confirmMutation.isPending} onClick={() => confirmMutation.mutate()}>
                    {verifier} 提交确认（版本 #{batch.sequence}）
                  </Button>
                  <Tooltip title="两位核验员以同一批次版本同时提交：先到者成立，后到者看到最新版本与未处理差异">
                    <Button fullWidth variant="outlined" startIcon={<PeopleAltOutlined />} disabled={confirmMutation.isPending} onClick={concurrentConfirm}>
                      模拟两人同时提交
                    </Button>
                  </Tooltip>
                </Stack>
                {confirmOutcome && (
                  <Alert severity={confirmOutcome.tone === 'success' ? 'success' : 'error'} sx={{ mt: 1.3 }}>
                    <Typography fontSize={12} fontWeight={800}>{confirmOutcome.title}</Typography>
                    <Typography fontSize={11} mt={.3}>{confirmOutcome.detail}</Typography>
                  </Alert>
                )}
                {!batch.complete && <Alert severity="warning" sx={{ mt: 1 }}><Typography fontSize={11}>批次不完整：需先完成现场数据导入；有未确认记录（含写入失败）时整批确认同样被拒。</Typography></Alert>}
              </CardContent>
            </Card>

            <Card elevation={0} variant="outlined">
              <CardContent>
                <Stack direction="row" spacing={1} alignItems="center" mb={1}>
                  <AutorenewOutlined fontSize="small" color="primary" />
                  <Typography fontWeight={800} fontSize={13.5}>失败恢复与幂等</Typography>
                </Stack>
                <Typography fontSize={11} color="text.secondary" mb={1}>写入失败只留下“未确认记录”，恢复时按 <code>recover:{`{批次}`}:{`{记录}`}</code> 确定性 token 重试，已成功的不会重复生成版本。</Typography>
                <Button fullWidth size="small" variant="outlined" color="warning" onClick={() => recoverMutation.mutate(batch.pendingWrites.map((p) => p.recordId)[0] ? [batch.pendingWrites[0].recordId] : [])} disabled={batch.pendingWrites.length === 0}>
                  恢复重试（仍让首条失败，验证可反复重试）
                </Button>
              </CardContent>
            </Card>

            <Card elevation={0} variant="outlined">
              <CardContent>
                <Typography fontWeight={800} fontSize={13.5} mb={1}>操作审计</Typography>
                {log.length === 0 && <Typography fontSize={11} color="text.secondary">尚无操作。可先「逐条确认（首条模拟失败）」再「从未确认记录恢复」。</Typography>}
                {log.map((entry) => (
                  <Alert key={entry.id} severity={entry.tone === 'success' ? 'success' : entry.tone === 'error' ? 'error' : entry.tone === 'warning' ? 'warning' : 'info'} sx={{ mb: .7, py: .15, '& .MuiAlert-message': { fontSize: 11 } }}>
                    {entry.text}
                  </Alert>
                ))}
              </CardContent>
            </Card>
          </Stack>
        </Box>
      )}
    </Box>
  );
}

function MetaItem({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
      <Typography fontSize={12.5} fontWeight={800} color={warn ? 'secondary.main' : 'text.primary'}>{value}</Typography>
    </Box>
  );
}

function PendingRow({ pending, diff, onConfirm, busy }: { pending: PendingWrite; diff?: VersionDiff; onConfirm: (fail: boolean) => void; busy: boolean }) {
  const expectedVersion = diff?.expectedVersion ?? (pending.occurredOn >= VERSION_SWITCH_DATE ? 'CMS-052-V02' : 'CMS-052-V01');
  return (
    <Box sx={{ px: 1.6, py: 1.2, borderTop: '1px solid #edf0ef' }}>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1.2fr .7fr 1fr 1fr auto' }, gap: 1, alignItems: 'center' }}>
        <Box>
          <Typography fontSize={12.5} fontWeight={700}>{pending.recordId}</Typography>
          <Typography fontSize={10.5} color="text.secondary">发生日期 {pending.occurredOn}{pending.backfill ? ' · 旧数据缺版本，待回填首版' : ''}</Typography>
        </Box>
        <Box>
          <Typography variant="caption" color="text.secondary">适用版本</Typography>
          <Chip size="small" label={expectedVersion} color={expectedVersion === 'CMS-052-V02' ? 'primary' : 'default'} variant={expectedVersion === 'CMS-052-V02' ? 'filled' : 'outlined'} />
        </Box>
        <Box>
          <Typography variant="caption" color="text.secondary">当前 → 应适用因子</Typography>
          <Typography fontSize={11.5} sx={{ fontFamily: 'monospace' }}>
            {diff ? `${diff.currentFactor} → ` : ''}<b>{diff ? diff.expectedFactor : '—'}</b>
          </Typography>
        </Box>
        <Box>
          {pending.lastError
            ? <Chip size="small" color="error" label={`写入失败 · 尝试 ${pending.attempts} 次`} />
            : <Chip size="small" variant="outlined" label={pending.attempts > 0 ? `已尝试 ${pending.attempts} 次` : '未写入'} />}
        </Box>
        <Stack direction="row" spacing={.6}>
          <Tooltip title="模拟本次写入失败：仅保留未确认记录，不产生版本号"><Button size="small" color="warning" variant="outlined" disabled={busy} onClick={() => onConfirm(true)}>失败</Button></Tooltip>
          <Button size="small" variant="contained" disabled={busy} onClick={() => onConfirm(false)}>按日期确认</Button>
        </Stack>
      </Box>
      {diff && <Typography fontSize={10.5} color="secondary.main" mt={.6}>差异原因：{diff.reason}</Typography>}
    </Box>
  );
}
