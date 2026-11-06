import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import MenuItem from '@mui/material/MenuItem'
import Paper from '@mui/material/Paper'
import TextField from '@mui/material/TextField'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Typography from '@mui/material/Typography'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { getStatistics, listAdminDepartments, type Statistics } from '../../lib/api.ts'
import { color } from '../../theme.ts'
import { cairoDate } from '../../time.ts'
import { currentLanguage, errorMessage, localized } from '../../translations/i18n.ts'
import { useNow } from '../../useNow.ts'
import { PageBody, PageHeader } from './AdminLayout.tsx'
import { DayChart } from './charts.tsx'
import {
  daysBetween,
  formatCount,
  formatFullDay,
  formatMinutes,
  formatRate,
  lastDays,
  MAX_RANGE_DAYS,
  SINGLE_COLOR,
  visitSeries,
} from './statistics.ts'

type Preset = '7' | '30' | '90' | 'custom'

/**
 * Operational statistics (KAN-20 §5): completed visits per department, the
 * average wait from check-in to the doctor, and the no-show rate, day by day.
 * Counts and averages only, never a patient. "Not available" is never shown as 0.
 */
export function StatisticsPage() {
  const { t } = useTranslation()
  const lang = currentLanguage()
  const today = cairoDate(useNow())
  const [preset, setPreset] = useState<Preset>('7')
  const [custom, setCustom] = useState(() => lastDays(today, 7))
  const [departmentId, setDepartmentId] = useState('')

  const range = preset === 'custom' ? custom : lastDays(today, Number(preset))
  const span = daysBetween(range.from, range.to)
  const rangeError = !range.from || !range.to ? t('stats.rangeIncomplete') : span < 1 ? t('stats.rangeBackwards') : span > MAX_RANGE_DAYS ? t('stats.rangeTooLong', { max: formatCount(MAX_RANGE_DAYS, lang) }) : null

  const departments = useQuery({ queryKey: ['admin-departments'], queryFn: listAdminDepartments })
  const clinical = (departments.data ?? []).filter((d) => d.kind === 'CLINICAL')

  const stats = useQuery({
    queryKey: ['statistics', range.from, range.to, departmentId],
    queryFn: () => getStatistics({ from: range.from, to: range.to, departmentId: departmentId || undefined }),
    enabled: !rangeError,
    placeholderData: keepPreviousData,
  })

  return (
    <PageBody wide>
      <PageHeader title={t('stats.title')} intro={t('stats.intro')} />

      <Box
        role="group"
        aria-label={t('stats.filters')}
        sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', gap: 1.5, mb: 3 }}
      >
        <ToggleButtonGroup
          value={preset}
          exclusive
          onChange={(_, v: Preset | null) => v && setPreset(v)}
          aria-label={t('stats.range')}
          size="small"
          sx={{ bgcolor: color.panel, width: { xs: '100%', sm: 'auto' }, '.MuiToggleButton-root': { flex: { xs: 1, sm: 'none' }, whiteSpace: 'nowrap', px: { xs: 0.75, sm: 1.75 }, fontSize: { xs: '0.8125rem', sm: '0.875rem' }, textTransform: 'none', fontWeight: 600, color: color.inkSoft, '&.Mui-selected': { bgcolor: color.brandTint, color: color.brandDeep } } }}
        >
          <ToggleButton value="7">{t('stats.last7')}</ToggleButton>
          <ToggleButton value="30">{t('stats.last30')}</ToggleButton>
          <ToggleButton value="90">{t('stats.last90')}</ToggleButton>
          <ToggleButton value="custom">{t('stats.custom')}</ToggleButton>
        </ToggleButtonGroup>
        {preset === 'custom' && (
          <Box sx={{ display: 'flex', gap: 1 }}>
            <TextField type="date" size="small" label={t('stats.from')} value={custom.from} onChange={(e) => setCustom({ ...custom, from: e.target.value })} slotProps={{ inputLabel: { shrink: true }, htmlInput: { max: today } }} sx={{ bgcolor: color.panel, width: 168 }} />
            <TextField type="date" size="small" label={t('stats.to')} value={custom.to} onChange={(e) => setCustom({ ...custom, to: e.target.value })} slotProps={{ inputLabel: { shrink: true }, htmlInput: { max: today } }} sx={{ bgcolor: color.panel, width: 168 }} />
          </Box>
        )}
        <TextField
          select
          size="small"
          label={t('stats.department')}
          value={departmentId}
          onChange={(e) => setDepartmentId(e.target.value)}
          sx={{ minWidth: 220, bgcolor: color.panel }}
          slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}
        >
          <MenuItem value="">{t('stats.allDepartments')}</MenuItem>
          {clinical.map((d) => (
            <MenuItem key={d.id} value={d.id}>
              {localized(d.name, lang)}
              {!d.active && ` · ${t('hospital.inactive')}`}
            </MenuItem>
          ))}
        </TextField>
      </Box>

      {rangeError ? (
        <Alert severity="warning">{rangeError}</Alert>
      ) : stats.isPending ? (
        <Box sx={{ p: 6, display: 'grid', placeItems: 'center' }} role="status" aria-label={t('shell.loading')}>
          <CircularProgress size={28} />
        </Box>
      ) : stats.isError ? (
        <Alert severity="error" action={<Button color="inherit" size="small" onClick={() => void stats.refetch()}>{t('common.retry')}</Button>}>
          {t('stats.loadFailed')} {errorMessage(stats.error)}
        </Alert>
      ) : (
        <Box sx={{ opacity: stats.isPlaceholderData ? 0.55 : 1, transition: 'opacity 150ms ease-out' }} aria-busy={stats.isFetching}>
          <Typography variant="body2" sx={{ color: color.muted, mb: 1.5 }}>
            {t('stats.showing', { from: formatFullDay(stats.data.from, lang), to: formatFullDay(stats.data.to, lang) })}
          </Typography>
          <StatsPanels stats={stats.data} order={clinical.map((d) => d.id)} />
        </Box>
      )}
    </PageBody>
  )
}

