import OpenInNewRounded from '@mui/icons-material/OpenInNewRounded'
import PlayArrowRounded from '@mui/icons-material/PlayArrowRounded'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import ButtonBase from '@mui/material/ButtonBase'
import Paper from '@mui/material/Paper'
import Skeleton from '@mui/material/Skeleton'
import Snackbar from '@mui/material/Snackbar'
import Tab from '@mui/material/Tab'
import Tabs from '@mui/material/Tabs'
import Typography from '@mui/material/Typography'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AppShell } from '../../components/AppShell.tsx'
import { TestStatusChip } from '../../components/StatusChip.tsx'
import { UpdatedAt } from '../../components/UpdatedAt.tsx'
import { downloadTestResult, listLabTests, listMyClinics, startTest, uploadTestResult, type TestOrder, type TestStatus } from '../../lib/api.ts'
import { color } from '../../theme.ts'
import { formatTime, REFRESH_MS } from '../../time.ts'
import { currentLanguage, errorMessage, localized } from '../../translations/i18n.ts'
import { useNow } from '../../useNow.ts'
import { ResultUpload } from './ResultUpload.tsx'
import { formatBytes } from './resultFile.ts'

type TabKey = 'REQUESTED' | 'IN_PROGRESS' | 'AWAITING_REVIEW'
const TABS: { key: TabKey; label: string; empty: string }[] = [
  { key: 'REQUESTED', label: 'lab.tabToStart', empty: 'lab.emptyToStart' },
  { key: 'IN_PROGRESS', label: 'lab.tabInProgress', empty: 'lab.emptyInProgress' },
  { key: 'AWAITING_REVIEW', label: 'lab.tabSent', empty: 'lab.emptySent' },
]
/** An order waiting longer than this is marked in amber. */
const LONG_WAIT_MINUTES = 60

/**
 * The lab worklist (KAN-19): the department's tests, oldest first, in three
 * tabs by status, each showing how long it has waited. The panel beside it
 * starts a test or sends its result to the doctor.
 */
