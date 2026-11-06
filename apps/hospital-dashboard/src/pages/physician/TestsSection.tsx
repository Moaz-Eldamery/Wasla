import OpenInNewRounded from '@mui/icons-material/OpenInNewRounded'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import MenuItem from '@mui/material/MenuItem'
import Skeleton from '@mui/material/Skeleton'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { TestStatusChip } from '../../components/StatusChip.tsx'
import {
  downloadTestResult,
  listDepartments,
  listVisitTests,
  orderTest,
  releaseTestResult,
  type Appointment,
  type TestOrder,
} from '../../lib/api.ts'
import { color } from '../../theme.ts'
import { formatTime, REFRESH_MS } from '../../time.ts'
import { currentLanguage, errorMessage, localized } from '../../translations/i18n.ts'

function fileSize(bytes: number): string {
  return bytes >= 1_048_576 ? `${(bytes / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`
}

/** The visit's tests: order one while the patient is here, review and release results. */
export function TestsSection({ appointment, onToast }: { appointment: Appointment; onToast(message: string, error?: boolean): void }) {
  const { t } = useTranslation()
  const lang = currentLanguage()
  const queryClient = useQueryClient()
  const tests = useQuery({
    queryKey: ['tests', appointment.id],
    queryFn: () => listVisitTests(appointment.id),
    refetchInterval: REFRESH_MS,
  })
  const [toRelease, setToRelease] = useState<TestOrder | null>(null)
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['tests', appointment.id] })

  const release = useMutation({
    mutationFn: (test: TestOrder) => releaseTestResult(test.id),
    onSuccess: (test) => onToast(t('tests.released', { test: test.testName })),
    onError: (error) => onToast(errorMessage(error), true),
    onSettled: () => {
      setToRelease(null)
      refresh()
    },
  })

  const openResult = async (test: TestOrder) => {
    // Open the tab now (inside the click) so pop-up blockers allow it, then fill it.
    const tab = window.open('', '_blank')
    try {
      const blob = await downloadTestResult(test.id)
      const url = URL.createObjectURL(blob)
      if (tab) tab.location.href = url
      else window.location.assign(url)
    } catch (error) {
      tab?.close()
      onToast(errorMessage(error), true)
    }
  }

  return (
    <Box sx={{ display: 'grid', gap: 2.5 }}>
      {tests.isPending ? (
        <Skeleton variant="rounded" height={72} />
      ) : tests.isError ? (
        <Alert severity="error" action={<Button color="inherit" onClick={() => void tests.refetch()}>{t('common.retry')}</Button>}>
          {t('tests.loadFailed')} {errorMessage(tests.error)}
        </Alert>
      ) : tests.data.length === 0 ? (
        <Typography variant="body2" sx={{ color: color.muted }}>{t('tests.none')}</Typography>
      ) : (
        <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 1 }}>
          {tests.data.map((test) => (
            <Box
              component="li"
              key={test.id}
              data-status={test.status}
              sx={{
                border: `1px solid ${test.status === 'AWAITING_REVIEW' ? color.consultEdge : color.rule}`,
                bgcolor: test.status === 'AWAITING_REVIEW' ? color.consultTint : color.panel,
                borderRadius: '10px',
                px: 2,
                py: 1.5,
                display: 'grid',
                gap: 1,
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
                <Typography sx={{ fontWeight: 600, flex: 1, minWidth: 0 }} dir="auto">{test.testName}</Typography>
                <TestStatusChip status={test.status} />
              </Box>
              <Typography variant="body2" sx={{ color: color.muted }}>
                {localized(test.clinic.name, lang)} · {t('tests.orderedAt', { time: formatTime(test.orderedAt, lang) })}
                {test.file && <> · {t('tests.fileInfo', { file: test.file.fileName, size: fileSize(test.file.sizeBytes) })}</>}
              </Typography>
              {test.file && (test.status === 'AWAITING_REVIEW' || test.status === 'RELEASED') && (
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                  <Button size="small" variant="outlined" startIcon={<OpenInNewRounded />} onClick={() => void openResult(test)}>
                    {t('tests.viewResult')}
                  </Button>
                  {test.status === 'AWAITING_REVIEW' && (
                    <Button size="small" variant="contained" onClick={() => setToRelease(test)}>
                      {t('tests.release')}
                    </Button>
                  )}
                </Box>
              )}
            </Box>
          ))}
        </Box>
      )}

      {appointment.status === 'IN_CONSULTATION' ? (
        <OrderTestForm appointment={appointment} onToast={onToast} onOrdered={refresh} />
      ) : (
        <Typography variant="body2" sx={{ color: color.muted }}>{t('tests.onlyDuringVisit')}</Typography>
      )}

      <Dialog open={Boolean(toRelease)} onClose={() => setToRelease(null)} maxWidth="xs" fullWidth>
        <DialogTitle>{t('tests.releaseConfirmTitle')}</DialogTitle>
        <DialogContent>
          <Typography>
            {toRelease && t('tests.releaseConfirmBody', { name: appointment.patient.name, test: toRelease.testName })}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setToRelease(null)}>{t('visit.cancel')}</Button>
          <Button variant="contained" disabled={release.isPending} onClick={() => toRelease && release.mutate(toRelease)}>
            {release.isPending ? t('tests.releasing') : t('tests.releaseConfirm')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}