function StatsPanels({ stats, order }: { stats: Statistics; order: string[] }) {
  const { t } = useTranslation()
  const lang = currentLanguage()
  const dates = stats.days.map((d) => d.date)
  const visits = visitSeries(stats, lang, t('stats.other'), order.length ? order : undefined)
  const empty = stats.days.every((d) => d.visits === null && d.averageWaitMinutes === null && d.noShowRate === null)

  if (empty) {
    return (
      <Paper sx={{ p: 4, textAlign: 'center' }}>
        <Typography sx={{ fontWeight: 600 }}>{t('stats.notAvailable')}</Typography>
        <Typography sx={{ color: color.muted, mt: 0.5 }}>{t('stats.noData')}</Typography>
      </Paper>
    )
  }

  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' }, gap: 2.5 }}>
      <StatPanel
        wide
        title={t('stats.visits.title')}
        definition={t('stats.visits.definition')}
        figure={stats.totals.visits === null ? null : formatCount(stats.totals.visits, lang)}
        figureLabel={t('stats.visits.figure')}
      >
        <DayChart dates={dates} series={visits} kind="columns" format={(v) => formatCount(v, lang)} label={t('stats.visits.title')} total={{ label: t('stats.visits.total') }} />
      </StatPanel>
      <StatPanel
        title={t('stats.wait.title')}
        definition={t('stats.wait.definition')}
        figure={stats.totals.averageWaitMinutes === null ? null : formatMinutes(stats.totals.averageWaitMinutes, lang)}
        figureLabel={t('stats.wait.figure')}
      >
        <DayChart
          dates={dates}
          series={[{ key: 'wait', label: t('stats.wait.title'), color: SINGLE_COLOR, values: stats.days.map((d) => d.averageWaitMinutes) }]}
          kind="line"
          format={(v) => formatMinutes(v, lang)}
          label={t('stats.wait.title')}
        />
      </StatPanel>
      <StatPanel
        title={t('stats.noShow.title')}
        definition={t('stats.noShow.definition')}
        figure={stats.totals.noShowRate === null ? null : formatRate(stats.totals.noShowRate, lang)}
        figureLabel={t('stats.noShow.figure')}
      >
        <DayChart
          dates={dates}
          series={[{ key: 'noShow', label: t('stats.noShow.title'), color: SINGLE_COLOR, values: stats.days.map((d) => d.noShowRate) }]}
          kind="line"
          format={(v) => formatRate(v, lang)}
          label={t('stats.noShow.title')}
        />
      </StatPanel>
    </Box>
  )
}

/** One measure: its name and what it counts, the figure for the whole range, then the day-by-day chart. */
function StatPanel({ title, definition, figure, figureLabel, wide, children }: { title: string; definition: string; figure: string | null; figureLabel: string; wide?: boolean; children: ReactNode }) {
  const { t } = useTranslation()
  return (
    <Paper component="section" aria-label={title} sx={{ p: { xs: 2, md: 3 }, gridColumn: wide ? '1 / -1' : undefined, minWidth: 0 }}>
      <Box sx={{ display: 'flex', flexWrap: { xs: 'wrap', sm: 'nowrap' }, alignItems: 'flex-start', justifyContent: 'space-between', columnGap: 3, rowGap: 1, mb: 2.5 }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="h2" component="h2">
            {title}
          </Typography>
          <Typography variant="body2" sx={{ color: color.muted, mt: 0.5, maxWidth: '52ch' }}>
            {definition}
          </Typography>
        </Box>
        <Box sx={{ textAlign: 'end', ml: 'auto', flexShrink: 0 }}>
          <Typography sx={{ fontSize: figure ? '2rem' : '1.25rem', fontWeight: 600, lineHeight: 1.1, letterSpacing: '-0.01em', color: figure ? color.ink : color.muted }}>
            {figure ?? t('stats.notAvailable')}
          </Typography>
          <Typography variant="body2" sx={{ color: color.muted }}>
            {figureLabel}
          </Typography>
        </Box>
      </Box>
      {children}
    </Paper>
  )
}
