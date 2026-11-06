import CloseRounded from '@mui/icons-material/CloseRounded'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import IconButton from '@mui/material/IconButton'
import Tab from '@mui/material/Tab'
import Tabs from '@mui/material/Tabs'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { StatusChip } from '../../components/StatusChip.tsx'
import { completeVisit, getVisitNotes, type Appointment } from '../../lib/api.ts'
import { color } from '../../theme.ts'
import { formatTime } from '../../time.ts'
import { currentLanguage, errorMessage } from '../../translations/i18n.ts'
import { NotesEditor } from './NotesEditor.tsx'
import { TestsSection } from './TestsSection.tsx'

interface VisitPanelProps {
  appointment: Appointment
  /** Shown for a past visit the doctor opened from the day; the current visit can't be closed, only finished. */
  onClose?: () => void
  onToast(message: string, error?: boolean): void
  onFinished(): void
}

/** One visit: who it's with, its notes and its tests, and Finish visit while it's in progress. */
export function VisitPanel({ appointment, onClose, onToast, onFinished }: VisitPanelProps) {
  const { t } = useTranslation()
  const lang = currentLanguage()
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<'notes' | 'tests'>('notes')
  const [confirmNoNotes, setConfirmNoNotes] = useState(false)

  const finish = useMutation({
    mutationFn: () => completeVisit(appointment.id),
    onSuccess: () => {
      onToast(t('visit.finished', { name: appointment.patient.name }))
      onFinished()
    },
    onError: (error) => onToast(errorMessage(error), true),
    onSettled: () => setConfirmNoNotes(false),
  })

  const askToFinish = async () => {
    // Allowed without notes, but the doctor is warned first (agreed rule for KAN-18).
    const cached = queryClient.getQueryData(['notes', appointment.id])
    const notes = cached !== undefined ? cached : await getVisitNotes(appointment.id).catch(() => null)
    if (notes) finish.mutate()
    else setConfirmNoNotes(true)
  }

  const inProgress = appointment.status === 'IN_CONSULTATION'
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: 0, height: '100%' }}>
      <Box
        sx={{
          px: 2.5,
          py: 2,
          bgcolor: inProgress ? color.brand : color.panel,
          color: inProgress ? '#FFFFFF' : color.ink,
          borderBottom: `1px solid ${color.rule}`,
          display: 'grid',
          gridTemplateColumns: '1fr auto',
          gap: 1,
        }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="body2" sx={{ color: inProgress ? '#D6E6F7' : color.muted, fontWeight: 600 }}>
            {t('visit.label')} · <time dateTime={appointment.startsAt}>{formatTime(appointment.startsAt, lang)}</time>
          </Typography>
          <Typography variant="h2" component="h2" sx={{ overflowWrap: 'anywhere' }}>
            <bdi>{appointment.patient.name}</bdi>
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
          {!inProgress && <StatusChip status={appointment.status} />}
          {onClose && (
            <Tooltip title={t('visit.close')}>
              <IconButton size="small" onClick={onClose} aria-label={t('visit.close')} sx={{ color: 'inherit' }}>
                <CloseRounded fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
        </Box>
        {inProgress && (
          <Box sx={{ gridColumn: '1 / -1', pt: 0.5 }}>
            <Button
              variant="contained"
              onClick={() => void askToFinish()}
              disabled={finish.isPending}
              sx={{ bgcolor: '#FFFFFF', color: color.brand, '&:hover': { bgcolor: color.brandTint } }}
            >
              {finish.isPending ? t('visit.finishing') : t('visit.finish')}
            </Button>
          </Box>
        )}
      </Box>

      <Tabs value={tab} onChange={(_e, v) => setTab(v)} sx={{ px: 1.5, borderBottom: `1px solid ${color.rule}` }}>
        <Tab value="notes" label={t('visit.tabNotes')} />
        <Tab value="tests" label={t('visit.tabTests')} />
      </Tabs>
      <Box sx={{ flex: 1, overflowY: { lg: 'auto' }, p: 2.5 }} role="tabpanel">
        {tab === 'notes' ? (
          <NotesEditor key={appointment.id} appointmentId={appointment.id} onToast={onToast} />
        ) : (
          <TestsSection appointment={appointment} onToast={onToast} />
        )}
      </Box>

      <Dialog open={confirmNoNotes} onClose={() => setConfirmNoNotes(false)} maxWidth="xs" fullWidth>
        <DialogTitle>{t('visit.finishNoNotesTitle')}</DialogTitle>
        <DialogContent>
          <Typography>{t('visit.finishNoNotesBody')}</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmNoNotes(false)}>{t('visit.cancel')}</Button>
          <Button variant="contained" onClick={() => finish.mutate()} disabled={finish.isPending}>
            {t('visit.finishAnyway')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