function OrderTestForm({ appointment, onToast, onOrdered }: { appointment: Appointment; onToast(message: string, error?: boolean): void; onOrdered(): void }) {
  const { t } = useTranslation()
  const lang = currentLanguage()
  const departments = useQuery({ queryKey: ['departments'], queryFn: listDepartments, staleTime: 10 * 60_000 })
  const labClinics = (departments.data ?? [])
    .filter((d) => d.kind === 'LAB' || d.kind === 'RADIOLOGY')
    .flatMap((d) => d.clinics.map((c) => ({ clinic: c, department: d })))
  const [clinicId, setClinicId] = useState('')
  const [testName, setTestName] = useState('')
  const [instructions, setInstructions] = useState('')

  const order = useMutation({
    mutationFn: () => orderTest(appointment.id, { clinicId, testName: testName.trim(), instructions: instructions.trim() || null }),
    onSuccess: (test) => {
      onToast(t('tests.ordered', { test: test.testName }))
      setTestName('')
      setInstructions('')
      onOrdered()
    },
    onError: (error) => onToast(errorMessage(error), true),
  })

  const submit = (e: FormEvent) => {
    e.preventDefault()
    order.mutate()
  }

  return (
    <Box component="form" onSubmit={submit} sx={{ display: 'grid', gap: 1.75, pt: 2, borderTop: `1px solid ${color.rule}` }}>
      <Typography variant="h3" component="h3" sx={{ color: color.inkSoft, textTransform: 'uppercase' }}>{t('tests.order')}</Typography>
      <TextField
        select
        label={t('tests.department')}
        value={clinicId}
        onChange={(e) => setClinicId(e.target.value)}
        required
        disabled={departments.isPending}
      >
        {labClinics.map(({ clinic, department }) => (
          <MenuItem key={clinic.id} value={clinic.id}>
            {localized(department.name, lang)} · {localized(clinic.name, lang)}
          </MenuItem>
        ))}
      </TextField>
      <TextField
        label={t('tests.testName')}
        placeholder={t('tests.testNameHint')}
        value={testName}
        onChange={(e) => setTestName(e.target.value)}
        required
        slotProps={{ htmlInput: { dir: 'auto', maxLength: 200 } }}
      />
      <TextField
        label={t('tests.instructions')}
        value={instructions}
        onChange={(e) => setInstructions(e.target.value)}
        multiline
        minRows={2}
        slotProps={{ htmlInput: { dir: 'auto' } }}
      />
      <Box>
        <Button type="submit" variant="contained" disabled={!clinicId || !testName.trim() || order.isPending}>
          {order.isPending ? t('tests.submitting') : t('tests.submit')}
        </Button>
      </Box>
    </Box>
  )
}
