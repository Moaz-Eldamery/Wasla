import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Skeleton from '@mui/material/Skeleton'
import Typography from '@mui/material/Typography'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { QueueBoard } from '../lib/api.ts'
import { color } from '../theme.ts'
import { formatTime } from '../time.ts'
import { currentLanguage, errorMessage } from '../translations/i18n.ts'

interface QueuePanelProps {
  board: QueueBoard | undefined
  loading: boolean
  error: unknown
  onRetry(): void
}

/** Who is with the doctor, then who is waiting, in the order they'll be called. */
export function QueuePanel({ board, loading, error, onRetry }: QueuePanelProps) {
  const { t } = useTranslation()
  const lang = currentLanguage()

  if (loading) {
    return (
      <Box sx={{ p: 2.5, display: 'grid', gap: 1.5 }} aria-busy>
        <Skeleton variant="rounded" height={72} />
        <Skeleton variant="rounded" height={44} />
        <Skeleton variant="rounded" height={44} />
      </Box>
    )
  }
  if (error || !board) {
    return (
      <Box sx={{ p: 2.5 }}>
        <Alert
          severity="error"
          action={
            <Button color="inherit" size="small" onClick={onRetry}>
              {t('common.retry')}
            </Button>
          }
        >
          {t('queue.loadFailed')} {errorMessage(error)}
        </Alert>
      </Box>
    )
  }

  return (
    <Box>
      <SectionTitle>{t('queue.withDoctor')}</SectionTitle>
      {board.inConsultation.length === 0 ? (
        <Empty>{t('queue.nobodyWithDoctor')}</Empty>
      ) : (
        <Box component="ul" sx={{ listStyle: 'none', m: 0, px: 2, display: 'grid', gap: 1 }}>
          {board.inConsultation.map((item) => (
            <Box
              component="li"
              key={item.appointmentId}
              sx={{ bgcolor: color.brand, color: '#FFFFFF', borderRadius: '10px', px: 2, py: 1.5 }}
            >
              <Typography sx={{ fontWeight: 600, fontSize: '1rem' }}>
                <bdi>{item.patientName}</bdi>
              </Typography>
              <Typography variant="body2" sx={{ color: '#D6E6F7' }}>
                <bdi>{item.doctorName}</bdi>
                {item.startedAt && (
                  <>
                    {' · '}
                    {t('reception.withDoctorSince', { time: formatTime(item.startedAt, lang) })}
                  </>
                )}
              </Typography>
            </Box>
          ))}
        </Box>
      )}

      <SectionTitle>
        {t('queue.waiting')}
        <Box component="span" className="tabular" sx={{ color: color.muted, fontWeight: 600 }}>
          {' · '}
          {board.waiting.length.toLocaleString(lang === 'ar' ? 'ar-EG' : 'en-GB')}
        </Box>
      </SectionTitle>
      {board.waiting.length === 0 ? (
        <Empty>{t('queue.nobodyWaiting')}</Empty>
      ) : (
        <Box component="ol" sx={{ listStyle: 'none', m: 0, p: 0, pb: 1 }}>
          {board.waiting.map((item, index) => (
            <Box
              component="li"
              key={item.appointmentId}
              sx={{
                display: 'grid',
                gridTemplateColumns: '36px 1fr auto',
                alignItems: 'center',
                columnGap: 1.5,
                px: 2.5,
                py: 1.25,
                borderTop: `1px solid ${color.ruleSoft}`,
              }}
            >
              <Typography className="tabular" sx={{ fontSize: '1.25rem', fontWeight: 700, color: color.brand }}>
                {(index + 1).toLocaleString(lang === 'ar' ? 'ar-EG' : 'en-GB')}
              </Typography>
              <Box sx={{ minWidth: 0 }}>
                <Typography sx={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  <bdi>{item.patientName}</bdi>
                </Typography>
                <Typography variant="body2" sx={{ color: color.muted }}>
                  <bdi>{item.doctorName}</bdi> · {t('queue.checkedInAt', { time: formatTime(item.checkedInAt, lang) })}
                </Typography>
              </Box>
              {index === 0 && (
                <Typography variant="body2" sx={{ fontWeight: 600, color: color.waiting }}>
                  {t('queue.next')}
                </Typography>
              )}
            </Box>
          ))}
        </Box>
      )}
    </Box>
  )
}

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <Typography variant="h3" component="h3" sx={{ px: 2.5, pt: 2.25, pb: 1, color: color.inkSoft, textTransform: 'uppercase' }}>
      {children}
    </Typography>
  )
}

function Empty({ children }: { children: ReactNode }) {
  return (
    <Typography variant="body2" sx={{ px: 2.5, pb: 1, color: color.muted }}>
      {children}
    </Typography>
  )
}
