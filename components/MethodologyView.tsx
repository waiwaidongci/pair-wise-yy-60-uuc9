'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Divider,
  Stack,
  Typography
} from '@mui/material';
import { HistoryToggleOffOutlined, LockResetOutlined, PublishedWithChangesOutlined } from '@mui/icons-material';
import { useCarbonStore } from '@/lib/store';
import { computeBlockers, FACTOR_KEY_LABELS, type FactorKey } from '@/lib/methodology';

export default function MethodologyView() {
  const store = useCarbonStore();
  const [forceFail, setForceFail] = useState(false);
  const [issuanceResult, setIssuanceResult] = useState<{ ok: boolean; blockers: string[] } | null>(null);

  useEffect(() => {
    store.backfillMethodologyVersions();
    store.createVersionChangeDraft();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const blockers = useMemo(
    () => computeBlockers({ records: store.records, findings: store.findings, versionChanges: store.versionChanges }),
    [store.records, store.findings, store.versionChanges]
  );
  const pendingChange = store.versionChanges.find((change) => change.status !== '已确认');
  const backfilled = store.records.filter((record) => record.pendingReviewReason);
  const complete = blockers.length === 0;
  const submitted = store.batch.status === '已提交';

  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', xl: 'minmax(0, 1.6fr) 380px' }, gap: 1.5 }}>
      <Stack spacing={1.5}>
        {/* 批次状态 */}
        <Card elevation={0} variant="outlined">
          <CardContent>
            <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1}>
              <Box>
                <Typography fontWeight={800} fontSize={14}>批次 {store.batch.id}</Typography>
                <Typography fontSize={11} color="text.secondary">{store.batch.period} · 当前批次版本 V{store.batch.version}</Typography>
              </Box>
              <Chip
                icon={<PublishedWithChangesOutlined />}
                label={submitted ? '已提交签发' : complete ? '批次完整' : '批次未完整'}
                color={submitted ? 'success' : complete ? 'primary' : 'warning'}
              />
            </Stack>
          </CardContent>
        </Card>

        {/* 方法学版本与换版追溯 */}
        <Card elevation={0} variant="outlined">
          <CardContent>
            <Stack direction="row" spacing={1} alignItems="center" mb={0.5}>
              <HistoryToggleOffOutlined color="primary" fontSize="small" />
              <Typography fontWeight={800} fontSize={14}>方法学版本与换版追溯</Typography>
            </Stack>
            <Typography fontSize={11} color="text.secondary" mb={1.5}>
              按发生日期保留原排放因子与计算依据：期中换版后旧活动数据不整批套新因子，新到现场数据走新版。
            </Typography>
            <Stack spacing={1.2}>
              {store.methodologyVersions.map((version) => {
                const applied = store.records.filter((record) => record.methodologyVersion === version.version);
                return (
                  <Box
                    key={version.version}
                    sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 1.4, opacity: version.status === '已废止' ? 0.72 : 1 }}
                  >
                    <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1} flexWrap="wrap">
                      <Stack direction="row" spacing={1} alignItems="center">
                        <Chip size="small" label={version.version} color={version.status === '现行' ? 'primary' : 'default'} variant={version.status === '现行' ? 'filled' : 'outlined'} />
                        <Typography fontSize={12.5} fontWeight={700}>{version.label}</Typography>
                      </Stack>
                      <Typography fontSize={11} color="text.secondary">生效日期 {version.effectiveFrom}</Typography>
                    </Stack>
                    <Typography fontSize={11} color="text.secondary" mt={0.6}>计算依据：{version.basis}</Typography>
                    <Stack direction="row" spacing={0.7} mt={0.8} flexWrap="wrap" useFlexGap>
                      {(Object.keys(version.factors) as FactorKey[]).map((key) => (
                        <Chip key={key} size="small" variant="outlined" label={`${FACTOR_KEY_LABELS[key]} ${version.factors[key]}`} />
                      ))}
                    </Stack>
                    <Typography fontSize={11} color="text.secondary" mt={0.8}>
                      应用记录（按发生日期）：{applied.length ? applied.map((record) => `${record.id}（${record.occurredOn}）`).join('、') : '—'}
                    </Typography>
                  </Box>
                );
              })}

              {pendingChange && (
                <Box sx={{ border: '1px dashed', borderColor: 'warning.main', borderRadius: 1, p: 1.4, bgcolor: '#fffaf3' }}>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Chip size="small" label="待确认" color="warning" variant="outlined" />
                    <Typography fontSize={12.5} fontWeight={700}>{pendingChange.fromVersion} → {pendingChange.toVersion}</Typography>
                    <Typography fontSize={11} color="text.secondary">生效日期 {pendingChange.effectiveAt}</Typography>
                  </Stack>
                  <Typography fontSize={11} color="text.secondary" mt={0.6}>计算依据：{pendingChange.basis}</Typography>
                  <Box mt={0.8}>
                    <Typography fontSize={11} fontWeight={700}>因子变化</Typography>
                    {pendingChange.factorChanges.map((change) => (
                      <Typography key={change.key} fontSize={11} color="text.secondary">
                        {FACTOR_KEY_LABELS[change.key]}：{change.from} → {change.to}
                      </Typography>
                    ))}
                  </Box>
                  <Box mt={0.8}>
                    <Typography fontSize={11} fontWeight={700}>按发生日期影响</Typography>
                    <Typography fontSize={11} color="text.secondary">
                      沿用旧版：{store.records.filter((record) => !pendingChange.affectedRecordIds.includes(record.id)).map((record) => record.id).join('、') || '—'}
                    </Typography>
                    <Typography fontSize={11} color="text.secondary">走新版：{pendingChange.affectedRecordIds.join('、') || '—'}</Typography>
                  </Box>
                </Box>
              )}
            </Stack>
          </CardContent>
        </Card>

        {/* 历史数据升级回填 */}
        <Card elevation={0} variant="outlined">
          <CardContent>
            <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1}>
              <Box>
                <Typography fontWeight={800} fontSize={14}>历史数据升级回填</Typography>
                <Typography fontSize={11} color="text.secondary">旧数据缺少方法学版本，升级时回填首版并列出待复核原因。</Typography>
              </Box>
              <Button size="small" onClick={store.backfillMethodologyVersions}>重新扫描回填</Button>
            </Stack>
            {backfilled.length === 0 ? (
              <Alert severity="success" sx={{ mt: 1.2 }}>全部记录已关联方法学版本，无待复核历史数据。</Alert>
            ) : (
              <Stack spacing={0.8} mt={1.2}>
                {backfilled.map((record) => (
                  <Box key={record.id} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 1 }}>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Chip size="small" label={record.id} />
                      <Typography fontSize={12} fontWeight={700}>{record.source}</Typography>
                    </Stack>
                    <Typography fontSize={11} color="text.secondary" mt={0.4}>{record.pendingReviewReason}</Typography>
                  </Box>
                ))}
              </Stack>
            )}
          </CardContent>
        </Card>
      </Stack>

      <Stack spacing={1.5}>
        {/* 换版确认（带当前批次版本，先到者成立） */}
        <Card elevation={0} variant="outlined">
          <CardContent>
            <Typography fontWeight={800} fontSize={14}>换版确认（带当前批次版本）</Typography>
            {!pendingChange ? (
              <Alert severity="success" sx={{ mt: 1.2 }}>
                方法学已完成换版，当前为 {store.methodologyVersions.find((version) => version.status === '现行')?.version}。
              </Alert>
            ) : (
              <>
                <Alert severity="info" sx={{ mt: 1.2 }}>
                  待确认换版 {pendingChange.fromVersion} → {pendingChange.toVersion}，生效日期 {pendingChange.effectiveAt}。
                  确认携带当前批次版本 V{pendingChange.batchVersionSnapshot}，两位核验员同时提交时先到者成立。
                </Alert>
                <Stack direction="row" spacing={1} mt={1.5} flexWrap="wrap" useFlexGap>
                  <Button
                    size="small"
                    variant="contained"
                    onClick={() => store.confirmVersionChange(pendingChange.id, '沈楠', forceFail)}
                  >
                    核验员·沈楠 提交
                  </Button>
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={() => store.confirmVersionChange(pendingChange.id, '韩跃', forceFail)}
                  >
                    核验员·韩跃 提交
                  </Button>
                  <Button
                    size="small"
                    color={forceFail ? 'warning' : 'inherit'}
                    variant={forceFail ? 'contained' : 'text'}
                    startIcon={<LockResetOutlined />}
                    onClick={() => setForceFail((value) => !value)}
                  >
                    {forceFail ? '模拟写入失败：开' : '模拟写入失败：关'}
                  </Button>
                </Stack>

                {pendingChange.status === '写入失败' && (
                  <Alert
                    severity="error"
                    sx={{ mt: 1.2 }}
                    action={
                      <Button color="inherit" size="small" onClick={() => store.recoverVersionChange(pendingChange.id)}>
                        恢复并重试
                      </Button>
                    }
                  >
                    写入失败：未确认记录 {pendingChange.pendingRecordIds.join('、')} 已保留。重试使用同一确认令牌，不重复生成版本。
                  </Alert>
                )}

                {pendingChange.conflict && (
                  <Alert
                    severity="warning"
                    sx={{ mt: 1.2 }}
                    action={
                      <Button color="inherit" size="small" onClick={() => store.dismissConflict(pendingChange.id)}>
                        已知悉
                      </Button>
                    }
                  >
                    <Typography fontSize={12} fontWeight={700}>后到者未成立：最新版本 V{pendingChange.conflictLatestBatchVersion}</Typography>
                    {pendingChange.conflictDiff?.map((line, index) => (
                      <Typography key={index} fontSize={11}>· {line}</Typography>
                    ))}
                  </Alert>
                )}

                {pendingChange.status === '已确认' && !pendingChange.conflict && (
                  <Alert severity="success" sx={{ mt: 1.2 }}>
                    换版已确认（{pendingChange.confirmedBy}），批次版本 V{pendingChange.batchVersion}。
                  </Alert>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* 签发门禁：只接收完整批次 */}
        <Card elevation={0} variant="outlined">
          <CardContent>
            <Typography fontWeight={800} fontSize={14}>签发准备门禁</Typography>
            <Typography fontSize={11} color="text.secondary" mb={1.2}>
              只接收完整批次：全部记录核验、发现项关闭、换版确认、回填复核完成。
            </Typography>
            {blockers.length === 0 ? (
              <Alert severity="success">批次完整，可提交签发准备。</Alert>
            ) : (
              <Stack spacing={0.6}>
                {blockers.map((blocker, index) => (
                  <Alert key={index} severity="warning" sx={{ py: 0.3, '& .MuiAlert-icon': { mr: 0.3, fontSize: 17 } }}>
                    <Typography fontSize={11.5}>{blocker}</Typography>
                  </Alert>
                ))}
              </Stack>
            )}
            <Button
              fullWidth
              variant="contained"
              sx={{ mt: 1.5 }}
              disabled={!complete || submitted}
              onClick={async () => setIssuanceResult(await store.submitIssuance())}
            >
              {submitted ? '已提交签发' : '提交签发准备'}
            </Button>
            {issuanceResult && (
              <Alert severity={issuanceResult.ok ? 'success' : 'error'} sx={{ mt: 1 }}>
                {issuanceResult.ok ? '签发准备已受理，批次锁定。' : `签发未受理：${issuanceResult.blockers.join('；')}`}
              </Alert>
            )}
          </CardContent>
        </Card>
      </Stack>
    </Box>
  );
}