export function LabPage() {
  const { t } = useTranslation()
  const lang = currentLanguage()
  const queryClient = useQueryClient()
  const now = useNow()
  const [tab, setTab] = useState<TabKey>('REQUESTED')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [toast, setToast] = useState<{ message: string; error: boolean } | null>(null)
  const notify = (message: string, error = false) => setToast({ message, error })

  const clinics = useQuery({ queryKey: ['me', 'clinics'], queryFn: listMyClinics })
  const tests = useQuery({ queryKey: ['lab', 'tests'], queryFn: () => listLabTests(), refetchInterval: REFRESH_MS })
  const all = (tests.data ?? []).filter((x) => x.status !== 'RELEASED')
  const byStatus = (s: TestStatus) => all.filter((x) => x.status === s)
  const shown = byStatus(tab)
  const selected = all.find((x) => x.id === selectedId)
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['lab', 'tests'] })

  const waited = (test: TestOrder) => {
    const minutes = Math.max(0, Math.round((now.getTime() - new Date(test.orderedAt).getTime()) / 60_000))
    const fmt = (n: number) => n.toLocaleString(lang === 'ar' ? 'ar-EG' : 'en-GB')
    const text = minutes < 60 ? t('lab.minutes', { count: fmt(minutes) as unknown as number }) : t('lab.hours', { h: fmt(Math.floor(minutes / 60)), m: fmt(minutes % 60) })
    return { minutes, text }
  }

  const start = useMutation({
    mutationFn: (test: TestOrder) => startTest(test.id),
    onSuccess: (test) => {
      notify(t('lab.started', { test: test.testName, name: test.patientName }))
      setTab('IN_PROGRESS')
    },
    onError: (error) => notify(errorMessage(error), true),
    onSettled: refresh,
  })
  const upload = useMutation({
    mutationFn: ({ test, file }: { test: TestOrder; file: File }) => uploadTestResult(test.id, file),
    onSuccess: (test) => {
      notify(t('lab.sent', { test: test.testName, name: test.patientName }))
      setTab('AWAITING_REVIEW')
    },
    onError: (error) => notify(errorMessage(error), true),
    onSettled: refresh,
  })
  const [replacing, setReplacing] = useState(false)

  const openFile = async (test: TestOrder) => {
    const tabWindow = window.open('', '_blank')
    try {
      const url = URL.createObjectURL(await downloadTestResult(test.id))
      if (tabWindow) tabWindow.location.href = url
      else window.location.assign(url)
    } catch (error) {
      tabWindow?.close()
      notify(errorMessage(error), true)
    }
  }

  const oneClinic = (clinics.data ?? []).length <= 1
  const clinicNames = (clinics.data ?? []).map((c) => localized(c.name, lang)).join(' · ')
  const controls = clinicNames ? (
    <Typography sx={{ fontWeight: 600, bgcolor: 'rgba(255,255,255,0.12)', px: 1.75, py: 0.75, borderRadius: '8px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
      {clinicNames}
    </Typography>
  ) : null

  return (
    <AppShell controls={controls}>
      {clinics.data && clinics.data.length === 0 ? (
        <Box sx={{ p: 3, maxWidth: 640 }}><Alert severity="info">{t('lab.noClinics')}</Alert></Box>
      ) : (
        <Box sx={{ flex: 1, display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'minmax(0,1fr) minmax(400px, 38%)' }, gap: 3, p: { xs: 2, md: 3 }, height: { lg: 'calc(100vh - 64px)' }, minHeight: 0, alignContent: { xs: 'start', lg: 'stretch' } }}>
          <Paper component="section" aria-labelledby="lab-title" sx={{ display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', columnGap: 2, px: { xs: 2, md: 2.75 }, pt: 2, pb: 0.5 }}>
              <Box sx={{ minWidth: 0 }}>
                <Typography id="lab-title" variant="h2" component="h1">{t('lab.title')}</Typography>
                {clinicNames && <Typography variant="body2" sx={{ color: color.muted }}>{t('lab.clinics', { clinics: clinicNames })}</Typography>}
              </Box>
              <Box sx={{ flex: 1 }} />
              <UpdatedAt at={tests.dataUpdatedAt} refreshing={tests.isFetching} onRefresh={refresh} />
            </Box>
            <Tabs value={tab} onChange={(_e, v: TabKey) => setTab(v)} sx={{ px: 1.5, borderBottom: `1px solid ${color.rule}` }} variant="scrollable" allowScrollButtonsMobile>
              {TABS.map((x) => (
                <Tab
                  key={x.key}
                  value={x.key}
                  label={
                    <Box component="span" sx={{ display: 'inline-flex', gap: 1, alignItems: 'center' }}>
                      {t(x.label)}
                      <Box component="span" className="tabular" sx={{ px: 0.875, borderRadius: 999, bgcolor: tab === x.key ? color.brandTint : color.ruleSoft, fontSize: '0.8125rem' }}>
                        {byStatus(x.key).length.toLocaleString(lang === 'ar' ? 'ar-EG' : 'en-GB')}
                      </Box>
                    </Box>
                  }
                />
              ))}
            </Tabs>
            <Box sx={{ flex: 1, overflowY: { lg: 'auto' }, p: { xs: 1.5, md: 2 } }} role="tabpanel">
              {tests.isPending ? (
                <Box sx={{ display: 'grid', gap: 1 }} aria-busy>{[0, 1, 2, 3].map((i) => <Skeleton key={i} variant="rounded" height={64} />)}</Box>
              ) : tests.isError ? (
                <Alert severity="error" action={<Button color="inherit" onClick={() => void tests.refetch()}>{t('common.retry')}</Button>}>
                  {t('lab.loadFailed')} {errorMessage(tests.error)}
                </Alert>
              ) : shown.length === 0 ? (
                <Typography sx={{ color: color.muted, p: 1.5 }}>{t(TABS.find((x) => x.key === tab)!.empty)}</Typography>
              ) : (
                <Box component="ul" aria-label={t(TABS.find((x) => x.key === tab)!.label)} sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 0.75 }}>
                  {shown.map((test) => {
                    const w = waited(test)
                    const long = w.minutes >= LONG_WAIT_MINUTES && test.status !== 'AWAITING_REVIEW'
                    const active = test.id === selected?.id
                    return (
                      <li key={test.id}>
                        <ButtonBase
                          onClick={() => {
                            setSelectedId(test.id)
                            setReplacing(false)
                          }}
                          aria-pressed={active}
                          sx={{
                            width: '100%',
                            textAlign: 'start',
                            display: 'grid',
                            gridTemplateColumns: { xs: '1fr auto', sm: oneClinic ? 'minmax(0,1fr) auto' : 'minmax(0,1.3fr) minmax(0,1fr) auto' },
                            alignItems: 'center',
                            columnGap: 2,
                            rowGap: 0.5,
                            px: 2,
                            py: 1.5,
                            borderRadius: '10px',
                            border: `1px solid ${active ? color.brand : color.rule}`,
                            bgcolor: active ? color.brandWash : color.panel,
                            boxShadow: active ? `inset 0 0 0 1px ${color.brand}` : 'none',
                          }}
                        >
                          <Box sx={{ minWidth: 0 }}>
                            <Typography sx={{ fontWeight: 600 }} noWrap><bdi>{test.testName}</bdi></Typography>
                            <Typography variant="body2" sx={{ color: color.muted }} noWrap><bdi>{test.patientName}</bdi></Typography>
                          </Box>
                          <Typography variant="body2" sx={{ color: color.muted, display: { xs: 'none', sm: oneClinic ? 'none' : 'block' } }} noWrap>
                            {localized(test.clinic.name, lang)}
                          </Typography>
                          <Typography variant="body2" className="tabular" sx={{ fontWeight: 600, color: long ? color.consult : color.inkSoft, whiteSpace: 'nowrap' }}>
                            {long ? t('lab.waitingLong', { time: w.text }) : t('lab.waiting', { time: w.text })}
                          </Typography>
                        </ButtonBase>
                      </li>
                    )
                  })}
                </Box>
              )}
            </Box>
          </Paper>

          <Paper component="aside" aria-label={selected ? selected.testName : t('lab.selectTitle')} sx={{ display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
            {!selected ? (
              <Box sx={{ px: 2.5, py: 2.25 }}>
                <Typography variant="h2" component="h2">{t('lab.selectTitle')}</Typography>
                <Typography variant="body2" sx={{ color: color.muted, mt: 0.5, maxWidth: '46ch' }}>{t('lab.selectBody')}</Typography>
              </Box>
            ) : (
              <>
                <Box sx={{ px: 2.5, py: 2, borderBottom: `1px solid ${color.rule}`, display: 'grid', gap: 0.5 }}>
                  <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
                    <Typography variant="h2" component="h2" sx={{ flex: 1, overflowWrap: 'anywhere' }}><bdi>{selected.testName}</bdi></Typography>
                    <TestStatusChip status={selected.status} />
                  </Box>
                  <Typography sx={{ fontWeight: 600 }}><bdi>{selected.patientName}</bdi></Typography>
                  <Typography variant="body2" sx={{ color: color.muted }}>
                    {localized(selected.clinic.name, lang)} · {t('lab.orderedBy', { name: selected.orderedByName })} · {t('lab.orderedAt', { time: formatTime(selected.orderedAt, lang) })}
                  </Typography>
                </Box>
                <Box sx={{ flex: 1, overflowY: { lg: 'auto' }, p: 2.5, display: 'grid', alignContent: 'start', gap: 2.5 }}>
                  <Box>
                    <Typography variant="h3" component="h3" sx={{ color: color.inkSoft, textTransform: 'uppercase', mb: 0.75 }}>{t('lab.instructions')}</Typography>
                    <Typography dir="auto" sx={{ whiteSpace: 'pre-wrap', color: selected.instructions ? color.ink : color.muted }}>
                      {selected.instructions || t('lab.noInstructions')}
                    </Typography>
                  </Box>

                  {selected.status === 'REQUESTED' && (
                    <Box>
                      <Button variant="contained" size="large" startIcon={<PlayArrowRounded />} disabled={start.isPending} onClick={() => start.mutate(selected)}>
                        {start.isPending ? t('lab.starting') : t('lab.start')}
                      </Button>
                    </Box>
                  )}

                  {(selected.status === 'IN_PROGRESS' || (selected.status === 'AWAITING_REVIEW' && replacing)) && (
                    <Box>
                      <Typography variant="h3" component="h3" sx={{ color: color.inkSoft, textTransform: 'uppercase', mb: 1 }}>{t('lab.uploadTitle')}</Typography>
                      <ResultUpload
                        key={selected.id}
                        patientName={selected.patientName}
                        testName={selected.testName}
                        sending={upload.isPending}
                        onSend={(file) => upload.mutate({ test: selected, file }, { onSuccess: () => setReplacing(false) })}
                      />
                    </Box>
                  )}

                  {selected.status === 'AWAITING_REVIEW' && selected.file && !replacing && (
                    <Box sx={{ display: 'grid', gap: 1.25 }}>
                      <Typography variant="h3" component="h3" sx={{ color: color.inkSoft, textTransform: 'uppercase' }}>{t('lab.current')}</Typography>
                      <Typography className="tabular">
                        <Box component="span" sx={{ fontWeight: 600, overflowWrap: 'anywhere' }}>{selected.file.fileName}</Box>
                        <Box component="span" sx={{ color: color.muted }}> · {formatBytes(selected.file.sizeBytes)} · {formatTime(selected.file.uploadedAt, lang)}</Box>
                      </Typography>
                      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                        <Button variant="outlined" startIcon={<OpenInNewRounded />} onClick={() => void openFile(selected)}>{t('lab.viewFile')}</Button>
                        <Button onClick={() => setReplacing(true)}>{t('lab.replace')}</Button>
                      </Box>
                      <Typography variant="body2" sx={{ color: color.muted }}>{t('lab.replaceHint')}</Typography>
                    </Box>
                  )}
                </Box>
              </>
            )}
          </Paper>
        </Box>
      )}
      <Snackbar open={Boolean(toast)} autoHideDuration={toast?.error ? 8000 : 4000} onClose={() => setToast(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert severity={toast?.error ? 'error' : 'success'} variant="filled" onClose={() => setToast(null)} sx={{ minWidth: 320 }}>{toast?.message}</Alert>
      </Snackbar>
    </AppShell>
  )
}
