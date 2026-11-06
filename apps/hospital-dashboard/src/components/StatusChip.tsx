import Box from '@mui/material/Box'
import { useTranslation } from 'react-i18next'
import type { AppointmentStatus, TestStatus } from '../lib/api.ts'
import { statusTone, testTone } from '../theme.ts'

/** The visit's status in its own colour. "LATE" marks a booked patient past their time. */
export function StatusChip({ status }: { status: AppointmentStatus | 'LATE' }) {
  const { t } = useTranslation()
  const tone = statusTone[status]
  return (
    <Box
      component="span"
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.75,
        px: 1.25,
        py: 0.375,
        borderRadius: 999,
        fontSize: '0.8125rem',
        fontWeight: 600,
        lineHeight: 1.4,
        color: tone.fg,
        bgcolor: tone.bg,
        whiteSpace: 'nowrap',
      }}
    >
      <Box component="span" aria-hidden sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: tone.fg }} />
      {t(`status.${status}`)}
    </Box>
  )
}

/** A test's status in its own colour; "Ready to review" is amber because it waits on the doctor. */
export function TestStatusChip({ status }: { status: TestStatus }) {
  const { t } = useTranslation()
  const tone = testTone[status]
  return (
    <Box
      component="span"
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.75,
        px: 1.25,
        py: 0.375,
        borderRadius: 999,
        fontSize: '0.8125rem',
        fontWeight: 600,
        lineHeight: 1.4,
        color: tone.fg,
        bgcolor: tone.bg,
        whiteSpace: 'nowrap',
      }}
    >
      <Box component="span" aria-hidden sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: tone.fg }} />
      {t(`tests.status.${status}`)}
    </Box>
  )
}
