import CampaignRounded from '@mui/icons-material/CampaignRounded'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import MenuItem from '@mui/material/MenuItem'
import Paper from '@mui/material/Paper'
import Select from '@mui/material/Select'
import Skeleton from '@mui/material/Skeleton'
import Snackbar from '@mui/material/Snackbar'
import Typography from '@mui/material/Typography'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router'
import { AppShell } from '../../components/AppShell.tsx'
import { DayBook } from '../../components/DayBook.tsx'
import { QueuePanel } from '../../components/QueuePanel.tsx'
import { UpdatedAt } from '../../components/UpdatedAt.tsx'
import {
  ApiError,
  callNextPatient,
  getClinicQueue,
  listDoctorAppointments,
  listMyClinics,
  type Appointment,
  type Clinic,
} from '../../lib/api.ts'
import { color } from '../../theme.ts'
import { cairoDate, REFRESH_MS } from '../../time.ts'
import { currentLanguage, errorMessage, localized } from '../../translations/i18n.ts'
import { useNow } from '../../useNow.ts'
import { VisitPanel } from './VisitPanel.tsx'

const CLINIC_KEY = 'wasla.doctor.clinic'

/**
 * The doctor's day (KAN-18): their appointments on the day book, Call next
 * for the chosen clinic, and the visit panel beside it for the patient with
 * them (notes, tests, results). Any visit of the day can be opened to read
 * its notes or release results that came in later.
 */
