import MyLocationRounded from '@mui/icons-material/MyLocationRounded'
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
import { checkIn, getClinicQueue, listClinicAppointments, listMyClinics, type Appointment, type Clinic } from '../../lib/api.ts'
import { color } from '../../theme.ts'
import { cairoDate } from '../../time.ts'
import { useNow } from '../../useNow.ts'
import { currentLanguage, errorMessage, localized } from '../../translations/i18n.ts'

/** How often panels ask the server again, until live updates (KAN-27) exist. */
export const REFRESH_MS = 15_000
const CLINIC_KEY = 'wasla.reception.clinic'

function rememberedClinic(): string | null {
  try {
    return localStorage.getItem(CLINIC_KEY)
  } catch {
    return null
  }
}


/**
 * The receptionist's day (KAN-17): today's appointments for one clinic on the
 * day book, one-click check-in, and the clinic's queue beside it.
 */
export function TodayPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [params, setParams] = useSearchParams()
  const now = useNow()
  const today = cairoDate(now)
  const nowRef = useRef<HTMLDivElement>(null)
  const [toast, setToast] = useState<{ message: string; error: boolean } | null>(null)

  const clinics = useQuery({ queryKey: ['me', 'clinics'], queryFn: listMyClinics })
  const clinicList = clinics.data ?? []
  const wanted = params.get('clinic') ?? rememberedClinic()
  const clinic: Clinic | undefined = clinicList.find((c) => c.id === wanted) ?? clinicList[0]
  const clinicId = clinic?.id

  const appointments = useQuery({
    queryKey: ['clinic', clinicId, 'appointments', today],
    queryFn: () => listClinicAppointments(clinicId!, today),
    enabled: Boolean(clinicId),
    refetchInterval: REFRESH_MS,
  })
  const queue = useQuery({
    queryKey: ['clinic', clinicId, 'queue'],
    queryFn: () => getClinicQueue(clinicId!),
    enabled: Boolean(clinicId),
    refetchInterval: REFRESH_MS,
  })

  const refreshAll = () => {
    void queryClient.invalidateQueries({ queryKey: ['clinic', clinicId] })
  }

  const checkInMutation = useMutation({
    mutationFn: (appointment: Appointment) => checkIn(appointment.id),
    onSuccess: (_updated, appointment) => {
      setToast({ message: t('reception.checkedIn', { name: appointment.patient.name }), error: false })
    },
    onError: (error) => setToast({ message: errorMessage(error), error: true }),
    onSettled: refreshAll,
  })

  // Bring the "now" line into view once the day has loaded.
  const scrolledFor = useRef<string | null>(null)
  useEffect(() => {
    if (!appointments.data || scrolledFor.current === clinicId) return
    scrolledFor.current = clinicId ?? null
    nowRef.current?.scrollIntoView({ block: 'center' })
  }, [appointments.data, clinicId])

  const chooseClinic = (id: string) => {
    try {
      localStorage.setItem(CLINIC_KEY, id)
    } catch {
      // Only remembered for this visit when storage is blocked.
    }
    setParams({ clinic: id }, { replace: true })
  }

  const list = appointments.data ?? []
  const count = (status: Appointment['status']) =>
    list.filter((a) => a.status === status).length.toLocaleString(currentLanguage() === 'ar' ? 'ar-EG' : 'en-GB')
  const counts = {
    booked: count('BOOKED'),
    waiting: count('CHECKED_IN'),
    withDoctor: count('IN_CONSULTATION'),
    done: count('COMPLETED'),
  }
  const pendingId = checkInMutation.isPending ? checkInMutation.variables?.id : undefined

  const controls =
    clinicList.length > 1 ? (
      <Select
        size="small"
        value={clinicId ?? ''}
        onChange={(e) => chooseClinic(e.target.value)}
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
      <Typography sx={{ fontWeight: 600, bgcolor: 'rgba(255,255,255,0.12)', px: 1.75, py: 0.75, borderRadius: '8px' }}>
        {localized(clinic.name)}
      </Typography>
    ) : null

  return (
    <AppShell controls={controls}>
      {clinics.isPending ? (
        <Box sx={{ p: 3 }}>
          <Skeleton variant="rounded" height={420} />
        </Box>
      ) : clinics.isError ? (
        <Box sx={{ p: 3 }}>
          <Alert severity="error" action={<Button color="inherit" onClick={() => void clinics.refetch()}>{t('common.retry')}</Button>}>
            {errorMessage(clinics.error)}
          </Alert>
        </Box>
      ) : !clinic ? (
        <Box sx={{ p: 3, maxWidth: 640 }}>
          <Alert severity="info">{t('reception.noClinics')}</Alert>
        </Box>
      ) : (
        <Box
          sx={{
            flex: 1,
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', lg: 'minmax(0,1fr) 400px' },
            gap: 3,
            p: { xs: 2, md: 3 },
            height: { lg: 'calc(100vh - 64px)' },
            minHeight: 0,
          }}
        >
          <Paper component="section" aria-labelledby="today-title" sx={{ display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                flexWrap: 'wrap',
                columnGap: 2,
                rowGap: 0.5,
                px: { xs: 2, md: 2.75 },
                py: 2,
                borderBottom: `1px solid ${color.rule}`,
              }}
            >
              <Box sx={{ minWidth: 0 }}>
                <Typography id="today-title" variant="h2" component="h1">
                  {t('reception.title')}
                </Typography>
                <Typography variant="body2" className="tabular" sx={{ color: color.muted }}>
                  {t('reception.summary', counts)}
                </Typography>
              </Box>
              <Box sx={{ flex: 1 }} />
              <Button size="small" startIcon={<MyLocationRounded />} onClick={() => nowRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })}>
                {t('daybook.jumpToNow')}
              </Button>
              <UpdatedAt at={appointments.dataUpdatedAt} refreshing={appointments.isFetching} onRefresh={refreshAll} />
            </Box>
            <Box sx={{ flex: 1, overflowY: { lg: 'auto' }, px: { xs: 1.5, md: 2.75 }, py: 1.5 }}>
              {appointments.isPending ? (
                <Box sx={{ display: 'grid', gap: 1.25 }} aria-busy>
                  {[0, 1, 2, 3, 4].map((i) => (
                    <Skeleton key={i} variant="rounded" height={58} />
                  ))}
                </Box>
              ) : appointments.isError ? (
                <Alert severity="error" action={<Button color="inherit" onClick={() => void appointments.refetch()}>{t('common.retry')}</Button>}>
                  {t('reception.loadFailed')} {errorMessage(appointments.error)}
                </Alert>
              ) : (
                <>
                  {list.length === 0 && (
                    <Alert severity="info" sx={{ mb: 1.5 }}>
                      {t('reception.noAppointments')}
                    </Alert>
                  )}
                  <DayBook
                    ref={nowRef}
                    appointments={list}
                    now={now}
                    showNow
                    renderAction={(appointment) =>
                      appointment.status === 'BOOKED' ? (
                        <Button
                          variant="contained"
                          fullWidth
                          sx={{ whiteSpace: 'nowrap' }}
                          disabled={Boolean(pendingId)}
                          onClick={() => checkInMutation.mutate(appointment)}
                          aria-label={t('reception.checkInFor', { name: appointment.patient.name })}
                        >
                          {pendingId === appointment.id ? t('reception.checkingIn') : t('reception.checkIn')}
                        </Button>
                      ) : null
                    }
                  />
                </>
              )}
            </Box>
          </Paper>

          <Paper component="aside" aria-labelledby="queue-title" sx={{ display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', px: 2.5, py: 2, borderBottom: `1px solid ${color.rule}` }}>
              <Box sx={{ flex: 1 }}>
                <Typography id="queue-title" variant="h2" component="h2">
                  {t('queue.title')}
                </Typography>
                <Typography variant="body2" sx={{ color: color.muted }}>
                  {localized(clinic.name, currentLanguage())} · {t('queue.location', { building: clinic.building, floor: clinic.floor })}
                </Typography>
              </Box>
              <UpdatedAt at={queue.dataUpdatedAt} refreshing={queue.isFetching} onRefresh={refreshAll} />
            </Box>
            <Box sx={{ flex: 1, overflowY: { lg: 'auto' } }}>
              <QueuePanel board={queue.data} loading={queue.isPending} error={queue.error} onRetry={() => void queue.refetch()} />
            </Box>
          </Paper>
        </Box>
      )}
      <Snackbar
        open={Boolean(toast)}
        autoHideDuration={toast?.error ? 8000 : 4000}
        onClose={() => setToast(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={toast?.error ? 'error' : 'success'} variant="filled" onClose={() => setToast(null)} sx={{ minWidth: 320 }}>
          {toast?.message}
        </Alert>
      </Snackbar>
    </AppShell>
  )
}
