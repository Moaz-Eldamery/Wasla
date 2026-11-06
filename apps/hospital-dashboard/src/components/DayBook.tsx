import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import { forwardRef, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { Appointment } from '../lib/api.ts'
import { color } from '../theme.ts'
import { cairoMinutes, formatHour, formatTime } from '../time.ts'
import { currentLanguage } from '../translations/i18n.ts'
import { groupByHour, isLate, layoutDay, type DayEntry } from './dayLayout.ts'
import { StatusChip } from './StatusChip.tsx'

const GUTTER = { xs: '56px', sm: '72px' }
// Phone: stacked. Tablet: time, patient, status, action. Desktop adds the doctor.
const ROW_COLUMNS = {
  xs: '1fr auto',
  sm: '104px minmax(0,1fr) auto minmax(132px,max-content)',
  lg: '112px minmax(0,1.2fr) minmax(0,1fr) auto minmax(140px,max-content)',
}
/** Without the doctor column (a doctor's own day). */
const ROW_COLUMNS_NO_DOCTOR = { ...ROW_COLUMNS, lg: ROW_COLUMNS.sm }

interface DayBookProps {
  appointments: Appointment[]
  /** The current time; the "now" line is drawn only when `showNow` is set (the day shown is today). */
  now: Date
  showNow: boolean
  /** The action at the end of each row, e.g. Check in. */
  renderAction?: (appointment: Appointment) => ReactNode
  /** Show the doctor's name on each row; off on a doctor's own day. */
  showDoctor?: boolean
}

/**
 * The working day as a timetable: hour labels on the start edge, each
 * appointment a row in its hour, and a red "now" line between the rows at the
 * current Cairo time. The parent scrolls; the now line takes the forwarded ref
 * so the page can bring it into view.
 */
export const DayBook = forwardRef<HTMLDivElement, DayBookProps>(function DayBook(
  { appointments, now, showNow, renderAction, showDoctor = true },
  nowRef,
) {
  const { t } = useTranslation()
  const lang = currentLanguage()
  const bands = groupByHour(layoutDay(appointments, showNow ? cairoMinutes(now) : null))
  const nowLabel = t('daybook.nowAt', { time: formatTime(now, lang) })

  const renderEntry = (entry: DayEntry, key: string) => {
    if (entry.kind === 'now') {
      return <NowLine key={key} ref={nowRef} time={formatTime(now, lang)} label={nowLabel} betweenHours={entry.betweenHours} />
    }
    if (entry.kind === 'appointment') {
      return (
        <AppointmentRow
          key={entry.appointment.id}
          appointment={entry.appointment}
          now={now}
          action={renderAction?.(entry.appointment)}
          showDoctor={showDoctor}
        />
      )
    }
    return null
  }

  return (
    <Box role="list" aria-label={t('daybook.label')}>
      {bands.map((band, bandIndex) => (
        <Box key={band.hour} role="presentation">
          {band.before.map((entry, i) => renderEntry(entry, `before-${band.hour}-${i}`))}
          <Box
            role="listitem"
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: `${GUTTER.xs} 1fr`, sm: `${GUTTER.sm} 1fr` },
              borderTop: bandIndex === 0 ? 0 : `1px solid ${color.ruleSoft}`,
            }}
          >
            <Typography component="time" variant="body2" sx={{ pt: 1.75, color: color.muted, fontWeight: 600 }}>
              {formatHour(band.hour, lang)}
            </Typography>
            <Box role="list" sx={{ py: 0.75, minWidth: 0 }}>
              {band.empty && (
                <Typography variant="body2" sx={{ py: 1.25, color: color.muted }}>
                  {t('daybook.emptyHour')}
                </Typography>
              )}
              {band.items.map((entry, i) => renderEntry(entry, `in-${band.hour}-${i}`))}
            </Box>
          </Box>
        </Box>
      ))}
    </Box>
  )
})

function AppointmentRow({ appointment, now, action, showDoctor }: { appointment: Appointment; now: Date; action?: ReactNode; showDoctor: boolean }) {
  const lang = currentLanguage()
  const closed = ['COMPLETED', 'CANCELLED', 'NO_SHOW'].includes(appointment.status)
  const consulting = appointment.status === 'IN_CONSULTATION'
  const late = isLate(appointment, now)
  return (
    <Box
      role="listitem"
      data-status={appointment.status}
      sx={{
        display: 'grid',
        gridTemplateColumns: showDoctor ? ROW_COLUMNS : ROW_COLUMNS_NO_DOCTOR,
        alignItems: 'center',
        columnGap: 2,
        rowGap: 0.75,
        px: 2,
        py: 1.25,
        my: 0.5,
        borderRadius: '10px',
        border: `1px solid ${consulting ? color.consultEdge : color.rule}`,
        bgcolor: consulting ? color.consultTint : closed ? 'transparent' : color.panel,
        color: closed ? color.muted : color.ink,
      }}
    >
      <Typography component="span" className="tabular" sx={{ fontWeight: 600, fontSize: '0.9375rem', color: closed ? color.muted : color.inkSoft }}>
        <time dateTime={appointment.startsAt}>{formatTime(appointment.startsAt, lang)}</time>
        <Box component="span" sx={{ color: color.muted, fontWeight: 400 }}>
          {' – '}
          <time dateTime={appointment.endsAt}>{formatTime(appointment.endsAt, lang)}</time>
        </Box>
      </Typography>
      <Typography
        component="span"
        sx={{
          gridColumn: { xs: '1 / -1', sm: 'auto' },
          gridRow: { xs: 2, sm: 'auto' },
          fontWeight: 600,
          fontSize: '1rem',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          textDecoration: appointment.status === 'CANCELLED' ? 'line-through' : 'none',
        }}
      >
        <bdi>{appointment.patient.name}</bdi>
      </Typography>
      <Typography
        component="span"
        variant="body2"
        dir="auto"
        sx={{ display: { xs: 'none', lg: showDoctor ? 'block' : 'none' }, color: color.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'start' }}
      >
        {appointment.doctor.name}
      </Typography>
      <Box sx={{ justifySelf: { xs: 'end', sm: 'start' } }}>
        <StatusChip status={late ? 'LATE' : appointment.status} />
      </Box>
      <Box sx={{ gridColumn: { xs: '1 / -1', sm: 'auto' }, justifySelf: { xs: 'stretch', sm: 'end' } }}>{action}</Box>
    </Box>
  )
}

interface NowLineProps {
  time: string
  label: string
  /** Between two hour bands the line starts after the hour gutter, like the rows. */
  betweenHours: boolean
}

const NowLine = forwardRef<HTMLDivElement, NowLineProps>(function NowLine({ time, label, betweenHours }, ref) {
  return (
    <Box
      ref={ref}
      role="separator"
      aria-label={label}
      data-testid="now-line"
      sx={{
        position: 'relative',
        height: 0,
        my: 1,
        ml: betweenHours ? GUTTER : 0,
        borderTop: `2px solid ${color.now}`,
        scrollMarginBlock: '35vh',
      }}
    >
      <Box
        component="span"
        className="tabular"
        aria-hidden
        sx={{
          position: 'absolute',
          insetInlineEnd: 0,
          top: -11,
          px: 0.875,
          py: 0.25,
          borderRadius: '6px',
          bgcolor: color.now,
          color: '#FFFFFF',
          fontSize: '0.75rem',
          fontWeight: 700,
          whiteSpace: 'nowrap',
        }}
      >
        {time}
      </Box>
    </Box>
  )
})