export function DoctorPage() {
  const { t } = useTranslation()
  const lang = currentLanguage()
  const queryClient = useQueryClient()
  const [params, setParams] = useSearchParams()
  const now = useNow()
  const today = cairoDate(now)
  const nowRef = useRef<HTMLDivElement>(null)
  const [toast, setToast] = useState<{ message: string; error: boolean } | null>(null)
  const [openedId, setOpenedId] = useState<string | null>(null)
  const notify = (message: string, error = false) => setToast({ message, error })

  const clinics = useQuery({ queryKey: ['me', 'clinics'], queryFn: listMyClinics })
  const clinicList = clinics.data ?? []
  let remembered: string | null = null
  try {
    remembered = localStorage.getItem(CLINIC_KEY)
  } catch {
    // Storage blocked: fall back to the first clinic.
  }
  const wanted = params.get('clinic') ?? remembered
  const clinic: Clinic | undefined = clinicList.find((c) => c.id === wanted) ?? clinicList[0]

  const appointments = useQuery({
    queryKey: ['doctor', 'appointments', today],
    queryFn: () => listDoctorAppointments(today),
    refetchInterval: REFRESH_MS,
  })
  const queue = useQuery({
    queryKey: ['clinic', clinic?.id, 'queue'],
    queryFn: () => getClinicQueue(clinic!.id),
    enabled: Boolean(clinic),
    refetchInterval: REFRESH_MS,
  })

  const list = appointments.data ?? []
  const current = list.find((a) => a.status === 'IN_CONSULTATION')
  const opened = list.find((a) => a.id === openedId)
  const shown = current ?? opened

  const refreshAll = () => {
    void queryClient.invalidateQueries({ queryKey: ['doctor'] })
    void queryClient.invalidateQueries({ queryKey: ['clinic'] })
  }

  const callNext = useMutation({
    mutationFn: () => callNextPatient(clinic!.id),
    onSuccess: (appointment) => {
      setOpenedId(null)
      notify(t('doctor.called', { name: appointment.patient.name }))
    },
    onError: (error) => {
      if (error instanceof ApiError && error.code === 'QUEUE_EMPTY') notify(t('doctor.queueEmpty'), true)
      else if (error instanceof ApiError && error.code === 'ALREADY_IN_CONSULTATION') notify(t('doctor.finishCurrentFirst'), true)
      else notify(errorMessage(error), true)
    },
    onSettled: refreshAll,
  })

  const scrolled = useRef(false)
  useEffect(() => {
    if (!appointments.data || scrolled.current) return
    scrolled.current = true
    nowRef.current?.scrollIntoView({ block: 'center' })
  }, [appointments.data])

  const count = (status: Appointment['status']) =>
    list.filter((a) => a.status === status).length.toLocaleString(lang === 'ar' ? 'ar-EG' : 'en-GB')
  const waitingCount = queue.data?.waiting.length ?? 0

  const controls =
    clinicList.length > 1 ? (
      <Select
        size="small"
        value={clinic?.id ?? ''}
        onChange={(e) => {
          try {
            localStorage.setItem(CLINIC_KEY, e.target.value)
          } catch {
            // Only for this visit when storage is blocked.
          }
          setParams({ clinic: e.target.value }, { replace: true })
        }}
        inputProps={{ 'aria-label': t('shell.clinic') }}
        sx={{
          color: '#FFFFFF',
          bgcolor: 'rgba(255,255,255,0.12)',
          fontWeight: 600,
          maxWidth: { xs: 190, sm: 320 },
          '.MuiSelect-select': { overflow: 'hidden', textOverflow: 'ellipsis' },
          '.MuiOutlinedInput-notchedOutline': { border: 0 },
          '.MuiSvgIcon-root': { color: '#FFFFFF' },
        }}
      >
        {clinicList.map((c) => (
          <MenuItem key={c.id} value={c.id}>
            {localized(c.name)}
          </MenuItem>
        ))}
      </Select>
    ) : clinic ? (
      <Typography sx={{ fontWeight: 600, bgcolor: 'rgba(255,255,255,0.12)', px: 1.75, py: 0.75, borderRadius: '8px', whiteSpace: 'nowrap' }}>
        {localized(clinic.name)}
      </Typography>
    ) : null

  return (
    <AppShell controls={controls}>
      {clinics.isPending ? (
        <Box sx={{ p: 3 }}>
          <Skeleton variant="rounded" height={420} />
        </Box>
      ) : !clinic ? (
        <Box sx={{ p: 3, maxWidth: 640 }}>
          <Alert severity="info">{t('doctor.noClinics')}</Alert>
        </Box>
      ) : (
        <Box
          sx={{
            flex: 1,
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', lg: 'minmax(0,1fr) minmax(400px, 36%)' },
            gap: 3,
            p: { xs: 2, md: 3 },
            height: { lg: 'calc(100vh - 64px)' },
            minHeight: 0,
          }}
        >
          <Paper component="section" aria-labelledby="doctor-title" sx={{ display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden', order: { xs: 2, lg: 1 } }}>
            <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', columnGap: 2, rowGap: 1, px: { xs: 2, md: 2.75 }, py: 2, borderBottom: `1px solid ${color.rule}` }}>
              <Box sx={{ minWidth: 0 }}>
                <Typography id="doctor-title" variant="h2" component="h1">
                  {t('doctor.title')}
                </Typography>
                <Typography variant="body2" className="tabular" sx={{ color: color.muted }}>
                  {t('doctor.summary', { waiting: count('CHECKED_IN'), withMe: count('IN_CONSULTATION'), done: count('COMPLETED'), booked: count('BOOKED') })}
                </Typography>
              </Box>
              <Box sx={{ flex: 1 }} />
              <UpdatedAt at={appointments.dataUpdatedAt} refreshing={appointments.isFetching} onRefresh={refreshAll} />
              <Button
                variant="contained"
                size="large"
                startIcon={<CampaignRounded />}
                onClick={() => callNext.mutate()}
                disabled={callNext.isPending || Boolean(current)}
                title={current ? t('doctor.finishCurrentFirst') : undefined}
              >
                {callNext.isPending ? t('doctor.calling') : t('doctor.callNext')}
                {!current && waitingCount > 0 && (
                  <Box component="span" className="tabular" sx={{ ml: 1, px: 0.875, borderRadius: 999, bgcolor: 'rgba(255,255,255,0.22)', fontSize: '0.8125rem' }}>
                    {waitingCount.toLocaleString(lang === 'ar' ? 'ar-EG' : 'en-GB')}
                  </Box>
                )}
              </Button>
            </Box>
            <Box sx={{ flex: 1, overflowY: { lg: 'auto' }, px: { xs: 1.5, md: 2.75 }, py: 1.5 }}>
              {appointments.isPending ? (
                <Box sx={{ display: 'grid', gap: 1.25 }} aria-busy>
                  {[0, 1, 2, 3].map((i) => (
                    <Skeleton key={i} variant="rounded" height={58} />
                  ))}
                </Box>
              ) : appointments.isError ? (
                <Alert severity="error" action={<Button color="inherit" onClick={() => void appointments.refetch()}>{t('common.retry')}</Button>}>
                  {t('doctor.loadFailed')} {errorMessage(appointments.error)}
                </Alert>
              ) : (
                <>
                  {list.length === 0 && <Alert severity="info" sx={{ mb: 1.5 }}>{t('doctor.noAppointments')}</Alert>}
                  <DayBook
                    ref={nowRef}
                    appointments={list}
                    now={now}
                    showNow
                    showDoctor={false}
                    renderAction={(a) =>
                      a.status === 'COMPLETED' ? (
                        <Button
                          variant={shown?.id === a.id ? 'contained' : 'outlined'}
                          fullWidth
                          onClick={() => setOpenedId(a.id)}
                          aria-label={t('doctor.openVisitFor', { name: a.patient.name })}
                          aria-pressed={shown?.id === a.id}
                          sx={{ whiteSpace: 'nowrap' }}
                        >
                          {t('doctor.open')}
                        </Button>
                      ) : null
                    }
                  />
                </>
              )}
            </Box>
          </Paper>

          <Paper component="aside" aria-label={t('visit.label')} sx={{ display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden', order: { xs: 1, lg: 2 } }}>
            {shown ? (
              <VisitPanel
                key={shown.id}
                appointment={shown}
                onClose={current ? undefined : () => setOpenedId(null)}
                onToast={notify}
                onFinished={() => {
                  setOpenedId(null)
                  refreshAll()
                }}
              />
            ) : (
              <>
                <Box sx={{ px: 2.5, py: 2.25, borderBottom: `1px solid ${color.rule}` }}>
                  <Typography variant="h2" component="h2">{t('doctor.noVisitTitle')}</Typography>
                  <Typography variant="body2" sx={{ color: color.muted, mt: 0.5, maxWidth: '46ch' }}>{t('doctor.noVisitBody')}</Typography>
                </Box>
                <Typography variant="body2" sx={{ px: 2.5, pt: 2, color: color.inkSoft, fontWeight: 600 }}>
                  {t('doctor.waitingHere', { clinic: localized(clinic.name, lang) })}
                </Typography>
                <Box sx={{ flex: 1, overflowY: { lg: 'auto' } }}>
                  <QueuePanel board={queue.data} loading={queue.isPending} error={queue.error} onRetry={() => void queue.refetch()} />
                </Box>
              </>
            )}
          </Paper>
        </Box>
      )}
      <Snackbar open={Boolean(toast)} autoHideDuration={toast?.error ? 8000 : 4000} onClose={() => setToast(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert severity={toast?.error ? 'error' : 'success'} variant="filled" onClose={() => setToast(null)} sx={{ minWidth: 320 }}>
          {toast?.message}
        </Alert>
      </Snackbar>
    </AppShell>
  )
}
